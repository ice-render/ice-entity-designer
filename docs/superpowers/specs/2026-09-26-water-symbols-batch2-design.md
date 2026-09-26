# 给排水符号库 · 第二批补充设计（2026-09-26）

> 范围：`ice-entity-designer` 的 `src/water/` 符号库（31 → 38 种图元、9 → 11 种介质、
> 仪表功能代号参数化），以及下游 `ice-smart-water` 的符号目录与断言的同步。
> 契约正文仍是 `docs/water-process-spec.md`（本批会把它的数字与表格改对）。

## 1. 背景与目标

### 1.1 现状（可复核的证据）

- 符号库现有 **31 种图元 / 9 种介质**：31 种都有 preset 与绘制分支，`WaterMedium` 9 种都有样式；
  端口统一按包围盒给 `T/R/B/L/C`，因此每种图元的四个方向都能接线。
- 下游 `ice-smart-water` 的符号目录 `SYMBOL_CATALOG` 与 31 种一一对应（分 4 类：12 / 4 / 13 / 2），
  内置 AAO 案例用 34 个图元把 31 种全部用上；e2e 有 `presets === catalog === 31` 的奇偶校验。
- 因此对本仓已建模的那座 AAO 厂（10 万 m³/d），图元**够用且自洽**。

### 1.2 三个表达空洞（本批要解决的）

1. **闸门 / 堰 / 拍门整类缺失**。图上要表达"泵房前池闸门、超越堰、配水堰"时只能画成管道阀门——
   闸门/堰门是启闭**水道**的构筑物，与管道上的阀门不是一类物件；而且画成 `valve` 之外的自造表示
   还会漏掉"关闸断流"这条流径语义。
2. **计量与消毒的成套件缺失**。出水计量在厂站图上通常是**巴氏计量槽**（明渠计量）而不是管道流量计；
   本仓 `symbol-catalog` 的消毒条目写着"加氯 / 紫外剂量与余氯值"，但图上画不出**紫外消毒装置**。
   预处理附属的**砂水分离器**（`alarm-log` 里已作为真实设备出现）与**栅渣压榨机**同样没有图元。
3. **在线仪表只有一种通用画法**。本仓 `live-signal` 的 6 个实时点位里，溶解氧、污泥浓度、氨氮、
   COD 四个现在都只能画成同一个"圆圈 + A"，图上区分不出一台 DO 仪和一台浊度仪。

### 1.3 目标与成功标准

目标：让这套图元从"够用"走到"表达清楚"——该一眼区分的要素不靠猜；并**顺手修掉文档漂移**
（`docs/water-process-spec.md` 仍写"21 种 / 7 种介质"，`README.md` 两处仍写 21 种）。

成功标准（全部可验证）：

- 38 种图元每种都有：preset（名称 / 尺寸 / 画法分组 / 是否串联 / 位号）、绘制分支、分类归属、
  下游目录条目（含业务语义与介质清单）；
- 11 种介质每种都有颜色与线型，且新增两种能驱动管线着色；
- 闸门 / 堰门的开闭参与流径分析（关闸即断流），拍门按单向处理（同止回阀口径）；
- `analyzerCode` 设置后能被绘制、能被快照往返保留，未设置时与今天逐像素一致；
- 上游 `tests/water/`、下游 `symbol-catalog` 单测、两仓 e2e 数字断言全绿；
- 两份文档的数字与实际一致，色值预算按登记更新。

## 2. 范围

**本批做**：7 种新图元、2 种新介质、1 个新的仪表功能代号参数、上述所有测试与文档同步。

**本批不做**（每条都有理由，见 §7）：不改两个内置案例的拓扑；不加沼气介质；不细分成多个仪表 kind；
不发 npm 版本；不动审计 / 能耗 / 资产等页面逻辑。

## 3. 新增图元（7 种）

沿用包内既有铁律：**记法不可变换**（`transformable: false`，只能拖动）、派生部件
`linkable: false` + `interactive: false`、水线浅蓝 / 泥线浅黄的填充口径、位号在上 / 名称在下。
「画法」一栏是**可辨识特征**，不是标准图例的逐条复刻（该口径见 `water-process-spec.md` §6）。

| # | kind | 名称 | 画法构成（可辨识特征） | inline | 可开闭 | 尺寸 | 位号 | 分类 |
|---|---|---|---|---|---|---|---|---|
| 1 | `gate` | 闸门（闸板） | 渠道断面 + 闸板 + 启闭螺杆与手轮 | ✅ | ✅ | 56×44 | `GT` | 设备 |
| 2 | `weirGate` | 堰门 / 调节堰 | 堰板 + 可调堰顶横线 + 溢流箭头 | ✅ | ✅ | 72×40 | `WG` | 设备 |
| 3 | `flapGate` | 拍门 | 阀座 + 单向翻板（与止回阀同一"单向"口径） | ✅ | ✖︎（单向） | 40×36 | `FG` | 设备 |
| 4 | `parshallFlume` | 巴氏计量槽 | 矩形渠道 + 渐缩段 + 喉部 + 渐扩段，喉部标尺 | ✅ | ✖︎ | 96×44 | `FM` | 水线 |
| 5 | `uvDisinfection` | 紫外消毒装置 | 机箱 + 一排紫外灯管 + 进出水口 + 灯管接线 | ✅ | ✖︎ | 110×56 | `UV` | 水线 |
| 6 | `gritSeparator` | 砂水分离器 | 斜置螺旋 + 砂斗 + 溢流出水口 | ✖︎ | ✖︎ | 72×60 | `GS` | 设备 |
| 7 | `screeningsUnit` | 栅渣压榨机 | 斜向输送管 + 压榨段 + 出渣口 + 渗滤液回流口 | ✖︎ | ✖︎ | 76×56 | `SP` | 设备 |

分类归属（引擎侧的分类表，供 API 与测试用）：

- `WATER_UNIT_KINDS` +2：`parshallFlume`、`uvDisinfection`；
- `WATER_EQUIPMENT_KINDS` +5：`gate`、`weirGate`、`flapGate`、`gritSeparator`、`screeningsUnit`；
- `WATER_SLUDGE_KINDS` 不变（本批没有泥线配色图元，仍是浅蓝填充）。

下游业务分类（`symbol-catalog.ts` 的 4 类）：
水线 12 → **14**（+ `parshallFlume`、`uvDisinfection`）、设备 13 → **18**（+ 其余 5 个）、
泥线 4、边界 2；合计 **38**。

位号代号已与既有 31 个做过唯一性核对：`GT / WG / FG / FM / UV / GS / SP` 都不重复
（`tests/domain/symbol-catalog.test.ts` 的"同一代号不分配给两种符号"会守住这条）。

## 4. 介质与语义变更

### 4.1 两种新介质

| medium | 名称 | 颜色 | 线型 | 为什么这么定 |
|---|---|---|---|---|
| `backwash` | 反冲洗水 | `#0e7490` | 实线 | 滤池反冲洗是厂内回用水，是**水流**（不是空气/药剂），所以实线 |
| `reclaimed` | 中水 / 回用水 | `#4d7c0f` | 实线 | 行业习惯用绿色系表示回用水 |

两条都属于"回用水"，但去向不同（一条回滤池、一条出厂复用），与包内"回流污泥 / 剩余污泥分两条"
同一颗粒度。**不加沼气**：本厂不建厌氧消化，沼气线画不出来也不需要（YAGNI）。

### 4.2 闸门类纳入"可开闭"集合

`WATER_VALVE_KINDS` 由 `['valve', 'motorValve']` 扩为
`['valve', 'motorValve', 'gate', 'weirGate']`。

依据：`isWaterValveKind()` 的既有注释已经写明漏标的后果——"电动阀关着，流径却报通"。
闸门与堰门关到底同样断流，若只加图元不加这条，本批就会亲手引入同一类静默错误。
拍门**不进**这个集合：它靠水流方向自动开闭，与止回阀同属单向件，不参与"人为开闭"。

### 4.3 校验规则的影响

8 条规则本身不新增、不删除。行为变化只有一处：把闸门 / 堰门画在主流上并关闭阀门态时，
`flow-disconnected` 会像关阀一样报出断点（这是期望行为）。`sludge-without-disposal` 判据里
写死的 `['sludgeThickener','dewateringMachine','sludgeOut']` 保持不变。

## 5. 仪表功能代号（`analyzerCode`）

**问题**：本包已有"液位计 / 压力表"两种带内部字母的专用圆形仪表，而分析仪表只有一个通用 `A`。
**决定**：不给每种仪表加一个 kind（会产生 8 个近乎一样的图形，且与"`tag` 可自由覆盖"重复），
而是给 `analyzer` 加一个**功能代号参数**——画法不变（圆 + 内部代号），只让代号可配。

契约：

- 新 state 键 `analyzerCode: string`，默认 `''`；
- 仅 `kind === 'analyzer'` 时参与绘制，其他 kind 静默忽略（不报错）；
- 实际绘制 `code = analyzerCode || 'A'`；字号随长度收缩：≤2 字符用现字号，3 字符 ×0.8，
  ≥4 字符 ×0.62；文字盒取圆内接宽度并居中（`MLSS` 这类长代号也塞得进默认 36×36 的圆）；
- `__shapeKeys` 加入 `analyzerCode`，否则 `setState({ analyzerCode })` 不会触发重建；
- 新增导出 `WATER_ANALYZER_CODES`：`DO` 溶解氧 / `TU` 浊度 / `CL` 余氯 / `pH` / `ML` 污泥浓度 /
  `AN` 氨氮 / `COD` / `ORP` / `TP` 总磷 / `TN` 总氮（代号字典，供属性面板与文档引用）。

**向后兼容**：老快照没有这个键 → 取默认 `''` → 画 `A`，与今天的渲染逐像素一致；
下游内置案例的坐标与其它断言不受影响。

## 6. 类型、契约与下游影响

| 位置 | 影响 | 为什么 / 证据 |
|---|---|---|
| `WaterSymbolKind`、`WaterMedium` | 联合类型扩张（公开 API） | 新增 7 个 kind、2 个 medium |
| `WATER_SYMBOL_PRESETS`、`WATER_MEDIUM_STYLES` | **必须同步**，漏了编译不过 | 两者是 `Record<联合类型, …>` 穷举映射 |
| 下游 `SYMBOL_CATALOG` | **必须同步**，漏了编译不过 | 同样是 `Record<WaterSymbolKind, SymbolEntry>`，是全仓唯一一处穷举 |
| 下游 `DESIGN_LIMITS`、`UNIT_REMOVAL` | 不需改 | 都是 `Partial<Record<…>>` |
| 下游 `energy-meter` 分项 | 不需改 | 不在分项里的 kind 有"兜底进辅助与除臭"的逻辑 |
| 每帧 / 构建顺序 | 上游必须先 `npm run build` | 下游 `node_modules/ice-entity-designer` 是指向同级仓库的 **symlink**，解析的是上游 `dist/` |
| 快照（serialize / load） | 无需登记 codec | 水工艺走引擎 Serializer 的 v2 `scene`；`validateFlowSnapshot()` 只校验信封、节点级容错交给引擎（`FlowDesigner.ts:62`），新 state 键自动往返 |
| 取色预算棘轮 | `water_shapes.ts` 19 → **21**（登记 +2） | `tests/theme/color-budget.test.ts` 按文件计数；新增的是两种介质色（领域色板，非界面色），且该测试对"预算虚高"也报错，所以必须同步改数字 |

## 7. 非目标（本批明确不做）

1. **不改内置案例的拓扑**：上游 `examples/water-editor.html` 的 AAO 案例与下游 `plant-case.ts`
   都保持原样。理由：两处案例的流径、校验结论、版面体检都被大量 e2e 断言钉住，下游 `plant-case.ts`
   的坐标还写死用于"可复现的截图"（`scripts/shoot-screenshots.mjs` 产出的 `screenshots/` 34 张，
   供 README 引用）；为了演示新图元去动拓扑会把风险面放大一个量级。新图元的可见位置是**符号图例页**
   （上游 `examples/water-symbols.html` 遍历 preset 全出、下游"符号库"页 38 格），
   以及上游 e2e 里"每一种 preset 都能新建并渲染"那条用例（它遍历 preset，自动覆盖新图元）。
   案例里采纳新图元（例如把出水计量换成巴氏槽、在消毒后接紫外）留给下一批单独评估。
2. **不发 npm 版本**：下游用 `file:` 链接，本地上游 build 完即生效；要不要发版、要不要抬下游依赖，
   等代码全绿后单独决定。
3. **不细分成多个仪表 kind**（见 §5 的决定）。
4. **不加沼气线**（本厂无消化工段）。
5. **不做水力计算**、不改工艺校验规则集（沿用 `water-process-spec.md` §6 的既有边界）。

## 8. 验收

| 门禁 | 命令 | 守的是什么 |
|---|---|---|
| 上游单测 | `npm test`（含 `tests/water/`：preset 齐备、新图元画得出 ≥2 个派生形状、分类表、闸门可开闭、介质齐备、`analyzerCode` 渲染与字号、快照往返、关闸断流） | 图元与语义 |
| 上游类型 / 风格 | `npm run lint`、`npm run types:check` | 穷举映射同步 |
| 上游覆盖率棘轮 | `npm run test:coverage` | 既有阈值 |
| 上游 e2e | `npx playwright test e2e/water-editor.spec.ts`（收尾跑全量） | 符号数 31 → 38、示例页零 console error |
| 上游构建 | `npm run build` | 下游要用 `dist/` |
| 下游单测 | `npm run verify`（`types:check` + `jest` + `build`） | 目录齐备、分类计数 14/4/18/2、位号唯一 |
| 下游 e2e | `npx playwright test e2e/symbols-page.spec.ts e2e/login.spec.ts`（收尾跑全量） | 38 格全渲染、奇偶校验 38、版面体检 |
| 文档 | 人工核对 | `water-process-spec.md`（符号表 38 / 介质表 11）、`README.md` 两处、上游 `CHANGELOG.md` |

## 9. 实施顺序（详见随后的实施计划）

1. 上游 `water_shapes.ts` 按 TDD 补图元 / 介质 / 参数（先写失败测试）；
2. 上游 e2e 与文档数字同步、色值预算登记、`CHANGELOG`；
3. 上游门禁全绿后 `npm run build`；
4. 下游 `symbol-catalog.ts` 补 7 条 + 测试与 e2e 断言改 38、`MEDIUM_LABELS` 补两种介质；
5. 下游 `verify` + 定向 e2e 全绿；
6. 汇报结果（**不推送、不发版**，等指令）。
