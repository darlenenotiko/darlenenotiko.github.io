# 个人网站

Astro + MDX 静态站。内容集合定义在 `src/content.config.ts`。

## 隐私边界 —— 最重要的一条规则

`_inbox/`（原始素材）和 `private/`（待办、日程、私人笔记）**永远不进版本库，
永远不是构建输入**。它们里面可能有未公开的论文、涉及他人的内容、私人想法。

- 不要在任何页面或 loader 里读这两个目录
- 不要把它们的文件直接移进 `src/content/`；发布要新建整理过的文件
- 发布永远是显式动作，需用户确认；绝不自动扫描 `_inbox/` 后直接发布
- 改动内容或构建配置后跑 `npm run verify` —— 它会实跑构建并检查 `dist/` 里没有私密内容

## 写内容

用 `/publish` skill（`.claude/skills/publish/`）。

MDX 正文优先用 `src/components/mdx/` 里的组件（`Theorem` / `Callout` / `Figure` /
`Collapsible`），**无需 import**，由渲染页统一注入。组件不够用时新增组件，
不要在正文里堆内联样式 —— 否则风格会随篇数增长而漂移。

新增组件后记得在 `src/components/mdx/index.ts` 加一行导出。

## 注意

MDX 构建脆弱：正文里未转义的 `{` 或 `<` 会让构建失败。所以任何内容改动后
都必须跑一次构建，不能只看文件写对了没有。

## 批注系统（dev-only）

笔记页面有一套批注系统，只在 `astro dev` 期间存在，生产构建里没有任何批注代码
（由 `src/integrations/annotate.mjs` 的 hook 结构性保证）。用户在页面上高亮、下划线、
写批注、以及「提问给 AI」，数据落在 `private/annotations.json`（gitignore、非构建输入）。

- 处理用户攒下的「给 AI 的批注」用 `/annotations` skill（`.claude/skills/annotations/`）。
- 那些请求的 `selector.exact` 是**渲染后**的文本，源码里对应位置可能带 markdown / LaTeX /
  组件标记 —— 靠**语义**定位，不要对源码做字符串精确匹配。
- 只处理 `status: pending` 的 requests；`marks`（个人高亮/下划线）绝不要动。
- 锚定逻辑改动后跑 `npm run test:anchor`（headless 往返测试）。

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
