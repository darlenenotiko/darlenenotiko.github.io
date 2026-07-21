// 一次性生成社交分享卡 public/og.png（1200×630）。
// 用 sharp 把一段 Loom 风格的 SVG 栅格化。文本只用拉丁（域名 + 英文副标题），
// 避免 librsvg 渲染 CJK / 自定义字体的坑，也不把占位名「姓名」烤进图里。
// 内容或品牌改动后重跑：node scripts/make-og.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/og.png', import.meta.url));

const INDIGO = '#27406b';
const INDIGO_SOFT = '#aeb9d0';
const MADDER = '#9c2b2e';
const LINEN = '#f5efe2';
const RULE = '#e2dac7';
const INK_MUTED = '#6b6153';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${LINEN}"/>
  <rect x="24" y="24" width="1152" height="582" fill="none" stroke="${RULE}" stroke-width="2"/>

  <!-- loomtile 织印：2×2 双色平纹 -->
  <g transform="translate(90,86)">
    <rect x="0"  y="0"  width="34" height="34" fill="${INDIGO}"/>
    <rect x="34" y="0"  width="34" height="34" fill="${INDIGO_SOFT}"/>
    <rect x="0"  y="34" width="34" height="34" fill="${INDIGO_SOFT}"/>
    <rect x="34" y="34" width="34" height="34" fill="${INDIGO}"/>
  </g>

  <text x="90" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="66" font-weight="bold" fill="${INDIGO}">darlenenotiko.github.io</text>
  <rect x="92" y="322" width="300" height="5" fill="${MADDER}"/>
  <text x="93" y="384" font-family="Helvetica, Arial, sans-serif" font-size="31" fill="${INK_MUTED}">UAV Autonomy · State Estimation · Field Notes</text>

  <!-- 飞行轨迹：呼应首页 hero -->
  <path d="M90,520 C260,520 300,440 470,452 S760,540 940,472 S1080,432 1110,452"
        fill="none" stroke="${INDIGO}" stroke-width="2.5" stroke-dasharray="2 9" stroke-linecap="round"/>
  <circle cx="1110" cy="452" r="20" fill="${INDIGO}" opacity="0.16"/>
  <circle cx="1110" cy="452" r="8" fill="${INDIGO}"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
