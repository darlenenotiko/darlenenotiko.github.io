// 把构建产物里的演示组件放进 happy-dom 真跑一遍：
// 确认它们能初始化、能渲染出内容、交互按钮真的改变 DOM。
//
// 两层检查：
//   1. 通用层 —— 遍历 dist/courses/ 下每一讲，跑完页面上所有脚本，
//      要求零抛错、且每个 [data-demo] 根节点都渲染出了内容（不是空壳）。
//   2. 断言层 —— 第 1 讲的三个组件有课上给的确切数字，逐个核对。
//
// 跑之前要先 npm run build。
import { Window } from 'happy-dom';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let failed = false;
const fail = (msg) => {
  console.error('✗ ' + msg);
  failed = true;
};
const ok = (msg) => console.log('✓ ' + msg);

/** 把一个构建好的页面装进 happy-dom，跑完它的脚本，返回 window */
function boot(pagePath) {
  const html = readFileSync(pagePath, 'utf8');

  // 收集页面上所有会跑的脚本：内联的 + 外链到 dist/_astro/ 的
  const scripts = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = /src="([^"]+)"/.exec(m[1])?.[1];
    if (src) {
      if (src.includes('ClientRouter')) continue; // 视图切换，不是演示逻辑
      scripts.push(readFileSync('dist' + src, 'utf8'));
    } else if (m[2].trim() && !m[2].includes('localStorage.getItem')) {
      scripts.push(m[2]);
    }
  }

  const window = new Window({ url: 'https://example.com' + pagePath.replace(/^dist/, '') });
  window.document.write(html);
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;

  // happy-dom 不实现 canvas 的 2D 上下文，getContext 会返回 null，
  // 于是所有画图的组件一上来就抛错 —— 那样等于对它们完全失明。
  // 这里塞一个只记账不画画的桩：绘图调用照单全收，但 measureText 之类
  // 有返回值的要给出合理结果，好让组件里的布局计算能真的跑一遍。
  const ctxStub = () => {
    const noop = () => {};
    const ctx = new Proxy(
      {
        measureText: (t) => ({ width: String(t).length * 7 }),
        createLinearGradient: () => ({ addColorStop: noop }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        canvas: null,
      },
      {
        get: (target, prop) => (prop in target ? target[prop] : noop),
        set: () => true,
      },
    );
    return ctx;
  };
  const HTMLCanvasElement = window.HTMLCanvasElement;
  if (HTMLCanvasElement) {
    HTMLCanvasElement.prototype.getContext = function (kind) {
      return kind === '2d' ? ctxStub() : null;
    };
  }

  const errors = [];
  for (const code of scripts) {
    try {
      window.eval(code);
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { window, errors, scriptCount: scripts.length };
}

// ─────────────────────────────────────────────────────────────
// 1. 通用层：每一讲都过一遍
// ─────────────────────────────────────────────────────────────
const root = 'dist/courses/cs336';
const lectures = existsSync(root)
  ? readdirSync(root)
      .filter((d) => existsSync(`${root}/${d}/index.html`))
      .sort()
  : [];

if (!lectures.length) fail('dist/courses/cs336 下没有构建产物 —— 先跑 npm run build');

for (const lec of lectures) {
  const { window, errors, scriptCount } = boot(`${root}/${lec}/index.html`);
  const doc = window.document;
  const demos = [...doc.querySelectorAll('[data-demo]')];

  if (errors.length) {
    for (const e of errors) fail(`${lec} 脚本抛错: ${e}`);
    continue;
  }
  if (!demos.length) {
    console.log(`· ${lec}：没有演示组件，跳过`);
    continue;
  }

  // 拖一下每个滑块 / 勾一下每个复选框，控件本身必须还留在文档里。
  // 有的组件在 input 事件里 replaceChildren 重建整块 DOM，把控件自己也换掉了 ——
  // 表现是「拖到一半失去焦点、根本拖不动」，只看初始渲染发现不了。
  for (const ctl of doc.querySelectorAll('[data-demo] input[type="range"], [data-demo] input[type="checkbox"]')) {
    const demo = ctl.closest('[data-demo]').dataset.demo;
    try {
      if (ctl.type === 'range') {
        const min = Number(ctl.min || 0);
        const max = Number(ctl.max || 100);
        ctl.value = String(min + Math.round((max - min) * 0.7));
      } else {
        ctl.checked = !ctl.checked;
      }
      ctl.dispatchEvent(new window.Event('input', { bubbles: true }));
      ctl.dispatchEvent(new window.Event('change', { bubbles: true }));
    } catch (e) {
      fail(`${lec} 的 ${demo} 控件事件抛错: ${e.message}`);
      continue;
    }
    if (!doc.contains(ctl)) {
      fail(`${lec} 的 ${demo}：交互后控件自己被重建掉了（拖不动的那种 bug）`);
    }
  }

  const empty = demos.filter((d) => d.textContent.trim().length < 20);
  if (empty.length) {
    for (const d of empty) fail(`${lec} 的 [data-demo="${d.dataset.demo}"] 初始化后是空的`);
  } else {
    ok(
      `${lec}：${scriptCount} 段脚本零抛错，${demos.length} 个演示都渲染出内容 ` +
        `(${demos.map((d) => d.dataset.demo).join(', ')})`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 2. 断言层：第 1 讲的确切数字（都来自课堂内容）
// ─────────────────────────────────────────────────────────────
const page = `${root}/lecture-01/index.html`;
if (existsSync(page)) {
  const { window } = boot(page);
  const doc = window.document;
  const q = (s) => doc.querySelector(s);

  // 字节分词的压缩率按定义恒为 1
  const rows = q('[data-demo="toklab"] [data-rows]');
  if (rows?.children.length !== 4) fail(`TokenizerLab 应该有 4 行，实际 ${rows?.children.length}`);
  else if (!/压缩率 1\.00/.test(rows.children[1].querySelector('.stat').textContent))
    fail('字节分词的压缩率不是 1.00，和讲义里的说法对不上');
  else ok('第 1 讲 TokenizerLab：四行齐全，字节分词压缩率 = 1.00');

  // BPE 在 "the cat in the hat" 上跑三步：18 → 12 个 token，压缩率 1.50
  const seq = q('[data-demo="bpe"] [data-seq]');
  if (seq?.children.length !== 18) fail(`BpeTrainer 初始应为 18 个字节，实际 ${seq?.children.length}`);
  else {
    const stepBtn = q('[data-demo="bpe"] [data-step]');
    for (let i = 0; i < 3; i++) stepBtn.click();
    const tally = q('[data-demo="bpe"] [data-tally]').textContent.replace(/\s+/g, ' ');
    if (seq.children.length !== 12) fail(`三次合并后应为 12 个 token，实际 ${seq.children.length}`);
    else if (!/压缩率 1\.50/.test(tally)) fail(`压缩率应为 1.50，实际：${tally}`);
    else ok('第 1 讲 BpeTrainer：三次合并 18 → 12 个 token，压缩率 1.50');

    // 切到编码面板把学到的合并全部套用
    doc.querySelector('[data-demo="bpe"] .tabs button[data-tab="encode"]').click();
    q('[data-demo="bpe"] [data-enc-all]').click();
    const encTally = q('[data-demo="bpe"] [data-enc-tally]').textContent.replace(/\s+/g, ' ');
    if (!/套用了 3 \/ 3/.test(encTally)) fail(`编码面板没套完三条合并：${encTally}`);
    else ok('第 1 讲 BpeTrainer 编码面板：三条合并全部套用');
  }
}

console.log(failed ? '\n有检查未通过。' : '\n全部通过。');
process.exit(failed ? 1 : 0);
