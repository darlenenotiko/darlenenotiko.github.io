// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import annotate from './src/integrations/annotate.mjs';
import remarkMath from 'remark-math';
import rehypeMathml from '@daiji256/rehype-mathml';

// 把独立公式包进一个可横向滚动的 div。
//
// 为什么需要它：Temml 输出的 <math display="block"> 自带内联 style="display:block math"。
// 在这种数学布局模式下，Chromium 会按内容宽度把盒子撑开，直接给 math 写
// overflow-x / max-width 都约束不住 —— 长公式于是把整个页面撑出横向滚动条
// （课程讲义里这种长公式很多）。只有套一个普通 block 容器，滚动才真正成立。
function rehypeMathScroll() {
  const walk = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      walk(child);
      const isDisplayMath =
        child.type === 'element' &&
        child.tagName === 'math' &&
        child.properties?.display === 'block';
      if (!isDisplayMath) return child;
      return {
        type: 'element',
        tagName: 'div',
        properties: { className: ['math-scroll'] },
        children: [child],
      };
    });
  };
  return (tree) => walk(tree);
}

// https://astro.build/config
export default defineConfig({
  // 站点绝对地址（RSS / sitemap / OG 用）。GitHub Pages 用户主页，根路径无需 base。
  site: 'https://darlenenotiko.github.io',

  // annotate() 是 dev-only 批注系统：只在 astro dev 注入客户端 + 挂写盘端点，
  // build/preview 时完全不参与 —— 生产构建里没有任何批注代码。
  integrations: [mdx(), annotate()],

  markdown: {
    // 数学公式：$...$ 行内、$$...$$ 独立。Temml 在构建时渲染成静态 MathML，
    // 浏览器端零 JS；用 Libertinus Math 字体（与正文 Libertinus 同源），
    // 样式与字体由 BaseLayout 引入的 temml-libertinus.css 提供（self-host）。
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathml, rehypeMathScroll],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
