---
name: annotations
description: 消费笔记页面上积累的「给 AI 的批注」——读 private/annotations.json 里 status=pending 的请求，在源 MDX 里语义定位后按要求修改笔记，跑构建检查，再标 done 并记录做了什么。触发：「处理批注」「消费批注」「看看笔记上的批注」「处理笔记里给我提的问题」「annotations」。
---

# 消费笔记批注

用户在网站笔记上通过右键「提问给 AI」积累了一批请求，落在 `private/annotations.json`。
本 skill 把 `status: pending` 的请求逐条处理掉，形成闭环。

## 最关键的一点：selector.exact 是「渲染后」的文本，不是源码

批注是用户在浏览器里选中渲染结果时生成的，所以 `selector.exact` 里：

- **没有 markdown 标记**：源码 `**KF**` 在 exact 里是 `KF`
- **没有 LaTeX 源码**：源码 `$\Sigma_{k|k}$` 在 exact 里是渲染后的符号文本，和源码完全不同
- **组件标记被抹掉**：源码里夹着 `<Theorem>` 之类，exact 里只有纯文本

**因此定位是「语义」的，不是「机械」的。** 你读源文件，理解 `exact` 引文指的是哪一段，
像人一样跨过这些渲染/源码差异找到它。**绝不要**对源码做字符串精确匹配再报错「找不到」——
那正是用户最想批注的公式/加粗内容上会失败的做法。`prefix`/`suffix` 和 `ask` 帮你确认位置。

## 流程

### 1. 读取待处理请求
读 `private/annotations.json`（不存在就说明还没有批注，结束）。取出 `requests` 里
`status === "pending"` 的条目。`marks`（个人高亮/下划线）**不要动**——那是用户的私人阅读层。

### 2. 定位源文件
`doc` 字段形如 `blog/kalman-geometry`、`logs/2026-07-20`，对应源文件：

```
doc = "<集合>/<条目id>"  →  src/content/<集合>/<条目id>.{md,mdx}
```

如 `blog/kalman-geometry` → `src/content/blog/kalman-geometry.mdx`。

### 3. 语义定位并修改
逐条请求：读源文件，理解 `selector.exact`（配合 `prefix`/`suffix`）指向哪一段源码，
按 `ask` 的要求修改那里的 MDX。优先用现有组件（`Theorem`/`Callout`/`Figure`/`Collapsible`），
不堆内联样式（见 AGENTS.md）。

### 4. 构建检查（必做，不可跳过）
```bash
npm run verify
```
实跑构建 + 隐私边界检查。**MDX 脆弱**：正文里未转义的 `{` 或 `<` 会让构建失败。
不检查就提交，坏文件会悄悄挂掉部署。构建失败就按报错定位到具体文件修好，再继续。
（数学公式里的 `<` 写成 `\lt`，行内代码里的花括号用反引号包起来。）

### 5. 回写状态
把处理过的每条 request 改为：
- `status: "done"`
- `resolvedAt`: 当前时间（ISO 8601）
- `resolution`: 一句话说明你做了什么（**必填** —— 用户会在页边栏的置灰卡片里读它来审阅你的改动）

直接编辑 `private/annotations.json` 写回这些字段（这是本地私密文件，可直接改）。
保持其余字段和 `marks` 原样。

### 6. 汇报
告诉用户：处理了哪几条（引文 + 你做的改动）、改了哪些源文件、`npm run verify` 是否通过。
如果某条请求你无法定位或不确定怎么改，**不要瞎改** —— 保持 pending，在汇报里说明原因。

## 硬约束

- 只碰 `status: pending` 的 requests；`marks` 一律不动
- 每轮改动后必跑 `npm run verify`
- `resolution` 必填
- 只读写 `private/annotations.json` 这一个数据文件
- 定位靠语义理解，不靠源码字符串精确匹配
