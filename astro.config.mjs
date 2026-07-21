// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import annotate from './src/integrations/annotate.mjs';

// https://astro.build/config
export default defineConfig({
  // RSS 和 sitemap 需要绝对地址。换域名时改这一处即可。
  site: 'https://example.com',

  // annotate() 是 dev-only 批注系统：只在 astro dev 注入客户端 + 挂写盘端点，
  // build/preview 时完全不参与 —— 生产构建里没有任何批注代码。
  integrations: [mdx(), annotate()],

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
