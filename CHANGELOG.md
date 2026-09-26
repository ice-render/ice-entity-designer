# 变更日志

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 更早的版本（0.11.0 及以前）在本文件建立前发布，只保留一行摘要；细节见对应的 `git tag` 与提交历史。

## [Unreleased]

> 下一个版本发布前，改动在这里累积。

## [0.12.3] - 2026-09-26

### 修复

- **位号 / 名称被进线穿过**（给排水符号）：端口取的是形状盒**边中点**
  （`FlowDesigner.__slotPoint()` → `box.tc` / `box.bc`，且 `getMinBoundingBox(refresh)` 不含子节点），
  而位号（顶边外侧居中）与名称（底边外侧居中）也画在**同一条中轴线**上 —— 两者各自都对，
  合起来就是"从上 / 下进线连着箭头一起穿过文字"：实测缺氧池 A 的 `AX-101` 被混合液回流线
  穿成 `AX⊥01`（像素采样：10 个取景里 17 处文字带里有管线颜料，放大图元间距完全无效 ——
  这是几何冲突，不是间距不够）。

  现在**顶边 / 底边被连线占用时，对应那行文字往右让开**：让开量按估算字宽算
  （`estimateWaterTextWidth()`：CJK 一个字宽、拉丁数字 0.55 个字宽，`V-101` 与 `混凝沉淀池`
  差好几倍，拍常数必然一头松一头紧），正好让文字左缘落在端口柱右侧 8px；
  水平端口（L / R）不在那条中轴线上，照旧居中。

  谁把"哪条边被占了"推给符号：**边是唯一真相**，由 `WaterProcessDesigner.refreshPortOccupancy()`
  从管线的 `links.start/end` 重算，在增删管线、删图元（基类会级联删连线）、载入快照之后各跑一遍；
  交互式改接（把端点拖到别的端口）由构造期挂的 `mouseup` 兜住（引擎没有"连接变了"的事件）。
  占用是**派生数据**：作为私有字段进符号，不进 `state` —— 不进快照、不碰 codec 的完整性约束。

  回归：`tests/water/water-symbols.test.ts`（让位量 / 水平端口不影响 / 松开回位）、
  `tests/water/water-designer.test.ts`（接线后让位、删管线回位、删图元级联回位、快照往返后仍让位）。

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
