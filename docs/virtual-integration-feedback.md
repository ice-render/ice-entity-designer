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

## 4. 能力边界（P2 第 1+2 条落地之后）

### 4.1 已解决：导出与存盘现在看**整份文档**

| 通道 | 实现 | 实测（5,000 符号 / 15,000 条目） |
|---|---|---|
| 导出 SVG | `WaterVirtualDoc.paintToSvg`：每 kind 一份 def（由引擎 `exportSvg([模板])` 生成，**与画布同源**）+ 每实例一条 `<use>` + 管线 `<polyline>` + 标注 `<text>` | 20,000 符号档 **7.46 MB**（21 def + 2 万 use + 2 万 polyline + 2 万 text）；此前只有窗口里那点 = 102.9KB |
| 存盘 / 读盘 | `serializeDocument()` 只写**参数 + 编辑**（列存是确定性生成的，不必存整份）；引擎的 `virtual` 块 + `virtualIndex` 负责把文档与物化子项一起还原 | 快照 **133.6 KB**（不是 3MB 列存）；**存盘 → 清空 → 读盘**后：文档规模 15,000 ✓、被拖过的坐标 `left=12345` ✓、物化子项 ✓、`liveComponents` 重新挂上 ✓ |

两条经验（写进了引擎 AGENTS 的虚拟子源铁律）：

1. **`virtualIndex` 不能少**：物化子项在树上、文档以为它没物化 → 批量层再画一遍（画面上
   "看起来只是粗了一点"）。引擎现在把下标写进快照并在读回时重登"已物化"表。
2. **导出次序**：批量内容 → 容器自身 → 物化子项。顺序错了会出现"拖过的那个被旧的批量内容盖住"。

### 4.2 也解决了：文档补丁 / 窗口同步 / 自检（P2 第 3~5 条）

| 能力 | 引擎给的 | IED 怎么用 | 实测 |
|---|---|---|---|
| **文档补丁入口** | `applyVirtualPatch(container, i, patch)`（先写文档、再同步物化组件）＋ 物化组件改动经 `onChildPatched(i, patch)` 回流 | `WaterVirtualDoc.applyPatch/onChildPatched`：写列存 + `version++` + 位置变了就重建索引 | 拖 30 步 → 文档列存**立刻**等于组件位置、`version` 1 → 91（不再是"存盘时才写回"） |
| **窗口同步助手** | `syncVirtualWindow(container, { needs, map, pad, budget })` | `syncLabels` 从"手写 40 行循环"变成一次调用：`needs` 判符号、`map` 映射到标注、`pad` 300 滞后带、`budget` 128 | 每帧进出几百个标注，平移仍 120fps / 0 长任务 |
| **跨度自检** | `diagnoseVirtualSource(source, { spanRatio })` | 场景重建时跑一次，结果进统计面板 | ✅ 通过（`maxSpan 178`，文档跨度 12,000）—— 第一版那条跨行长管线（`maxSpan 12014`）会被当场报出来 |
| **镜像口径** | 虚拟容器进镜像树时**告警一次** | — | 现状：镜像只含物化子项；文档下发是 P2 之后的事 |

两个"实现里才发现的坑"（已进引擎回归与文档）：

1. **`map` 不能省**：IED 是"扫符号、物化它的标注"，不写映射时窗口同步会 `created 104 / released 104 / live 0`
   —— 建完立刻全回收。
2. **回收只管自己物化的那些**：命中路径（用户点一下）物化的条目曾被窗口同步一刀切回收，
   症状是"点中的符号当场被拆、属性面板找不到节点"。引擎现在只回收自己建的，其余交给应用。

### 4.3 仍是应用侧的事

| 工具 | 现状 | 归属 |
|---|---|---|
| `designer.nodes` / `edges` | 只含物化出来的子集（组件树就是投影） | 应用：要遍历文档就直接读列存（`doc.symbolCount` 等） |
| `validateWater()` | 只对物化子集判定 | 应用：校验应当读**文档**（列存）而不是组件树 |
| undo / redo | 现在可以用文档补丁重写（引擎已给 `applyPatch` + 回流） | 应用：把补丁记进自己的历史（IED 下一步） |

**历史这一块的量化证据**（2026-09-21 真机实测，`water-editor.html` 用本应用自己的 API 造 2,020 个
工艺符号 + 2,020 条管线）：

| | 堆（GC 后） | 建场景耗时 |
|---|---|---|
| 造完之后（含编辑器历史快照） | **932.8 MB** | **58.5 s**（≈29 ms/个） |
| `designer.resetHistory()` 之后 | **58.4 MB** | — |

也就是说 **874 MB（94%）是"每次改动全量快照"的历史**，建场景的 29 ms/个也主要花在它上面。
这跟"undo 改成文档补丁"是同一件事的两面：历史不该记"整棵树"，该记"文档补丁"
（引擎的 `applyPatch` + `onChildPatched` 已经就绪）。

**已落地的两条对策与复测**（2026-09-21）：

| 对策 | 说明 | 复测（同样 2,020 符号 + 2,020 管线） |
|---|---|---|
| `beginBatch()` / `endBatch()` | 批内不逐条记历史，整批算一条（撤销一次回退整批） | 建场景 **58.5 s → 14.4 s**（−75%） |
| 历史**按留存字节**封顶（默认 32 MB，条数上限照旧 100） | 大文档自动收敛到几十步，而不是"标签页吃掉 1 GB" | 堆（含历史）**932.8 → 58.5 MB**（−94%）；`resetHistory()` 后仍是 58.4 MB（组件树本身没变） |

帧率不受影响（交互 118.6 fps / 官方 `setViewport` 平移 108.4 fps / 0 长任务）；
配套 `setHistoryBudget({maxEntries,maxBytes})` 与 `getHistoryStats()` 便于宿主调参与诊断；
回归见 `tests/designer/history-budget.test.ts`。

**另一个顺手修的既有缺陷**（与虚拟化无关，同一根因）：`FlowDesigner.updateNode/updateEdge/nodes/edges`
原先也按**精确 `typeId`** 判，于是「水工艺符号」在**点选 / `updateNode` / `updateEdge`** 三处静默失效。
现在统一走可覆盖的 `isNodeComponent()` / `isEdgeComponent()`（默认 `instanceof FlowNode/FlowEdge`，
水务包覆盖为 `WaterSymbol` / `WaterPipe`）。

## 4.4 历史记录（P2 之前的边界，供对照）

文档 60,000 条目，但**设计器只看得见物化出来的那一小部分**：

| 工具 | 当时的实测 | 原因 |
|---|---|---|
| `designer.nodes` / `edges` | 0 / 0（只有 400 个物化标注在树上） | 遍历的是组件树 |
| `validateWater()` | 只对"物化出来的那几个"判定（实测 1 条无关提示） | 同上 |
| `toSvg()` | 102.9 KB —— 只有窗口内那点内容 | 导出遍历组件树（**已在 4.1 解决**） |
| `serialize()` | 499.7 KB —— 同上 | 快照遍历组件树（**已在 4.1 解决**） |
| undo / redo | 记录在物化组件上；物化/回收时会丢 | 历史建立在组件树上（待 P2 第 3 条） |

## 5. 给引擎 P2 的需求清单（IED 视角，按重要性）

1. ✅ **全量导出通道**（已落地）：`paintToSvg?(sink, bounds)` —— 导出要的是**整份文档**。
2. ✅ **序列化契约**（已落地）：`virtual: { type, count, version, payload }` + `virtualIndex` +
   `registerVirtualSource(type, factory)`。
3. ✅ **文档补丁入口**（已落地）：`applyVirtualPatch` + `applyPatch` / `onChildPatched` 回流。
4. ✅ **窗口同步助手**（已落地）：`syncVirtualWindow(container, { needs, map, pad, budget })`。
5. ✅ **自检与提示**（已落地）：`diagnoseVirtualSource` + 镜像告警 + a11y 口径写进 AGENTS。

> **下一步（IED 自己）**：把 undo/redo 改成"文档补丁"历史（引擎的入口已经就绪）；
> 校验改成读列存（`validateWater()` 现在只看组件树）。

## 6. 结论

- **P0/P1/P3 已经能支撑"看 + 点 + 改"**：内存 −96.9%、平移 120fps、真鼠标选中/拖动/属性面板全通，
  而且应用侧的交互胶水是零。
- **P2 决定"存 + 出 + 撤"**：校验、导出、序列化、undo 这四件事在虚拟化之后都必须
  从"组件树是真相"改成"文档是真相、组件树只是窗口投影" —— IED 这边建议按第 5 节的五条来做。
- **反过来看**：对象模式在 6 万条目这一档已经不可用（构建即卡死），所以对"厂站图 / 管网图 /
  大画布编辑器"这类形态，虚拟化不是优化项，而是能不能做的前提。
