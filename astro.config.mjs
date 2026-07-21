// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import annotate from './src/integrations/annotate.mjs';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  // 站点绝对地址（RSS / sitemap / OG 用）。GitHub Pages 用户主页，根路径无需 base。
  site: 'https://darlenenotiko.github.io',

  // annotate() 是 dev-only 批注系统：只在 astro dev 注入客户端 + 挂写盘端点，
  // build/preview 时完全不参与 —— 生产构建里没有任何批注代码。
  integrations: [mdx(), annotate()],

  markdown: {
    // 数学公式：$...$ 行内、$$...$$ 独立。KaTeX 服务端渲染成静态 HTML，
    // 浏览器端零 JS；样式与字体由 BaseLayout 引入的 katex.min.css 提供（self-host）。
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
