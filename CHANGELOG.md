# 变更日志

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 更早的版本（0.11.0 及以前）在本文件建立前发布，只保留一行摘要；细节见对应的 `git tag` 与提交历史。

## [Unreleased]

> 下一个版本发布前，改动在这里累积。

## [0.12.2] - 2026-09-21

### 修复

- **补发布门禁**：本仓此前既没有 `verify` 也没有 `prepublishOnly`，`npm publish` 会**直接打包上一次
  构建的 `dist`**（0.12.1 就是这样发出去的 —— 功能上两个修复都在，但发布产物 ≠ tag 源码）。
  现在 `prepublishOnly = npm run verify`（`types:check` + `build` + `test`），发布当场重建产物。

## [0.12.1] - 2026-09-21

### 修复

- **虚拟文档批量精灵全是空白位图**（"初始画面只有管线、一个图元都没有"）：`WaterVirtualDoc.__mintSprites()`
  只调了一次 `tpl.renderTo()`，而引擎的 `renderTo()` **只画「组件自己」**（子组件由渲染队列逐组件绘制），
  `WaterSymbol` 是 `ICEGroup` 复合组件、自身不落墨 —— 21 种工艺符号的离屏位图全空。
  改用引擎 4.3.0 新增的 `renderSubtreeTo()`（按与渲染队列 / SVG 导出同源的次序递归整棵模板树）。
- **自定义图元集体不上屏**（池 / 泳道的框、事件圆、网关菱形、任务角标、数据对象消失，只剩标题文字）：
  `createEmptyPath()` 只 clone 了 `Path2DRecorder` 的构造函数，`native` 恒为 `null`，而引擎 3.0.0 起
  "没有原生 `Path2D` 就不上屏"（不再把命令重放到 ctx）—— 命令流、SVG 导出、单测断言全都正常，
  只有屏幕是空的。改为按当前 recorder 的原生类型再造一份原生 `Path2D`。

### 变更

- peer / devDependency 抬到 `ice-render ^4.3.0`；AGENTS 补「离屏出图」契约。

### 回归

- e2e 新增两条**像素级**断言：「池 / 泳道的框真的画出来了」、「批量精灵有内容（符号不是空白位图）」。

## [0.12.0] - 2026-09-21

### 新增

- **虚拟文档（列存 + 窗口物化）**：`WaterVirtualDoc` + `examples/water-large.html`（2 万符号的厂站图），
  配合引擎 4.2.0 的虚拟子源：2,000 符号 **7.4 MB vs 对象树 235.3 MB（−96.9%）**，
  100 万图元档位由引擎侧验证。
- 文档补丁 / 窗口同步 / 自检接入（`applyPatch` / `syncVirtualWindow` / `diagnoseVirtualSource`）；
  导出与存盘走引擎的全量通道（导出 SVG 7.46 MB、快照 133.6 KB）。

### 性能

- **编辑器历史改批量合并 + 按字节封顶**：2,020 个符号 58.5s → **14.4s**、932.8MB → **58.5MB**。

### 修复

- `updateNode/updateEdge/nodes/edges` 的精确 typeId 判定（新增可覆盖的 `isNodeComponent()` /
  `isEdgeComponent()`），并修掉既有的"符号点不中"。

### 变更

- peer / devDependency 抬到 `ice-render ^4.2.0`（虚拟文档 API 在 4.2.0 才可用）。

## 更早的版本（一行摘要）

| 版本 | 摘要 |
|---|---|
| 0.11.0 | worker 镜像阶段二收口（结构 / 状态 / 文本 / 图片四条通道），跟版 ice-render 4.1.0 |
| 0.10.0 | worker 镜像接入（`MirrorHost`），peer 下限抬到 ice-render ^4.0.0 |
| 0.9.1 | peer 下限抬到 ice-render ^3.0.0 |
| 0.9.0 | 容器的底交给引擎保证（派生部件先于内容） |
| 0.8.0 | peer 下限抬到 ice-render ^2.18.0（事件系统改版） |
| 0.7.0 | 同层叠放次序 API + peer ^2.17.0 |
| 0.6.0 | peer 下限抬到 ice-render ^2.16.0 |
| 0.5.0 | 程序化高亮 + `fitViewport` 的 dpr 修复 |
| 0.4.x | 拖拽对齐引导线、连线端口自动选择（默认值） |
| ≤0.3.2 | 见 `git tag` 与提交历史 |
