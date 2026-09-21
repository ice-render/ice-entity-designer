# 虚拟文档接入 IED：实测反馈与 P2 需求

> 2026-09-21 · 对应引擎侧 `ice-render/plans/virtual-child-source.md` 的 P0/P1/P3（已落地）
> 验证页：`examples/water-large.html` · 实现：`src/virtual/WaterVirtualDoc.ts` · 回归：`e2e/water-large.spec.ts`

## 1. 做了什么

把一份**几万个工艺符号 + 几万条管线 + 几万条标注**的厂站图，从"每个图元一个组件对象"
改成**列存文档 + 窗口物化**：

| 条目类型 | 数量（`symbols=20000`） | 画法 |
|---|---|---|
| 符号（21 种工艺符号） | 20,000 | **批量精灵**：每种 kind 渲染一张离屏位图，逐实例 `drawImage` |
| 标注（位号 + 名称） | 20,000 | **窗口内物化**成真 `ICEText`（引擎的文本位图缓存对它有效） |
| 管线（介质 + 管径） | 20,000 | 批量落墨（`setLineDash` + `stroke`），命中走点到线段距离 |

引擎侧只用了新 API：`ICEVirtualLayer({ childSource })` + `ICE.materializeVirtualChild` /
`releaseVirtualChild` / `materializedIndices` / `setVirtualHitPolicy`。

## 2. 实测（真机 Chrome + CDP，1280×800 画布，viewpoint 0.8×）

| 指标 | 虚拟文档 | 同几何对象树 | 备注 |
|---|---|---|---|
| 堆自有大小（2,000 符号 / 6,000 条目） | **7.4 MB** | **235.3 MB** | −96.9%；对象树每"条目"≈39KB（复合符号含派生子件） |
| 堆自有大小（20,000 符号 / 60,000 条目） | **23.8 MB** | 无法构建 | 对象模式在这一档把标签页拖到无响应（线性外推 ≈2.3GB） |
| 平移帧率（官方 `setViewport`，3s 真实 rAF） | **120.2 fps / p50 8.3ms / 0 长任务** | 91.4 fps / p50 10.2ms | 2,000 符号档 |
| 单帧落墨条目数 | 56 ~ 495 | — | 只画窗口里那点 |
| 文档列存 | **3.11 MB**（20k 符号档） | — | 几条 TypedArray + 网格索引 |
| 窗口内活对象（标注） | 400 | — | 与文档规模无关 |

## 3. 接入体验（顺的与不顺的）

### 顺的

1. **交互层零胶水**：引擎的"命中即物化 + 事件重定向"（P1）让**点选 / 拖动 / 属性面板**直接落在
   物化出来的真组件上 —— 页面里没有一行 `mousedown` 转发代码（P1 之前的 spike 要 ~40 行）。
   实测：真鼠标按下 → 物化 → `designer.selectedId` 命中 → 属性面板渲染 → 拖动位移正确。
2. **批量落墨的状态隔离**（引擎 `save/restore` 包住 `paint`）省掉了最容易出错的一类 bug：
   批量层改过的 `fillStyle` 不会污染容器自己的绘制。
3. **复合组件的批量表示**走"每 kind 一张精灵"很自然（`renderTo` 到离屏画布），
   不需要把 IED 的 21 种符号拆成路径。
4. **窗口增删的代价可忽略**：每帧进出几百个标注（物化/回收），平移仍是 120fps / 0 长任务。

### 不顺的（应用要守的纪律）

1. **图元的盒不能跨全图**：我第一版把"行尾符号连到下一行行首"，那条管线横跨 12,000 世界单位，
   索引节点数按格子数爆炸（6 万条目 → **3,000 万节点 / 236MB / 11.8fps**）。
   虚拟化把这条隐含约束变成了硬约束 —— 建议引擎侧在 `forEachInBox` 之外**加一条自检**
   （盒子面积/跨度超过世界尺寸的 x% 就 warn）。
2. **文档生成要分两趟**：同一趟里"先铺坐标、后连管线"会拿到还没写坐标的端点（盒变成 (0,0)→跨全图）。
   这是纯应用侧的顺序问题，但症状与上一条一样（索引爆炸），排查花了些时间。
3. **混合策略目前要应用自己驱动**：哪些条目该物化（这里是"所有标注"）由应用在 `paint` 里
   循环 + `materializeVirtualChild/releaseVirtualChild` 手工维护；每个接入的应用都会写一遍。
4. **`IED.ICE` 是引擎的 ICE 类，不是 UMD 命名空间**：`new ICE.ICEVirtualLayer()` 会报
   "not a constructor" —— 文档里要提醒"虚拟化 API 从包入口解构"。

### 顺手修掉的既有缺陷（与虚拟化无关）

**水工艺符号点不中**：`FlowDesigner.__handleMouseDown` 只认 `FlowNode.typeId` / `FlowEdge.typeId`
**精确匹配**，而 `WaterSymbol extends ICEGroup`（自己的 typeId）→ 实测**既有 `water-editor.html`
点符号时 `designer.selectedId` 恒为 null**（只有工具栏新建时才被程序化选中）。
修法：抽出可覆盖的 `isSelectableComponent(component)`（默认 `instanceof FlowNode/FlowEdge`），
`WaterProcessDesigner` 覆盖为再加 `WaterSymbol` / `WaterPipe`。

## 4. 能力边界（P2 之前的事实，`e2e/water-large.spec.ts` 已钉住）

文档 60,000 条目，但**设计器只看得见物化出来的那一小部分**：

| 工具 | 实测 | 原因 |
|---|---|---|
| `designer.nodes` / `edges` | 0 / 0（只有 400 个物化标注在树上） | 遍历的是组件树 |
| `validateWater()` | 只对"物化出来的那几个"判定（实测 1 条无关提示） | 同上 |
| `toSvg()` | 102.9 KB —— **只有窗口内那点内容** | 导出遍历组件树 |
| `serialize()` | 499.7 KB —— 同上 | 快照遍历组件树 |
| undo / redo | 记录在物化组件上；物化/回收时会丢 | 历史建立在组件树上 |

## 5. 给引擎 P2 的需求清单（IED 视角，按重要性）

1. **全量导出通道**：`VirtualChildSource` 增加"描述单项"的可选方法（`describe(i)` 返回
   几何 + 样式 + 文本，或由应用提供 `paintToSvg?(sink)`）—— 导出要的是**整份文档**，不是窗口。
2. **序列化契约**：容器序列化时输出 `virtual: { count, version }` + 已物化子项；
   并提供一对"文档载荷"钩子（`getDocumentPayload()` / `loadDocumentPayload(payload)`），
   让应用的文档本体能进同一个快照文件（否则"存下来再打开"就只剩窗口里那点）。
3. **文档补丁入口**：`applyPatch(i, patch)`（唯一写入口）+ `version++`，
   这样 undo/redo 记的是"文档补丁"而不是"物化组件的 state 变化" —— 物化/回收不再丢历史。
4. **窗口同步助手**：`syncWindow(container, { needs(i), pad })` 的引擎级实现
   （现在每个应用都要自己写一遍物化/回收循环）。
5. **自检与提示**：① 盒子跨度过大时 warn；② `virtual` 容器在 a11y / worker 镜像里
   "只暴露物化子项"要写进文档并给一个开关（镜像要不要跟随窗口）。

## 6. 结论

- **P0/P1/P3 已经能支撑"看 + 点 + 改"**：内存 −96.9%、平移 120fps、真鼠标选中/拖动/属性面板全通，
  而且应用侧的交互胶水是零。
- **P2 决定"存 + 出 + 撤"**：校验、导出、序列化、undo 这四件事在虚拟化之后都必须
  从"组件树是真相"改成"文档是真相、组件树只是窗口投影" —— IED 这边建议按第 5 节的五条来做。
- **反过来看**：对象模式在 6 万条目这一档已经不可用（构建即卡死），所以对"厂站图 / 管网图 /
  大画布编辑器"这类形态，虚拟化不是优化项，而是能不能做的前提。
