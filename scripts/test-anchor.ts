// 锚定层的确定性往返测试（headless，happy-dom）。
// 验证 advisor 强调的两条不变量：
//   #1 extractText 与「覆盖全 root 的 range.toString」逐字节一致
//   往返：rangeToSelector → offsetToRange 恢复相同文本，尤其边界 case
import { Window } from 'happy-dom';
const win = new Window();
const g = globalThis as unknown as Record<string, unknown>;
g.document = win.document;
g.NodeFilter = win.NodeFilter;
g.Node = win.Node;
g.window = win;

import { extractText, offsetToRange, rangeToSelector } from '../src/annotate/text-offset';
import { matchQuote } from '../src/annotate/match-quote';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

function makeRoot(html: string): HTMLElement {
  document.body.innerHTML = `<div data-annotate-root data-doc-id="test">${html}</div>`;
  return document.querySelector('[data-annotate-root]') as HTMLElement;
}

// 选中「渲染文本」里第一次出现 needle 的那段，返回 Range
function selectText(root: HTMLElement, needle: string): Range {
  const full = extractText(root);
  const start = full.indexOf(needle);
  if (start < 0) throw new Error(`needle 不在文本里: ${needle}`);
  const r = offsetToRange(root, start, start + needle.length);
  if (!r) throw new Error('offsetToRange 返回 null');
  return r;
}

// 模拟 MDX 渲染结构：含 <strong>（inline 加粗，制造文本节点边界）、多段
const HTML = `
  <p>大多数教材把卡尔曼滤波讲成五个矩阵递推式。</p>
  <p>换个角度：<strong>KF 本质上是一次正交投影</strong>。残差与子空间正交。</p>
  <p>这就是新息不携带可用信息的含义。</p>
`;

console.log('\n[不变量 #1] extractText(Range) === TreeWalker 拼接（offsetToRange 依赖此一致）');
{
  const root = makeRoot(HTML);
  // offsetToRange 用 TreeWalker 累加 nodeValue 定位偏移；extractText 用 Range.toString。
  // 两者必须逐字节一致，否则偏移会错位。用独立的 TreeWalker 拼接交叉验证 ——
  // 若将来把 extractText 改成 textContent 提速，这条会立刻抓到分歧。
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let viaWalker = '';
  let n: Node | null;
  while ((n = walker.nextNode())) viaWalker += n.nodeValue ?? '';
  check('Range 提取 === TreeWalker 拼接', extractText(root) === viaWalker,
    `\n    range =${JSON.stringify(extractText(root).slice(0, 40))}\n    walker=${JSON.stringify(viaWalker.slice(0, 40))}`);
}

console.log('\n[往返] rangeToSelector → offsetToRange 恢复同一段文本');
{
  const root = makeRoot(HTML);
  for (const needle of ['卡尔曼滤波', 'KF 本质上是一次正交投影', '残差与子空间正交']) {
    const r = selectText(root, needle);
    const sel = rangeToSelector(root, r)!;
    check(`selector.exact 正确: ${needle}`, sel.exact === needle, `得到 ${JSON.stringify(sel.exact)}`);
    const back = offsetToRange(root, sel.start, sel.end)!;
    check(`往返 toString 一致: ${needle}`, back.toString() === needle, `得到 ${JSON.stringify(back.toString())}`);
  }
}

console.log('\n[边界] 选区起点正好在 <strong> 开头（跨文本节点边界）');
{
  const root = makeRoot(HTML);
  // exact 从 <strong> 内文本开头开始，prefix 在 strong 外的前一个文本节点
  const needle = 'KF 本质上是一次正交投影';
  const r = selectText(root, needle);
  const sel = rangeToSelector(root, r)!;
  check('边界起点 exact 精确', sel.exact === needle, JSON.stringify(sel.exact));
  check('边界 prefix 含冒号', sel.prefix.endsWith('：'), JSON.stringify(sel.prefix));
  check('边界 suffix 以句号开头', sel.suffix.startsWith('。'), JSON.stringify(sel.suffix));
}

console.log('\n[锚定存活] 改前后文、保留 exact，仍高分锚定');
{
  const root = makeRoot(HTML);
  const needle = 'KF 本质上是一次正交投影';
  const r = selectText(root, needle);
  const sel = rangeToSelector(root, r)!;
  // 模拟 Claude 改了前后文（但没动 exact 那句）
  const changed = makeRoot(HTML.replace('换个角度：', '从投影的视角看：').replace('残差与子空间正交。', '这一点非常关键。'));
  const m = matchQuote(extractText(changed), sel.exact, { prefix: sel.prefix, suffix: sel.suffix, hint: sel.start });
  check('改前后文后仍找到', m !== null);
  // exact 完美(占 50%)，prefix+suffix 各改(各占 20%)会拉低分，但仍应远超失锚阈值 0.5
  check('分数仍稳健（>0.7）', !!m && m.score > 0.7, m ? `score=${m.score.toFixed(3)}` : 'null');
  if (m) {
    const back = offsetToRange(changed, m.start, m.end)!;
    check('锚回的文本 === 原 exact', back.toString() === needle, JSON.stringify(back.toString()));
  }
}

console.log('\n[失锚] exact 那句被删掉，分数应很低');
{
  const root = makeRoot(HTML);
  const sel = rangeToSelector(root, selectText(root, 'KF 本质上是一次正交投影'))!;
  const gutted = makeRoot(HTML.replace('<strong>KF 本质上是一次正交投影</strong>', '一堆完全无关的其它文字内容'));
  const m = matchQuote(extractText(gutted), sel.exact, { prefix: sel.prefix, suffix: sel.suffix, hint: sel.start });
  // 允许 matchQuote 返回一个低分匹配（近似算法总会给最佳候选），关键是分数低于阈值 0.5
  check('分数低于阈值 0.5（判为失锚）', !m || m.score < 0.5, m ? `score=${m.score.toFixed(3)}` : 'null');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
