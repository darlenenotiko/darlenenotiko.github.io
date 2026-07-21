#!/usr/bin/env node
/**
 * 隐私边界检查。
 *
 * 往 _inbox/ 和 private/ 各放一个探针文件，跑一次真实构建，
 * 然后在 dist/ 里搜索探针内容。这验证的是「构建产物里没有私密内容」这件事本身，
 * 而不是「.gitignore 看起来写对了」。
 *
 * 每次发布前跑一次：npm run verify
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANARY = 'BOUNDARY_CANARY_' + 'DO_NOT_PUBLISH_7X2Q';
const probes = ['_inbox/.boundary-probe.md', 'private/.boundary-probe.md'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let failed = false;
try {
  for (const p of probes) {
    mkdirSync(p.split('/')[0], { recursive: true });
    writeFileSync(p, `---\ntitle: ${CANARY}\n---\n\n${CANARY} 这段文字绝不能出现在 dist/ 里。\n`);
  }

  console.log('→ 构建中…');
  // 用 execSync（走 shell）而非 execFileSync('npx')：后者在 Windows 上找不到 npx.cmd
  execSync('npx astro build', { stdio: 'inherit' });

  const leaked = walk('dist').filter((f) => {
    try {
      return readFileSync(f, 'utf8').includes(CANARY);
    } catch {
      return false; // 二进制文件
    }
  });

  if (leaked.length) {
    failed = true;
    console.error('\n✗ 隐私边界失败 —— 以下产物包含私密内容：');
    leaked.forEach((f) => console.error('   ' + f));
    console.error('\n检查 src/content.config.ts 的 loader base，以及是否有页面直接读了 _inbox/ 或 private/。');
  } else {
    console.log('\n✓ 隐私边界成立：dist/ 中没有 _inbox/ 或 private/ 的内容。');
  }
} finally {
  probes.forEach((p) => rmSync(p, { force: true }));
}

process.exit(failed ? 1 : 0);
