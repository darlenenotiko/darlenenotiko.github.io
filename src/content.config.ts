import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 只有 src/content/ 下的内容会被构建。_inbox/ 和 private/ 不在这里出现，
// 因此即使误放了文件也不可能被部署 —— 边界由 loader 的 base 强制保证。

const papers = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/papers' }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    venue: z.string(),
    year: z.number(),
    type: z.enum(['conference', 'journal', 'preprint', 'workshop', 'thesis']),
    pdf: z.string().optional(),
    code: z.string().optional(),
    page: z.string().optional(),
    video: z.string().optional(),
    bibtex: z.string().optional(),
    award: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    updated: z.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.date(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      // 项目页的动态演示：无人机飞行实拍、轨迹回放等
      video: z.string().optional(),
      code: z.string().optional(),
      demo: z.string().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

const logs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/logs' }),
  schema: z.object({
    date: z.date(),
    title: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { papers, blog, projects, logs };
