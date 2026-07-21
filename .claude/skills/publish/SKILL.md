---
name: publish
description: 把 _inbox/ 里的原始素材（草稿、截图、录音转录、论文 PDF、随手记）整理成网站内容并发布到 src/content/。触发：「发布」「把 inbox 里的东西发出来」「整理素材成文章」「写成笔记发到网站」「publish」。
---

# 发布：素材 → 网站内容

把 `_inbox/` 里的原始素材变成 `src/content/` 下的正式内容。

## 硬性约束（不可绕过）

1. **发布必须是显式的。** 绝不自动扫描 `_inbox/` 然后直接发布。永远先列出打算发什么、
   发到哪个集合，等用户确认。`_inbox/` 里可能有未公开的论文、私人想法、涉及他人的内容。
2. **绝不把 `_inbox/` 或 `private/` 的文件直接移进 `src/content/`。** 要新建文件，
   内容经过整理。原始素材留在 `_inbox/` 不动，用户自己决定何时清理。
3. **发布后必须跑 `npm run verify`。** 这一步不做完，任务就不算完成 —— 见下方「为什么」。

## 流程

### 1. 看素材
读 `_inbox/` 下的内容。图片和 PDF 也要实际打开看，不要只看文件名。

### 2. 定去向
四个集合，schema 见 `src/content.config.ts`：

| 集合 | 放什么 | 路径 |
|---|---|---|
| `blog` | 文章、技术笔记、推导 | `src/content/blog/*.mdx` |
| `papers` | 论文条目（元数据为主） | `src/content/papers/*.md` |
| `projects` | 项目介绍 + 演示 | `src/content/projects/*.mdx` |
| `logs` | 短日志，一段话即可 | `src/content/logs/YYYY-MM-DD.md` |

**先跟用户确认去向和标题再动手写。**

### 3. 写内容
- 文件名用 kebab-case 英文 slug（URL 的一部分），标题用中文没问题
- frontmatter 严格按 `src/content.config.ts` 的 schema，日期写 `YYYY-MM-DD`
- 正文优先用组件，而不是手搓 HTML/CSS：

```mdx
<Theorem type="theorem" name="最优性">…</Theorem>   <!-- 也支持 lemma/definition/proposition/corollary -->
<Callout type="insight" title="可选标题">…</Callout>  <!-- note/tip/warning/insight -->
<Figure src="/media/x.mp4" caption="…" wide />        <!-- 图或视频，wide 可超出正文宽度 -->
<Collapsible title="完整推导">…</Collapsible>
```

组件**无需 import** —— 渲染页通过 `components={MDX}` 统一注入（见 `src/components/mdx/index.ts`）。
现有组件不够用时，宁可新增一个组件，也不要在正文里堆内联样式：新增组件全站可复用，
以后改设计只改一处；内联样式会让 100 篇笔记的风格慢慢漂移。

- 媒体文件放 `public/media/`，正文里用 `/media/xxx.mp4` 引用

### 4. 验证（必做）

```bash
npm run verify
```

这一步做两件事：**跑一次真实构建** + **检查 dist/ 里没有私密内容**。

**为什么不能跳过**：MDX 比 Markdown 脆弱 —— 正文里一个落单的 `{` 或 `<` 会直接让构建失败。
如果不检查就提交，坏文件会悄悄把整个部署搞挂，而你要等到线上 404 才发现。

构建失败时看报错定位到具体 MDX 文件。最常见的原因就是未转义的 `{` 或 `<`：
行内代码里的花括号要写成 `` `{x}` ``，数学公式里的 `<` 要写成 `\lt` 或包进代码块。

### 5. 汇报
告诉用户：发了哪几个文件、落在哪个集合、构建是否通过。
如果 `_inbox/` 里有东西**没有**发布，说明是哪些、为什么（比如判断为私人内容）——
不要默默跳过。
