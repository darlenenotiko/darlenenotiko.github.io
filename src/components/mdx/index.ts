// 统一注入给 MDX 的组件。
// 渲染页用 <Content components={MDX} /> 传入，写笔记时无需在每篇文件里 import。
// 新增组件后在这里加一行即可全站可用。
export { default as Theorem } from './Theorem.astro';
export { default as Callout } from './Callout.astro';
export { default as Figure } from './Figure.astro';
export { default as Collapsible } from './Collapsible.astro';
