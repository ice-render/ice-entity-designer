# 变更日志

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 更早的版本（0.11.0 及以前）在本文件建立前发布，只保留一行摘要；细节见对应的 `git tag` 与提交历史。

## [Unreleased]

> 下一个版本发布前，改动在这里累积。

## [0.13.0] - 2026-09-26

### 新增

- **给排水符号库补齐第二批 7 个图元（31 → 38 种）**：应用侧做"运行监视 / 工艺试算"时发现图上
  没法表达这些要素，只能拿通用设备顶替 —— 记法不表达语义，读图的人就得靠猜。按项目约定，
  缺图元一律回本包封装，应用侧只消费。

  - `gate` 闸门（渠道断面 + 闸板 + 启闭螺杆与手轮，`GT`）
  - `weirGate` 堰门 / 调节堰（渠底 + 可调堰板 + 堰顶横线，`WG`）
  - `flapGate` 拍门（阀座 + 单向翻板，`FG`）
  - `parshallFlume` 巴氏计量槽（渐缩段 + 喉部 + 渐扩段，`FM`）
  - `uvDisinfection` 紫外消毒装置（机箱 + 一排紫外灯管，`UV`）
  - `gritSeparator` 砂水分离器（斜置螺旋筒 + 砂斗 + 溢流口，`GS`）
  - `screeningsUnit` 栅渣压榨机（输送筒 + 压榨段 + 出渣口，`SP`）

- **两种新介质**：`backwash` 反冲洗水、`reclaimed` 中水回用（都是实线，各自一个色阶）。
  沼气**没有**加：本厂不建厌氧消化（YAGNI）。

- **在线分析仪支持功能代号**（`state.analyzerCode`）：仪表本就画成"圆圈 + 功能字母"，
  所以不按仪表种类拆图元，而是给 `analyzer` 一个可配代号（`DO` / `TU` / `CL` / `pH` / `ML` /
  `AN` / `COD` / `ORP` / `TP` / `TN`，字典见 `WATER_ANALYZER_CODES`），字号随代号长度收缩。
  不配代号时画 `A` —— 与加这个字段之前的渲染逐像素一致，老快照读进来就是这个值。

### 变更

- **闸门 / 堰门纳入"可开闭"集合**：`WATER_VALVE_KINDS` 扩为
  `['valve', 'motorValve', 'gate', 'weirGate']` —— 只加图元不加这条，就会出现"闸门关着、
  流径却报通"。拍门不进这个集合（与止回阀同属单向件）。
- 关位红竖杠抽成 `WATER_STYLE.closedColor`（原先在阀门与电动阀两处各写一遍字面量）。
- 文档纠偏：`docs/water-process-spec.md` 的符号表 21 → 38、介质表 7 → 11（前两批补充时漏改，
  表格还停在最初那 21 种），README 两处计数同步。

### 回归

- `tests/water/water-symbols.test.ts`（新图元齐备 / 位号唯一 / 串联标记 / 分类表 / 画得出 ≥2 个派生形状 /
  介质 11 种不撞色 / 功能代号默认与收缩 / 闸门类可开闭）
- `tests/water/water-designer.test.ts`（关闸门断流、拍门不参与开闭、快照往返保留 `analyzerCode`
  与新增介质）
- `e2e/water-editor.spec.ts` 的符号数断言 31 → 38
- `tests/theme/color-budget.test.ts` 预算登记：`water_shapes.ts` 19 → 20

## [0.12.4] - 2026-09-26

### 修复

- **过路管线压住别人的位号 / 名称**（给排水符号）：0.12.3 建立了"符号知道自己被什么挡了 →
  标签让位"这套机制，但那时的判据只有"**自己的**端口被占"。图纸里还有另一类：
  **别人的管线从我的标签上方 / 下方经过** —— 那根线跟我没有连接关系，端口占用判据管不到它
  （下游 `ice-agent-console` 线上残留 4 处，且放大图元间距无效：折线与符号的相对位置尺度无关）。

  判据扩成"**有折线穿过我的文字带**"，纯几何、由设计器算（边是唯一真相，折线也在它手里）：

  - `WaterSymbol.labelBands()` 给出位号 / 名称**文字带的世界矩形**（与 `syncShape()` 的排版同源：
    同一批常量 `TAG_TOP_OFFSET` / `NAME_TOP_PAD`，不再各抄一份）；
  - `WaterSymbol.setLabelBlocked({ tag, name })` —— 与端口占用**并列**的第二个让位理由；
  - `src/utils/segment-box.ts` 的 `segmentHitsBox()`（Liang–Barsky 夹逼）：折线每一段与两个文字带
    做"线段 × 矩形"判定；
  - `WaterProcessDesigner.refreshLabelPlacement()`（`refreshPortOccupancy()` 保留为弃用别名）
    在增删管线 / 删图元 / 载入快照 / 松手之后各跑一遍。

  量级：78 符号 × 100 管线 × 几段 ≈ 十万次整数级判定，只在上述路径跑，不进逐帧循环。

  回归：`tests/water/segment-box.test.ts`（横穿 / 贴边 / 平行在外侧 / 零长度）、
  `tests/water/water-designer.test.ts`（过路折线经过 → 让位；挪走 → 回位；不经过 → 不触发）。

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
