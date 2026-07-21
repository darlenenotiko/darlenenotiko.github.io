import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

// 手写 sitemap（不引第三方 integration）。与页面用同一套 draft 过滤，
// 动态路由从集合枚举，绝对地址走 Astro.site —— 不会漂移、不泄露草稿。
export async function GET(context: APIContext) {
  const site = context.site ?? new URL('https://darlenenotiko.github.io');
  const url = (path: string) => new URL(path, site).href;

  const blog = await getCollection('blog', ({ data }) => !data.draft);
  const projects = await getCollection('projects', ({ data }) => !data.draft);
  const courses = await getCollection('courses', ({ data }) => !data.draft);

  const staticPages = ['/', '/papers/', '/blog/', '/courses/', '/projects/', '/logs/', '/cv/'];

  const entries: { loc: string; lastmod?: string }[] = [
    ...staticPages.map((p) => ({ loc: url(p) })),
    ...blog.map((p) => ({
      loc: url(`/blog/${p.id}/`),
      lastmod: (p.data.updated ?? p.data.date).toISOString(),
    })),
    ...projects.map((p) => ({
      loc: url(`/projects/${p.id}/`),
      lastmod: p.data.date.toISOString(),
    })),
    ...courses.map((c) => ({
      loc: url(`/courses/${c.id}/`),
      lastmod: c.data.date.toISOString(),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc>${
        e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''
      }</url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
