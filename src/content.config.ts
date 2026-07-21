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

// 课程讲义：一门课一个子目录，条目 id 形如 cs336/lecture-01。
// 讲次靠 lecture 字段排序，不靠文件名 —— 文件名只决定 URL。
const courses = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/courses' }),
  schema: z.object({
    /** 课程标识，同时是 URL 的第一段，如 cs336 */
    course: z.string(),
    /** 课程全名，列表页分组标题用 */
    courseTitle: z.string(),
    /** 第几讲，列表页排序与上下讲导航用 */
    lecture: z.number(),
    title: z.string(),
    date: z.date(),
    description: z.string().optional(),
    /** 主讲人 */
    speaker: z.string().optional(),
    /** 原始课件出处，页脚标注 */
    slides: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { papers, blog, projects, logs, courses };
