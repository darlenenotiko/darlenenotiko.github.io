# 个人网站

Astro + MDX 搭的个人学术网站：论文 / 博客 / 项目 / 日志，含 MathML 数学公式（Temml）、
Loom 视觉设计、Libertinus 字体、写作活动热力图，以及一套本地（dev）笔记批注系统。

**在线地址**：https://darlenenotiko.github.io

## 部署（GitHub Pages · 自动）

已配好 GitHub Actions（`.github/workflows/deploy.yml`）：
**每次推送到 `main` 分支，自动构建并部署**，无需手动操作。

首次启用（只做一次）：

1. 仓库名必须是 **`darlenenotiko.github.io`**（用户主页仓库）
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**
3. 推送到 `main`，在仓库 **Actions** 标签页看构建进度
4. 跑完后访问 https://darlenenotiko.github.io

## 本地开发（可选）

改内容、调设计时在本地跑。要求 **Node.js ≥ 22.12**。

```bash
npm install
npm run dev        # 开发服务器 + 批注系统 → http://localhost:4321
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（含 dev-only 批注系统） |
| `npm run build` | 构建到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run verify` | 隐私边界检查（确认私密内容不进产物） |

> Windows 用 PowerShell 或 Git Bash 均可，命令相同。若 4321 端口被占用，先 `npx astro dev stop`。

## 内容与结构

- `src/content/` — 网站内容：`papers` / `blog` / `projects` / `logs`，Markdown / MDX
- `src/components/mdx/` — 笔记里可直接用的组件：定理框 `Theorem`、图 `Figure`、
  提示 `Callout`、可折叠块 `Collapsible`（无需 import）
- 数学公式：MDX 里写 `$...$`（行内）或 `$$...$$`（独立），构建时由 Temml 渲染成静态 MathML（浏览器端零 JS）

## 隐私边界（重要）

`_inbox/`（原始素材）和 `private/`（待办、日程、批注数据）**永远不进版本库、永远不部署**。
它们只在本地存在。`npm run verify` 会实跑构建并确认产物里没有这两个目录的内容。

## 技术栈

Astro · MDX · Temml/MathML · Libertinus（self-host）· 纯静态输出。SEO：sitemap.xml / robots.txt / OG 分享卡 / 自定义 404。
