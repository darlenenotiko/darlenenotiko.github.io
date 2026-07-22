// 构建时从文件头读出图片的固有宽高。
//
// 为什么要这个：<img> 不带 width/height 时，浏览器在图片下载完之前不知道它多高，
// 于是给它 0 高度。正文里三百多张图全是 loading="lazy"，一篇讲义的真实高度
// 因此要等你滚到哪儿才长到哪儿 —— 点目录跳转会落偏两三千像素（实测最多 4825px），
// 因为跳的过程中沿途的图陆续加载，把目标一路往下推。
//
// 带上固有宽高，浏览器就能用宽高比在加载前预留正确的高度。注意 width/height
// 属性只提供比例，显示宽度仍然由 CSS（Figure.astro 的 width:100%）决定，
// 不会和 --fig-wide 打架。
//
// 只认 PNG / JPEG / WebP —— 仓库里 316 + 6 + 4 张正好是全部。
// 其余格式（那 1 个 svg）、视频、读不到的文件一律返回 null，
// 调用方不输出属性，退回原来的行为。
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Size {
  width: number;
  height: number;
}

const PUBLIC = path.resolve(process.cwd(), 'public');

// 一次构建里同一张图会被问很多次（同一张图可能出现在多篇里），缓存住。
// null 也缓存，免得对着不存在的文件反复 readFileSync。
const cache = new Map<string, Size | null>();

function parsePNG(b: Buffer): Size | null {
  // 签名 8 字节，紧跟着必须是 IHDR：长度(4) + "IHDR"(4) + 宽(4) + 高(4)
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function parseJPEG(b: Buffer): Size | null {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // 段之间可能有填充，往前挪到下一个 0xFF
      continue;
    }
    const marker = b[i + 1];
    // 无长度字段的标记：填充 0xFF、SOI、EOI、RSTn
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    // SOFn 里存着尺寸。0xC4(DHT) / 0xC8(JPG) / 0xCC(DAC) 混在这个区间里但不是 SOF。
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (i + 9 > b.length) return null;
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function parseWebP(b: Buffer): Size | null {
  if (b.length < 30) return null;
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    // 有损：3 字节 frame tag，然后是 0x9D 0x01 0x2A 同步码，再是 14 位宽、14 位高
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // 扩展格式：宽高各 3 字节小端，存的是「实际值 - 1」
    const w = b[24] | (b[25] << 8) | (b[26] << 16);
    const h = b[27] | (b[28] << 8) | (b[29] << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

/**
 * `src` 是站点绝对路径（如 `/courses/cs336/l12-mmlu.png`），对应 `public/` 下的文件。
 * 拿不到尺寸就返回 null。
 */
export function imageSize(src: string): Size | null {
  if (cache.has(src)) return cache.get(src)!;

  let size: Size | null = null;
  try {
    // 只允许读 public/ 里的东西。src 来自 MDX 正文，写成 ../../private/... 也不是不可能，
    // 而 private/ 和 _inbox/ 永远不能成为构建输入 —— 这里显式挡住。
    const file = path.resolve(PUBLIC, '.' + (src.startsWith('/') ? src : `/${src}`));
    if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) throw new Error('越出 public/');

    const buf = readFileSync(file);
    size = parsePNG(buf) ?? parseJPEG(buf) ?? parseWebP(buf);
    // 解析出 0 或负数说明读错了位置，当作失败
    if (size && (!(size.width > 0) || !(size.height > 0))) size = null;
  } catch {
    size = null;
  }

  cache.set(src, size);
  return size;
}
