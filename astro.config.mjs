// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import annotate from './src/integrations/annotate.mjs';
import remarkMath from 'remark-math';
import rehypeMathml from '@daiji256/rehype-mathml';

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
    rehypePlugins: [rehypeMathml],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
