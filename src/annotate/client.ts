// 批注客户端入口。
// 仅在 astro dev 期间由 src/integrations/annotate.mjs 注入，生产构建里不存在。
//
// 分层：加载数据 → 锚定（match-quote + offset↔range）→ CSS Highlight 渲染 → margin rail。
// 锚定原语暴露到 window.__anno，供在浏览器 console 跑往返测试。

import { matchQuote } from './match-quote';
import { extractText, offsetToRange, rangeToSelector, type TextSelector } from './text-offset';

const ENDPOINT = '/__annotate';
// 锚定分数低于此值视为失锚（orphaned）。阈值在调用方定，不落盘。
const SCORE_THRESHOLD = 0.5;

interface Mark {
  id: string;
  doc: string;
  kind: 'highlight' | 'underline';
  selector: TextSelector;
  note?: string;
  createdAt: string;
}
interface AnnoRequest {
  id: string;
  doc: string;
  selector: TextSelector;
  ask: string;
  status: 'pending' | 'done';
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}
interface AnnotationData {
  version: number;
  marks: Mark[];
  requests: AnnoRequest[];
}
type Op = Record<string, unknown> & { op: string };

const EMPTY: AnnotationData = { version: 1, marks: [], requests: [] };

// 当前页所有 rail 条目，供 resize / 字体加载 / details 折叠后重新布局
interface RailItem {
  kind: 'highlight' | 'underline' | 'request';
  range: Range;
  mark?: Mark;
  request?: AnnoRequest;
}
let currentRailItems: RailItem[] = [];
// 当前页所有已锚定的 mark（含纯高亮/下划线），供右键 hit-test 定位到点击处的高亮
let currentMarks: { mark: Mark; range: Range }[] = [];

// ── 数据 ────────────────────────────────────────────────────
async function loadData(): Promise<AnnotationData> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return { ...EMPTY };
    return (await res.json()) as AnnotationData;
  } catch {
    return { ...EMPTY };
  }
}

async function sendOp(op: Op): Promise<void> {
  await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  });
}

// ── 锚定 ────────────────────────────────────────────────────
function anchor(
  root: HTMLElement,
  sel: TextSelector,
): { range: Range; score: number } | null {
  const text = extractText(root);
  const m = matchQuote(text, sel.exact, {
    prefix: sel.prefix,
    suffix: sel.suffix,
    hint: sel.start,
  });
  if (!m) return null;
  const range = offsetToRange(root, m.start, m.end);
  if (!range) return null;
  return { range, score: m.score };
}

// ── 渲染（CSS Custom Highlight API）─────────────────────────
const HL_KEYS = ['anno-highlight', 'anno-underline', 'anno-request'] as const;

function renderHighlights(groups: {
  highlight: Range[];
  underline: Range[];
  request: Range[];
}) {
  // 特性检测：无 Highlight API 时静默跳过（rail 仍可用）
  if (!('highlights' in CSS)) return;
  for (const k of HL_KEYS) CSS.highlights.delete(k);
  if (groups.highlight.length)
    CSS.highlights.set('anno-highlight', new Highlight(...groups.highlight));
  if (groups.underline.length)
    CSS.highlights.set('anno-underline', new Highlight(...groups.underline));
  if (groups.request.length)
    CSS.highlights.set('anno-request', new Highlight(...groups.request));
}

// ── margin rail ─────────────────────────────────────────────
function relayoutRail() {
  const rail = document.getElementById('anno-rail');
  if (!rail) return;
  rail.style.height = `${document.documentElement.scrollHeight}px`;

  // 先收集每个可见标记的目标 top（对应高亮行的顶部）
  const placed: { child: HTMLElement; top: number }[] = [];
  for (const child of Array.from(rail.children) as HTMLElement[]) {
    const idx = Number(child.dataset.idx);
    const item = currentRailItems[idx];
    if (!item) continue;
    const rects = item.range.getClientRects();
    if (!rects.length) {
      // 折叠的 <details> 里等：暂时藏起来，toggle 后会重算
      child.style.display = 'none';
      continue;
    }
    child.style.display = '';
    placed.push({ child, top: rects[0].top + window.scrollY });
  }

  // 防重叠：同一行（或挨得太近）的标记 top 相同，会互相覆盖。
  // 按 top 排序后依次下推，让它们竖直排开而不重叠。
  const STEP = 21; // 标记尺寸(20) + 1px 间隙
  placed.sort((a, b) => a.top - b.top);
  let lastBottom = -Infinity;
  for (const p of placed) {
    const top = p.top < lastBottom ? lastBottom : p.top;
    p.child.style.top = `${top}px`;
    lastBottom = top + STEP;
  }
}

function buildRail(items: RailItem[]) {
  currentRailItems = items;
  document.getElementById('anno-rail')?.remove();
  if (!items.length) return;

  const rail = document.createElement('div');
  rail.id = 'anno-rail';

  items.forEach((it, idx) => {
    const marker = document.createElement('button');
    marker.className = `anno-marker anno-marker--${it.kind}`;
    marker.dataset.idx = String(idx);
    if (it.kind === 'request') {
      const done = it.request?.status === 'done';
      marker.textContent = done ? '○' : '◆';
      marker.classList.toggle('is-done', done);
      marker.title = done ? '已处理（点击审阅）' : '待 Claude 处理';
    } else {
      marker.textContent = '●';
      marker.title = it.mark?.note ? it.mark.note : '标记';
    }
    marker.addEventListener('click', () => openCard(it, marker));
    rail.appendChild(marker);
  });

  document.body.appendChild(rail);
  relayoutRail();
}

// ── 卡片（点 rail 标记展开）────────────────────────────────
function openCard(item: RailItem, marker: HTMLElement) {
  document.getElementById('anno-card')?.remove();
  const card = document.createElement('div');
  card.id = 'anno-card';

  const rect = marker.getBoundingClientRect();
  card.style.top = `${rect.top + window.scrollY}px`;

  if (item.kind === 'request' && item.request) {
    const r = item.request;
    card.innerHTML = `
      <div class="anno-card-label">给 AI 的批注 · ${r.status === 'done' ? '已处理' : '待处理'}</div>
      <div class="anno-card-quote">“${escapeHtml(r.selector.exact)}”</div>
      <div class="anno-card-ask">${escapeHtml(r.ask)}</div>
      ${r.resolution ? `<div class="anno-card-res"><b>Claude：</b>${escapeHtml(r.resolution)}</div>` : ''}
    `;
    const actions = document.createElement('div');
    actions.className = 'anno-card-actions';
    if (r.status === 'done') {
      actions.appendChild(button('关闭这条', async () => {
        await sendOp({ op: 'closeRequest', id: r.id });
        closeCard();
        init();
      }));
    }
    actions.appendChild(button('删除', async () => {
      await sendOp({ op: 'deleteRequest', id: r.id });
      closeCard();
      init();
    }, 'danger'));
    card.appendChild(actions);
  } else if (item.mark) {
    const m = item.mark;
    card.innerHTML = `
      <div class="anno-card-label">${m.kind === 'underline' ? '下划线' : '高亮'}</div>
      <div class="anno-card-quote">“${escapeHtml(m.selector.exact)}”</div>
    `;
    const ta = document.createElement('textarea');
    ta.placeholder = '写点批注…';
    ta.value = m.note ?? '';
    card.appendChild(ta);
    const actions = document.createElement('div');
    actions.className = 'anno-card-actions';
    actions.appendChild(button('保存', async () => {
      await sendOp({ op: 'updateNote', id: m.id, note: ta.value });
      closeCard();
      init();
    }));
    actions.appendChild(button('删除', async () => {
      await sendOp({ op: 'deleteMark', id: m.id });
      closeCard();
      init();
    }, 'danger'));
    card.appendChild(actions);
  }

  document.body.appendChild(card);
}

function closeCard() {
  document.getElementById('anno-card')?.remove();
}

function button(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = variant ? `anno-btn anno-btn--${variant}` : 'anno-btn';
  b.addEventListener('click', onClick);
  return b;
}

// ── 失锚顶部面板 ────────────────────────────────────────────
interface Orphan {
  type: 'mark' | 'request';
  item: Mark | AnnoRequest;
}

function buildOrphanPanel(orphans: Orphan[]) {
  document.getElementById('anno-orphans')?.remove();
  if (!orphans.length) return;

  const panel = document.createElement('div');
  panel.id = 'anno-orphans';
  const head = document.createElement('div');
  head.className = 'anno-orphans-head';
  head.textContent = `${orphans.length} 条批注失去了锚点`;
  panel.appendChild(head);

  for (const o of orphans) {
    const row = document.createElement('div');
    row.className = 'anno-orphan-row';
    const label =
      o.type === 'request'
        ? (o.item as AnnoRequest).ask
        : (o.item as Mark).note || '(高亮)';
    const q = document.createElement('span');
    q.className = 'anno-orphan-quote';
    q.textContent = `“${o.item.selector.exact}”`;
    const desc = document.createElement('span');
    desc.textContent = ` — ${label}`;
    row.append(q, desc);
    row.appendChild(
      button('删除', async () => {
        await sendOp(
          o.type === 'request'
            ? { op: 'deleteRequest', id: o.item.id }
            : { op: 'deleteMark', id: o.item.id },
        );
        init();
      }, 'danger'),
    );
    panel.appendChild(row);
  }

  const main = document.querySelector('main') ?? document.body;
  main.insertBefore(panel, main.firstChild);
}

// ── 样式（dev-only 注入，生产零批注 CSS）──────────────────
function injectStyles() {
  if (document.getElementById('anno-style')) return;
  const style = document.createElement('style');
  style.id = 'anno-style';
  style.textContent = `
    ::highlight(anno-highlight) {
      background-color: color-mix(in srgb, var(--weld) 40%, transparent);
    }
    ::highlight(anno-underline) {
      text-decoration-line: underline;
      text-decoration-color: var(--madder);
      text-decoration-style: solid;
      text-decoration-thickness: 2px;
    }
    ::highlight(anno-request) {
      background-color: color-mix(in srgb, var(--indigo) 24%, transparent);
    }
    #anno-rail {
      position: absolute;
      top: 0;
      right: max(6px, calc((100vw - var(--page)) / 2 - 26px));
      width: 20px;
      pointer-events: none;
      z-index: 40;
    }
    .anno-marker {
      position: absolute;
      right: 0;
      width: 20px;
      height: 20px;
      display: grid;
      place-items: center;
      padding: 0;
      border: none;
      background: none;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      pointer-events: auto;
      color: var(--ink-muted);
      transition: transform 0.15s var(--ease), color 0.15s var(--ease);
    }
    .anno-marker:hover { transform: scale(1.35); }
    .anno-marker--highlight, .anno-marker--underline { color: var(--madder); }
    .anno-marker--request { color: var(--indigo); }
    .anno-marker--request.is-done { color: var(--ink-faint); }
    #anno-card {
      position: absolute;
      right: max(30px, calc((100vw - var(--page)) / 2));
      width: 260px;
      background: var(--bg-raised);
      border: 1px solid var(--rule);
      border-radius: 10px;
      padding: 0.8rem 0.9rem;
      box-shadow: 0 12px 34px -14px color-mix(in srgb, var(--ink) 40%, transparent);
      z-index: 60;
      font-size: 0.85rem;
    }
    .anno-card-label { font-size: 0.72rem; letter-spacing: 0.05em; color: var(--ink-faint); text-transform: uppercase; }
    .anno-card-quote { margin: 0.4rem 0; font-style: italic; color: var(--ink-muted); }
    .anno-card-ask { margin: 0.3rem 0; }
    .anno-card-res { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--rule); color: var(--ink-muted); }
    #anno-card textarea { width: 100%; min-height: 60px; margin: 0.4rem 0; font: inherit; font-size: 0.85rem; border: 1px solid var(--rule); border-radius: 6px; padding: 0.4rem; background: var(--bg); color: var(--ink); resize: vertical; }
    .anno-card-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
    .anno-btn { flex: 1; padding: 0.35rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--bg); color: var(--ink); font: inherit; font-size: 0.8rem; cursor: pointer; }
    .anno-btn:hover { border-color: var(--accent); color: var(--accent); }
    .anno-btn--danger:hover { border-color: var(--madder); color: var(--madder); }
    #anno-orphans {
      margin-bottom: 1.5rem;
      padding: 0.9rem 1.1rem;
      border: 1px solid color-mix(in srgb, var(--madder) 40%, var(--rule));
      border-radius: 10px;
      background: color-mix(in srgb, var(--madder) 6%, var(--bg-raised));
      font-size: 0.88rem;
    }
    .anno-orphans-head { font-weight: 650; color: var(--madder); margin-bottom: 0.5rem; }
    .anno-orphan-row { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.25rem 0; }
    .anno-orphan-quote { font-style: italic; color: var(--ink-muted); }
    .anno-orphan-row .anno-btn { flex: none; margin-left: auto; padding: 0.15rem 0.5rem; font-size: 0.75rem; }
    #anno-menu {
      position: absolute;
      z-index: 70;
      background: var(--bg-raised);
      border: 1px solid var(--rule);
      border-radius: 8px;
      padding: 0.3rem;
      box-shadow: 0 12px 34px -14px color-mix(in srgb, var(--ink) 45%, transparent);
      display: flex;
      flex-direction: column;
      min-width: 132px;
    }
    .anno-menu-item {
      text-align: left;
      padding: 0.4rem 0.6rem;
      border: none;
      background: none;
      font: inherit;
      font-size: 0.85rem;
      color: var(--ink);
      border-radius: 5px;
      cursor: pointer;
    }
    .anno-menu-item:hover {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--accent);
    }
    @media (max-width: 1180px) {
      #anno-rail { right: 4px; }
      #anno-card { right: 8px; }
    }
  `;
  document.head.appendChild(style);
}

// ── 右键菜单（造新批注）────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function selectionContext(): { root: HTMLElement; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.toString().trim()) return null;
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const root = el?.closest<HTMLElement>('[data-annotate-root]') ?? null;
  if (!root) return null;
  return { root, range };
}

// 命中测试：点击坐标落在哪个已锚定 mark 上。
// Highlight 不接收鼠标事件，用各 range 的 rects 手动判定 —— 让纯高亮（无 rail 标记）也能被右键管理。
function markAt(x: number, y: number): { mark: Mark; range: Range } | null {
  for (const entry of currentMarks) {
    for (const rect of Array.from(entry.range.getClientRects())) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return entry;
      }
    }
  }
  return null;
}

function closeMenu() {
  document.getElementById('anno-menu')?.remove();
}

function buildMenu(x: number, y: number, items: { label: string; fn: () => void }[]) {
  closeMenu();
  const menu = document.createElement('div');
  menu.id = 'anno-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'anno-menu-item';
    b.textContent = it.label;
    b.addEventListener('click', () => { closeMenu(); it.fn(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  // 防溢出视口
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = `${x - r.width}px`;
  if (r.bottom > window.innerHeight) menu.style.top = `${y - r.height}px`;
}

// 有选中文本时的新建菜单
function showMenu(x: number, y: number, ctx: { root: HTMLElement; range: Range }) {
  buildMenu(x, y, [
    { label: '🖍 高亮', fn: () => createMark(ctx, 'highlight', false) },
    { label: '﹍ 下划线', fn: () => createMark(ctx, 'underline', false) },
    { label: '✎ 加批注', fn: () => createMark(ctx, 'highlight', true) },
    { label: '◆ 提问给 AI', fn: () => createRequest(ctx) },
  ]);
}

// 右键点在已有高亮/下划线上时的管理菜单
function showMarkMenu(x: number, y: number, entry: { mark: Mark; range: Range }) {
  const m = entry.mark;
  buildMenu(x, y, [
    { label: m.note ? '✎ 改批注' : '✎ 加批注', fn: () => editNote(m) },
    {
      label: `🗑 删除${m.kind === 'underline' ? '下划线' : '高亮'}`,
      fn: async () => { await sendOp({ op: 'deleteMark', id: m.id }); init(); },
    },
  ]);
}

async function editNote(m: Mark) {
  const input = window.prompt('批注内容：', m.note ?? '');
  if (input === null) return;
  await sendOp({ op: 'updateNote', id: m.id, note: input });
  init();
}

async function createMark(
  ctx: { root: HTMLElement; range: Range },
  kind: 'highlight' | 'underline',
  withNote: boolean,
) {
  const sel = rangeToSelector(ctx.root, ctx.range, 20);
  if (!sel) return;
  let note: string | undefined;
  if (withNote) {
    const input = window.prompt('批注内容：');
    if (input === null) return;
    note = input;
  }
  const mark: Mark = {
    id: genId('m'),
    doc: ctx.root.dataset.docId ?? '',
    kind,
    selector: sel,
    note,
    createdAt: new Date().toISOString(),
  };
  await sendOp({ op: 'addMark', mark });
  window.getSelection()?.removeAllRanges();
  init();
}

async function createRequest(ctx: { root: HTMLElement; range: Range }) {
  const sel = rangeToSelector(ctx.root, ctx.range, 20);
  if (!sel) return;
  const ask = window.prompt('想让 AI 补充 / 回答什么？');
  if (!ask) return;
  const request: AnnoRequest = {
    id: genId('r'),
    doc: ctx.root.dataset.docId ?? '',
    selector: sel,
    ask,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await sendOp({ op: 'addRequest', request });
  window.getSelection()?.removeAllRanges();
  init();
}

// ── 工具 ────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

// ── 清理 ────────────────────────────────────────────────────
function cleanup() {
  if ('highlights' in CSS) for (const k of HL_KEYS) CSS.highlights.delete(k);
  document.getElementById('anno-rail')?.remove();
  document.getElementById('anno-card')?.remove();
  document.getElementById('anno-orphans')?.remove();
  document.getElementById('anno-menu')?.remove();
  currentRailItems = [];
  currentMarks = [];
}

// ── 主流程 ──────────────────────────────────────────────────
async function init() {
  cleanup();
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>('[data-annotate-root]'),
  );
  if (!roots.length) return;

  injectStyles();
  const data = await loadData();

  const groups = { highlight: [] as Range[], underline: [] as Range[], request: [] as Range[] };
  const railItems: RailItem[] = [];
  const orphans: Orphan[] = [];

  for (const root of roots) {
    const docId = root.dataset.docId ?? '';
    for (const mark of data.marks.filter((m) => m.doc === docId)) {
      const a = anchor(root, mark.selector);
      if (!a || a.score < SCORE_THRESHOLD) {
        orphans.push({ type: 'mark', item: mark });
        continue;
      }
      (mark.kind === 'underline' ? groups.underline : groups.highlight).push(a.range);
      currentMarks.push({ mark, range: a.range });
      // 只有带批注内容的 mark 才在 rail 显示标记；纯高亮/下划线只渲染视觉，右键管理。
      if (mark.note && mark.note.trim()) {
        railItems.push({ kind: mark.kind, range: a.range, mark });
      }
    }
    for (const req of data.requests.filter((r) => r.doc === docId)) {
      const a = anchor(root, req.selector);
      if (!a || a.score < SCORE_THRESHOLD) {
        orphans.push({ type: 'request', item: req });
        continue;
      }
      groups.request.push(a.range);
      railItems.push({ kind: 'request', range: a.range, request: req });
    }
  }

  renderHighlights(groups);
  buildRail(railItems);
  buildOrphanPanel(orphans);

  // 供 console 往返测试：__anno.roundtrip(root, r) 等
  (window as unknown as { __anno: unknown }).__anno = {
    extractText, offsetToRange, rangeToSelector, matchQuote, anchor, roots, data,
  };

  console.info(
    `[annotate] ${railItems.length} 已锚定 · ${orphans.length} 失锚 · ${roots.length} 容器`,
  );
}

// ── 生命周期 ────────────────────────────────────────────────
// ClientRouter 陷阱：injectScript('page') 首次执行一次，swap 不重跑，必须挂事件。
let relayoutTimer = 0;
function scheduleRelayout() {
  clearTimeout(relayoutTimer);
  relayoutTimer = window.setTimeout(relayoutRail, 120);
}

init();
document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', cleanup);
window.addEventListener('resize', scheduleRelayout);
// 字体加载后行高/换行会变，rail 位置需重算
if (document.fonts?.ready) document.fonts.ready.then(relayoutRail);
// <details> 折叠/展开改变布局 —— 捕获阶段监听 toggle
document.addEventListener('toggle', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'DETAILS') scheduleRelayout();
}, true);
// 关卡片：点空白处
document.addEventListener('click', (e) => {
  const card = document.getElementById('anno-card');
  if (card) {
    const t = e.target as HTMLElement;
    if (!card.contains(t) && !t.classList.contains('anno-marker')) closeCard();
  }
  // 点空白关右键菜单
  const menu = document.getElementById('anno-menu');
  if (menu && !menu.contains(e.target as Node)) closeMenu();
});

// 右键：
//  有选中文本 → 新建菜单（高亮/下划线/加批注/提问 AI）
//  无选区但点在已有高亮上 → 管理菜单（加/改批注、删除）
//  都不是 → 放行浏览器原生菜单
document.addEventListener('contextmenu', (e) => {
  const ctx = selectionContext();
  if (ctx) {
    e.preventDefault();
    showMenu(e.pageX, e.pageY, ctx);
    return;
  }
  const hit = markAt(e.clientX, e.clientY);
  if (hit) {
    e.preventDefault();
    showMarkMenu(e.pageX, e.pageY, hit);
    return;
  }
  closeMenu();
});
