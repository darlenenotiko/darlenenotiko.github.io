/**
 * 文本偏移 ↔ DOM Range 的胶水层。
 *
 * 不移植 Hypothesis 的 text-range.ts（它连带 trim-range / xpath，为完整 anchor 体系服务），
 * 只用标准 DOM 实现这个本地场景需要的三件事。
 *
 * 不变量（最关键）：capture（rangeToSelector）和 match（喂给 matchQuote 的文本）
 * 必须看到「逐字节相同」的文本。因此**只有一个** extractText，两个方向都用它；
 * 偏移计算也全部基于同一套 Range.toString 语义。任何分歧都会让高亮悄悄错位、
 * 却看着像 matchQuote 出错。
 */

export interface TextSelector {
  exact: string;
  prefix: string;
  suffix: string;
  /** TextPositionSelector：作为 matchQuote 的 hint，失效无害 */
  start: number;
  end: number;
}

/**
 * 提取容器的全部文本。所有偏移都相对于「这一份提取」才有意义。
 * 用 Range.toString 而非 textContent，好与 offsetOf 同源、逐字节一致。
 */
export function extractText(root: HTMLElement): string {
  const r = document.createRange();
  r.selectNodeContents(root);
  return r.toString();
}

/**
 * 一个 DOM 边界点 (container, offset) 在 extractText(root) 里对应的字符偏移。
 * 用「从 root 起点到该点的 Range」的 toString().length —— 与 extractText 同源。
 * 对 text 节点，offset 是字符偏移；对 element，offset 是子节点索引，两种都正确处理。
 */
function offsetOf(root: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(container, offset);
  return r.toString().length;
}

/** 从选区 Range 生成 selector（含 exact + 前后上下文 + 位置 hint）。 */
export function rangeToSelector(
  root: HTMLElement,
  range: Range,
  ctx = 20,
): TextSelector | null {
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start >= end) return null;

  const full = extractText(root);
  return {
    exact: full.slice(start, end),
    prefix: full.slice(Math.max(0, start - ctx), start),
    suffix: full.slice(end, Math.min(full.length, end + ctx)),
    start,
    end,
  };
}

/**
 * 把字符偏移区间 [start, end) 映射回 DOM Range。
 * 用 TreeWalker 按文本节点累加长度定位 —— 累加语义与 Range.toString 一致
 * （都只拼接文本节点内容）。
 *
 * 边界规则（由往返测试驱动，不凭记忆）：
 *  - start 用 `<`：偏移正好落在两个文本节点交界时，归到「后一个节点的开头」
 *  - end 用 `<=`：交界时归到「前一个节点的末尾」
 * 这样一段选区的首尾都贴着可见文本，不会落进空节点。
 */
export function offsetToRange(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let lastNode: Node | null = null;
  let lastLen = 0;

  let n: Node | null;
  while ((n = walker.nextNode())) {
    const len = (n.nodeValue ?? '').length;
    lastNode = n;
    lastLen = len;
    if (startNode === null && start < pos + len) {
      startNode = n;
      startOffset = start - pos;
    }
    if (end <= pos + len) {
      endNode = n;
      endOffset = end - pos;
      break;
    }
    pos += len;
  }

  // 兜底：start 恰好等于全文末尾（作为区间起点极罕见），归到最后一个节点末尾
  if (startNode === null && lastNode) {
    startNode = lastNode;
    startOffset = lastLen;
  }
  // 兜底：end 超过全文长度，钳到最后一个节点末尾
  if (endNode === null && lastNode) {
    endNode = lastNode;
    endOffset = lastLen;
  }
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
