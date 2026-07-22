import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const courses = await getCollection('courses', ({ data }) => !data.draft);

  // 博客与课程讲义合流，按日期倒序
  const items = [
    ...posts.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? '',
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
    })),
    ...courses.map((note) => ({
      title: `${note.data.courseTitle} ${note.data.lectureLabel ?? `第 ${note.data.lecture} 讲`} · ${note.data.title}`,
      description: note.data.description ?? '',
      pubDate: note.data.date,
      link: `/courses/${note.id}/`,
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: '姓名 · 博客',
    description: '文章与笔记',
    site: context.site ?? 'https://example.com',
    items,
    customData: '<language>zh-CN</language>',
  });
}
