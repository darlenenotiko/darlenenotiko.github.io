import fs from 'node:fs';
import path from 'node:path';

/**
 * 笔记批注系统的 dev-only integration。
 *
 * 两个 hook：
 *  - astro:config:setup  仅在 `astro dev` 时注入客户端脚本；build/preview/sync 时
 *                        根本不调用 injectScript，Astro 因此完全不知道该脚本存在。
 *  - astro:server:setup  只在 dev server 上挂一个写盘端点。
 *
 * 生产构建里连一行批注代码都不存在 —— 这是结构性保证，不是运行时判断。
 * 与 src/content.config.ts 的 loader base 同一性质：让错误的事情不可能发生。
 */

const ENDPOINT = '/__annotate';

// 写入目标硬编码，绝不从请求体取路径。私密文件，不进版本库、不进构建。
const DATA_FILE = path.join(process.cwd(), 'private', 'annotations.json');

const EMPTY = { version: 1, marks: [], requests: [] };

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // 容错：字段缺失时补齐，避免下游 .push 崩溃
    return {
      version: parsed.version ?? 1,
      marks: Array.isArray(parsed.marks) ? parsed.marks : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function atomicWrite(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  // 写临时文件再 rename，中途崩溃也不会留下半份损坏的 JSON
  fs.renameSync(tmp, DATA_FILE);
}

/**
 * 应用一个操作到数据上（原地修改 data）。
 * 浏览器只发操作、不发整份文件 —— 这样浏览器写标记时不会覆盖掉
 * Claude Code 在同一文件里更新的 request.status。
 */
function applyOp(data, op) {
  switch (op.op) {
    case 'addMark':
      if (!op.mark || !op.mark.id) throw new Error('addMark 缺少 mark.id');
      data.marks.push(op.mark);
      return;
    case 'deleteMark':
      data.marks = data.marks.filter((m) => m.id !== op.id);
      return;
    case 'updateNote': {
      const m = data.marks.find((x) => x.id === op.id);
      if (m) m.note = op.note;
      return;
    }
    case 'relocateMark': {
      // 失锚后手动重定位：替换 selector
      const m = data.marks.find((x) => x.id === op.id);
      if (m && op.selector) m.selector = op.selector;
      return;
    }
    case 'addRequest':
      if (!op.request || !op.request.id) throw new Error('addRequest 缺少 request.id');
      data.requests.push(op.request);
      return;
    case 'deleteRequest':
      data.requests = data.requests.filter((r) => r.id !== op.id);
      return;
    case 'closeRequest': {
      // 用户在页边栏审阅完 Claude 的处理后手动关闭（从队列移除）
      data.requests = data.requests.filter((r) => r.id !== op.id);
      return;
    }
    default:
      throw new Error(`未知操作: ${op.op}`);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default function annotate() {
  return {
    name: 'annotate',
    hooks: {
      'astro:config:setup'({ command, injectScript }) {
        // build / preview / sync 一律跳过 —— 生产零批注代码
        if (command !== 'dev') return;
        injectScript('page', `import '/src/annotate/client.ts';`);
      },

      'astro:server:setup'({ server, logger }) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url || '').split('?')[0];
          if (url !== ENDPOINT) return next();

          res.setHeader('Content-Type', 'application/json; charset=utf-8');

          try {
            if (req.method === 'GET') {
              res.statusCode = 200;
              res.end(JSON.stringify(readData()));
              return;
            }

            if (req.method === 'POST') {
              const op = JSON.parse(await readBody(req));
              const data = readData();
              applyOp(data, op);
              atomicWrite(data);
              logger.info(`${op.op} → private/annotations.json`);
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, data }));
              return;
            }

            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`批注端点出错: ${message}`);
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: message }));
          }
        });

        logger.info(`批注端点已挂载（仅 dev）: POST/GET ${ENDPOINT}`);
      },
    },
  };
}
