// 讲义覆盖率的机械核查。
//
// 逐句核对只能人工做，但有一类遗漏可以机械抓出来：字幕里出现的**专有名词和具体数字**
// 是跨语言不变的（模型名、数据集名、benchmark 名、参数量、百分比…）。
// 如果老师在课上说了「Chinchilla」「1.4T」「92.6%」而中文讲义里一次都没出现，
// 那多半是漏了一段。
//
// 用法：node scripts/check-coverage.mjs <讲次号>...
//   例：node scripts/check-coverage.mjs 10 11 13
//
// 输出的是**候选遗漏**，不是判决 —— 需要人工过一遍：有些词老师只是随口一提，
// 有些是 ASR 拼错，有些在讲义里被译成了中文。
import { readFileSync, readdirSync } from 'node:fs';

const SRT_DIR = '/root/Developments/stanford-cs336/lessons_srt';
const MDX_DIR = 'src/content/courses/cs336';

// 这些词太常见，出现与否说明不了任何事
const STOP = new Set(
  `I The A And But So OK Okay Now Then This That These Those There Here It We You They He She
   What Which When Where Why How If Else For While Do Does Did Have Has Had Will Would Can Could
   Should May Might Must Let Yeah Yes No Not Right Left Good Bad Great Well Just Like Very Really
   Actually Basically Obviously Maybe Perhaps Sort Kind Thing Things Stuff One Two Three Four Five
   Six Seven Eight Nine Ten First Second Third Last Next Time Times Way Ways Lot Lots Question
   Questions Answer Answers Example Examples Slide Slides Lecture Class Course Today Week Year
   Years Day Days Point Points Part Parts Case Cases Number Numbers Thanks Thank Sorry Hi Hello
   Professor Student Students Everyone Anyone Someone Something Anything Nothing Everything
   Model Models Data Paper Papers Work Works Big Small Fast Slow High Low More Less Most Least
   Also Because Since Though Although However Therefore Thus Hence Still Even Only Same Different
   Because Before After During Between Among Within Without About Above Below Under Over Into
   Onto From With Your Our Their His Her Its My Me Us Them Him Ah Um Uh Oh Hmm Yep Nope`
    .split(/\s+/)
    .filter(Boolean),
);

function transcriptFor(n) {
  const files = readdirSync(SRT_DIR);
  const want = new RegExp(`Lecture ${n}: `);
  const f = files.find((x) => want.test(x));
  if (!f) throw new Error(`找不到第 ${n} 讲的字幕`);
  return readFileSync(`${SRT_DIR}/${f}`, 'utf8');
}

function check(n) {
  const srt = transcriptFor(n);
  const mdx = readFileSync(`${MDX_DIR}/lecture-${String(n).padStart(2, '0')}.mdx`, 'utf8');

  // 候选一：专有名词 —— 句中出现的大写开头词（句首的不算，那可能只是句子开头）
  const proper = new Map();
  for (const m of srt.matchAll(/[a-z,]\s+([A-Z][A-Za-z0-9-]{2,})/g)) {
    const w = m[1];
    if (STOP.has(w)) continue;
    proper.set(w, (proper.get(w) ?? 0) + 1);
  }

  // 候选二：具体数字 —— 带单位或量级的（1.4T / 92.6% / 175B / 8192 / 1e25）
  const nums = new Map();
  for (const m of srt.matchAll(/\b(\d+(?:\.\d+)?\s?(?:%|[BKMGT]\b|billion|trillion|million|GB|TB|ms))/gi)) {
    const v = m[1].replace(/\s+/g, '');
    nums.set(v, (nums.get(v) ?? 0) + 1);
  }

  const missing = { proper: [], nums: [] };
  // 只看老师**反复说**的（出现 ≥2 次）—— 说一次的可能只是口误或随口带过
  for (const [w, c] of proper) if (c >= 2 && !mdx.includes(w)) missing.proper.push(`${w}(${c})`);
  for (const [v, c] of nums) if (c >= 2 && !mdx.includes(v)) missing.nums.push(`${v}(${c})`);

  return { n, proper: proper.size, nums: nums.size, missing };
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法: node scripts/check-coverage.mjs 10 11 13');
  process.exit(1);
}

for (const a of args) {
  const r = check(Number(a));
  console.log(`\n══ 第 ${r.n} 讲 ══  字幕里 ${r.proper} 个专有名词 / ${r.nums} 个具体数字`);
  if (!r.missing.proper.length && !r.missing.nums.length) {
    console.log('  没有反复出现却缺席的词 —— 覆盖看起来完整');
    continue;
  }
  if (r.missing.proper.length)
    console.log(`  讲义里找不到的专有名词 (${r.missing.proper.length})：\n    ` + r.missing.proper.join('  '));
  if (r.missing.nums.length)
    console.log(`  讲义里找不到的数字 (${r.missing.nums.length})：\n    ` + r.missing.nums.join('  '));
}
