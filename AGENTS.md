# AGENTS.md — ice-entity-designer

## 项目定位

基于 **ice-render** 内核的领域设计器合集（ER / 流程图 / BPMN / UML / 状态机 / 甘特 / 电力一次 / 电力二次），
领域图元以 `ice-entity-designer:*` 命名空间注册；`examples/*.html` 是可直接打开的完整编辑器。

## 分支与发版约定（家族铁律，2026-09-13 确立）

- **开发**：一律在 `dev`（或从它切出来的临时分支）上做；`master` 只做集成与发版。
- **发版前**：必须先把 `dev` 合并进 `master`，**再从 `master` 发版**（跑门禁 → `npm publish`）。
- **禁止**：直接在 `master` 上写实现，也禁止只更新 `dev` 而让 `master` 停在旧版本 ——
  本仓 2026-09-13 踩过：远端默认分支是 `master`，而 0.2.x 全发在 `dev` 上，
  仓库首页长期显示 0.0.40 时代的代码（后来才补上快进）。远端默认分支必须指向 `master`，
  且发版后它与 `dev` 内容一致。
- 本仓主线名：`dev`（开发）+ `master`（发版）；远端 `origin`（Gitee）+ `origin-github`（GitHub），两处都要推。

## 门禁

- `npm run lint`（eslint，0 error 起步）/ `npm run types:check` / `npm test`（jest 315 用例）/ `npm run build`
- `npm run test:e2e`：Playwright，覆盖 9 个编辑器示例页（含 BPMN 令牌仿真）

## 引擎契约

仿真 / 动画等应用层逐帧逻辑必须遵守引擎的帧调度契约：自行监听 `ICE_FRAME_EVENT` 做计算时，
要 `ice.setContinuousFrames(true)`（用完归还），否则引擎空闲停帧会让逻辑停摆
（见 `src/bpmn/BpmnSimulator.ts` 的 `__acquireContinuousFrames`）。

**连线端点手柄（hook / slot）**：本仓所有域包的连线都是 `transformable: false`（记法不可变换，
不给旋转/缩放手柄）—— 这**不影响**"点连线出现端点手柄、拖动端点改连接"的能力
（引擎把端点手柄独立到 `linkEditable` 默认开；该修复在引擎 dev 上，随下一个补丁版发布）。
回归：`e2e/link-hooks.spec.ts`（点线 → 手柄可见 →
拖拽中出插槽 → 落在插槽上改接）。改 `Relation` / 各域包连线类时不要动 `transformable` 的语义，
也不要往 `project_codec.ts` 之外新增 state 键（`tests/designer/codec-completeness.test.ts` 会拦）。

## BPMN 可连接性（2026-09-13 确立）

引擎的 `linkable` 是"能不能作为**任何**连线端点"的单一开关，本身不区分连线类型；本设计器目前只实现
**顺序流（Sequence Flow）**，因此按顺序流语义取默认值（见 `src/flow/FlowNode.ts` 的 `NOT_LINKABLE_KINDS`）：

| 图元 | 可作为顺序流端点 | 依据 |
|---|---|---|
| 事件 / 任务 / 网关 / 子流程 | ✅ | 流元素，顺序流的合法端点（起止事件的入边/出边限制属于流程校验，不在可连接性里表达） |
| 池 Participant | ❌ | 顺序流**不得跨越池边界**；池只接受**消息流** —— 将来支持消息流时按**连线类型**判断，而不是放开这个开关 |
| 泳道 Lane | ❌ | 组织分区，任何连线都不连它 |
| 注释 Text Annotation | ❌ | 只能通过**关联 Association** 连到流元素 |
| 数据对象 Data Object | ❌ | 只能通过**数据关联 Data Association** 连 |

另外：FlowNode 的**内部装饰子组件**（形状 / 标签 / 角标）一律 `linkable: false` ——
可连接性只由外层 FlowNode 按 kind 决定，否则泳道/池的内部形状会被插槽系统选中（插槽贴到它们身上，
实测就是这样"错乱"的）。回归：`tests/bpmn/bpmn-linkable.test.ts`。

## 各域包的可连接性（2026-09-13 逐示例审计）

引擎的 `linkable` 是"能不能作为**任何**连线端点"的单一开关，各域包按自己的语义给默认值：

| 域包（示例） | 可连接（接线对象） | 不可连接（语义） |
|---|---|---|
| ER（`entity-editor`） | 实体表 | — |
| 流程图（`flowchart-editor`） | 起止/处理/判定/输入输出（都是流元素） | — |
| BPMN（`bpmn-editor`） | 事件 / 任务 / 网关 / 子流程 | **池**（只接受消息流）、**泳道**、**注释**、**数据对象** |
| UML（`uml-editor`） | 类 / 接口 / 枚举（分类器） | —（将来加 注释/包 时它们不可连接） |
| 状态机（`statechart-editor`） | 状态 / 复合状态 / 初始与终止伪状态 | —（伪状态也是转换的合法端点） |
| 甘特（`gantt-editor`） | 任务条 | **时间标尺（GanttRuler：表头 + 刻度）** |
| 电力一次（`power-editor`） | 设备符号、母线、电缆 | —（`cubicle` 按 GB/T 4728.1 是"方框符号=设备"，仍可接线） |
| 电力二次（`secondary-editor`） | 二次元件、**端子** | **端子排（TerminalStrip）**（容器：接线连到端子，不连到端子排本身） |

另外：以上所有域包内部**装饰子组件**（形状 / 标签 / 角标 / 刻度线）都不该参与可连接判定 ——
可连接性属于外层节点。本仓已把 BPMN、甘特标尺、端子排的装饰件改为 `linkable: false`；
其余域包的装饰件与外层节点包围盒一致（选中它们不影响观感），暂未一并改，改动前先按
"装饰件包围盒是否可能小于外层节点"评估。回归：`tests/designer/connectability.test.ts`。

## 新域包验收清单（2026-09-14 确立）

新开一个域包（或给已有域包加图元）时，除了「形状 + 应用层 + 语义校验 + 快照往返 + 示例页 + e2e」，
下面两条**铁律**必须逐条核对，并且都有跨包测试兜底（漏标会被 CI 挡下来）：

1. **记法不可变换** —— 图元与连线一律 `transformable: false`（只允许拖动）。
   尺寸/朝向是记法的一部分；需要变尺寸的元素走属性面板的数值入口。
   回归：`tests/designer/notation-not-transformable.test.ts`。
2. **派生部件不可连接、不可交互** —— 位号、名称、内部形状（气泡、栅条、折流板…）一律
   `linkable: false` + `interactive: false`，**只有符号本体可连接**；连线本体一律 `linkable: false`。
   原因：`ICELinkSlotManager` 会拉平整棵树去找 `linkable` 组件，漏标就会把连线插槽吸附到文字上。
   回归：`tests/designer/derived-parts-not-linkable.test.ts`。

另外三条经验（都踩过）：

- 组内坐标系原点在**左上角**：形状按「中心相对坐标」写、由绘图辅助统一加原点偏移；文字用
  `显式文字盒 + textAlign/textBaseline` 居中（不给盒、靠自己估宽会又偏又挤）。
- 空心符号的 `fillStyle` 不能给 `false` / `'none'`（会退化成实色），显式给白色。
- 轴对齐直线与闭合折线会让包围盒在某一维退化为 0，触发离屏缓存的零尺寸 canvas 报错：
  直线改画细矩形、闭合形拆成「开放折线 + 单独一条闭合边」。
