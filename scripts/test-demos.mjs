// 把构建产物里的三个演示组件放进 happy-dom 真跑一遍：
// 确认它们能初始化、能渲染出内容、交互按钮真的改变 DOM。
import { Window } from 'happy-dom';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync('dist/courses/cs336/lecture-01/index.html', 'utf8');

// 收集页面上所有会跑的脚本：内联的 + 外链到 dist/_astro/ 的
const scripts = [];
for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1];
  const src = /src="([^"]+)"/.exec(attrs)?.[1];
  if (src) {
    if (src.includes('ClientRouter')) continue; // 视图切换，不是演示逻辑
    scripts.push(readFileSync('dist' + src, 'utf8'));
  } else if (m[2].trim() && !m[2].includes('localStorage.getItem')) {
    scripts.push(m[2]);
  }
}

const window = new Window({ url: 'https://example.com/courses/cs336/lecture-01' });
window.document.write(html);
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder;

let ran = 0;
for (const code of scripts) {
  try {
    window.eval(code);
    ran++;
  } catch (e) {
    console.error('✗ 脚本抛错:', e.message);
    process.exitCode = 1;
  }
}
console.log(`跑了 ${ran}/${scripts.length} 段脚本`);

const doc = window.document;
const q = (s) => doc.querySelector(s);
const fail = (msg) => {
  console.error('✗ ' + msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log('✓ ' + msg);

// ── Utf8Explorer ──
const cells = q('[data-demo="utf8"] [data-cells]');
if (!cells || cells.children.length === 0) fail('Utf8Explorer 没渲染出字符格子');
else {
  // 默认 "Hi 你好 🌍" = 6 个字符（含两个空格）
  const n = cells.children.length;
  const sum = q('[data-demo="utf8"] [data-sum]').textContent;
  ok(`Utf8Explorer 渲染了 ${n} 个格子；统计行：${sum.trim()}`);
  if (!/字节/.test(sum)) fail('Utf8Explorer 统计行不对');
}

// ── TokenizerLab ──
const rows = q('[data-demo="toklab"] [data-rows]');
if (!rows || rows.children.length !== 4) fail(`TokenizerLab 应该有 4 行，实际 ${rows?.children.length}`);
else {
  ok('TokenizerLab 渲染了 4 行（字符 / 字节 / 词 / BPE）');
  for (const row of rows.children) {
    const name = row.querySelector('.name').textContent;
    const stat = row.querySelector('.stat').textContent.replace(/\s+/g, ' ');
    const toks = row.querySelector('.toks').children.length;
    if (toks === 0) fail(`${name} 这一行没切出 token`);
    console.log(`   ${name}：${toks} 个 token —— ${stat}`);
  }
  // 字节分词那一行压缩率必须正好是 1.00
  const byteStat = rows.children[1].querySelector('.stat').textContent;
  if (!/压缩率 1\.00/.test(byteStat)) fail('字节分词的压缩率不是 1.00，和讲义里的说法对不上');
  else ok('字节分词压缩率 = 1.00，与讲义一致');
}

// ── BpeTrainer ──
const seq = q('[data-demo="bpe"] [data-seq]');
if (!seq || seq.children.length === 0) fail('BpeTrainer 没渲染出初始序列');
else {
  const before = seq.children.length; // "the cat in the hat" = 18 字节
  ok(`BpeTrainer 初始序列 ${before} 个 token`);
  if (before !== 18) fail('初始序列应该是 18 个字节');

  // 点三次「下一次合并」
  const stepBtn = q('[data-demo="bpe"] [data-step]');
  for (let i = 0; i < 3; i++) stepBtn.click();

  const after = seq.children.length;
  const merges = q('[data-demo="bpe"] [data-merges]').children.length;
  const tally = q('[data-demo="bpe"] [data-tally]').textContent.replace(/\s+/g, ' ');
  ok(`点三次合并后：序列 ${before} → ${after} 个 token，学到 ${merges} 条合并`);
  console.log('   ' + tally.trim());
  if (after !== 12) fail('三次合并后应该是 12 个 token（讲义里写的）');
  if (merges !== 3) fail('应该学到 3 条合并');
  if (!/压缩率 1\.50/.test(tally)) fail('压缩率应该是 1.50，和讲义里的数字对不上');
  else ok('压缩率 1.50，与讲义一致');

  // 切到编码面板（用户就是这么做的：切标签页会重绘并解锁按钮），再全部套用
  doc.querySelector('[data-demo="bpe"] .tabs button[data-tab="encode"]').click();
  q('[data-demo="bpe"] [data-enc-all]').click();
  const encTally = q('[data-demo="bpe"] [data-enc-tally]').textContent.replace(/\s+/g, ' ');
  const encSeq = q('[data-demo="bpe"] [data-enc-seq]').children.length;
  ok(`编码面板：${encTally.trim()}（序列 ${encSeq} 个 token）`);
  if (!/套用了 3 \/ 3/.test(encTally)) fail('编码面板没把 3 条合并全部套完');
}

if (!process.exitCode) console.log('\n全部通过。');
