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

- `npm run lint`（eslint，0 error 起步）/ `npm run types:check` / `npm test`（jest 37 suites / 398 用例，2026-09-19 实测）
  / `npm run test:coverage`（棘轮：statements 88 / lines 88 / branches 74 / functions 85）/ `npm run build`
- `npm run test:e2e`：Playwright，覆盖 9 个编辑器示例页（含 BPMN 令牌仿真）
- **引擎改动之后的下游回归**走引擎仓的脚本（它会把本仓的 `node_modules/ice-render` 临时指向工作区引擎、
  跑完还原）：`npm run regression:affected`（日常：本仓会被判定为"受影响的成员"而跑 e2e）、
  `npm run regression:family`（发版前全量）。先看它打算跑什么：`--dry-run`；
  只想跑本仓：`node scripts/family-regression.cjs --tier=affected --only=ice-entity-designer`。

## 示例页写法（2026-09-17 确立，11 个示例页已全部统一）

> **契约正文不在本仓**：应用页面 / 示例页怎么写（一页一类、稳定结构的边界、`onUpdate()` 的
> 边界、入口决策表、验收清单、常见坑）单一来源是
> `ice-web-components/docs/guides/app-pages.md`。本仓只记**示例页特有**的部分 —— 最要紧的
> 一条：示例页是**纯用户驱动**的，刷新入口就是用户动作本身，所以**不加 `onUpdate()`**。

`examples/*.html` 是"可直接打开的完整编辑器"，脚本仍然是内联的（**不拆文件、不套构建**），
但内部一律是**一页 = 一个类**：

- 类名按页面取（`FlowchartEditorPage` / `EntityEditorPage` / `WaterSymbolsPage` …）；
- **构造期建好**：引擎实例、DOM 引用、第三方绑定（如 antd）、交互态、事件一次到位；
- `onUpdate()` 是**唯一**刷新入口（选中变化 / 增删 / 撤销 / 改属性 / 布局都走它）；
  纯静态目录页（`power-symbols` / `water-symbols`）没有 `onUpdate()` —— 页面没有随数据变化的部分；
- 事件按职责分组：`__wireCanvas()`（滚轮缩放）/ `__wireCanvasInteraction()`（指针）/ `__wireToolbar()`（按钮）/ `__wireGlobalEvents()`（全局键）；
- 内置案例坐标写死（保证 e2e / 截图可复现），收进 `buildCase()`，配套的小工厂（`makeEntity` / `rel` / `put`）
  是它的**局部箭头函数**。

### 成员顺序（2026-09-17 定，全家族同口径）

页面类里的成员按这个顺序排 —— 棘轮里就是正则 `S*T*F*C*(A|M)*`：

```
static 常量/字段  →  static 方法  →  实例字段  →  构造函数  →  访问器 / 实例方法
```

11 个示例页本来就是这个形状，只有 `flowchart-editor` 的 `static SEED_FLOW`（内置案例数据）
落在构造函数之后 —— 2026-09-17 挪到类首，顺手把那段参差的缩进对齐。

**只到这一层**：不查 public/private 的先后，也不查同组内谁先谁后。Google Java Style §3.4.2
明确说成员顺序"**没有唯一正确的配方**"（要的是每种顺序都讲得通、维护者能解释），
Google 的 TypeScript 指南对顺序**完全沉默**（全文 "ordering" 出现 0 次）。

**口径只管 `examples/`**：本仓的 `src/` 是**库**（16 个类偏离，形态是"静态工厂/工具方法放
类尾"与"私有字段紧挨着用到它的方法"），存量**不搬迁** —— 为排版给引擎级代码搬家不划算，
而且 **TS 里字段的声明顺序是有语义的**（初始化按声明顺序执行 + 影响 V8 的 class shape）。
新代码照契约写，老代码遇到再改。

⚠️ **挪位置前先分清挪的是什么**：**方法随便挪**（类定义时方法就全部装好，与文本顺序无关）；
**字段的声明顺序有语义** —— 初始化按声明顺序执行，还影响 V8 的 class shape。所以挪
`static` 字段（例如 `SEED_FLOW`）要确认它跟别的 `static` 字段/静态块没有顺序依赖，
挪实例字段要确认初始化表达式互不依赖。

棘轮：`tests/examplesConvention.test.ts` 的最后一条。

### 改造时踩过的坑（改示例页前先看）

1. **嵌套函数声明不继承 `this`**：把 `function helper()` 写进方法里，里面的 `this.designer` 会落到 `window` 上
   （电力示例因此只建出 10 个设备就中断）。要么改成箭头函数，要么让它只吃参数。
2. **当作 React 组件传的方法要 `bind`**：`React.createElement(this.PropertyPanel, …)` 会丢 `this` ——
   在构造期 `this.PropertyPanel = this.PropertyPanel.bind(this)`（**bind 一次**，不要每次 render 新建，否则整棵重挂）。
3. **别把方法直接当回调传**：`addEventListener('click', this.applyForceLayout)` 里 `this` 是元素，不是页面实例 ——
   统一写成 `() => this.applyForceLayout()`。
4. **方法定义不能嵌套**：`__wireCanvasInteraction()` 里再写 `rootNodeAt(...) {}` 是语法错误，方法要平铺在类上。
5. **机械替换会误伤字符串**：用脚本把裸 `designer` 换成 `this.designer` 时，`'ice-entity-designer:TerminalStrip'`
   这类 typeId 常量也会被改（二次回路示例因此有个分支永远走不到，e2e 恰好没覆盖）。

### 改造的验收口径（每个示例页都按这个走）

- 自己的 spec 全绿；
- **画布截图 0 像素差异** + 结构快照逐字段一致；
  例外：`entity-editor` 内置**力导布局**每次运行结果本来就不同（改造前后各自连跑两次都是不同视口），
  该页改比"确定性部分"——实体数 / 关系数 / 全部实体名 / 全部关系标签 / 每张表字段数 / 面板 HTML 长度 / 控制台零错误；
- **裸方法调用扫描为 0**（`class` 方法被当成函数裸调 = 漏了 `this.`，运行期才炸）。

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

**Worker 镜像渲染（2026-09-20 实测落地）**：引擎可以把光栅化放到 Web Worker
（主线程持有状态与命中检测，worker 只有镜像树）。接本仓时记住两条：
① **worker 侧那台 ICE 没有任何 Designer**，图元类型必须显式注册 —— 用
`IED.registerDesignerTypes(ice)`（漏了不报错，只会静默跳过整棵未注册子树）；
② **只有"文档里的组件"能被镜像寻址**：`FlowNode` / `FlowEdge` 的派生子件（形状 / 标题 /
角标 / 连线标签）不进文档，对它们的写入不进镜像（计数在 `bridge.skippedDerived`），靠 worker 侧
**重放 `FlowNode.applyPatch`** 重算；③ **"有跟随者"的改动必须走公开入口**：位置用
`setPosition()`（派发 `BEFORE_MOVE`/`AFTER_MOVE`）、尺寸派发 `AFTER_RESIZE` —— 直接写
`setState({left,top})` 会让连线不跟随（拖拽却正常，这种分叉只从面板/脚本路径暴露，2026-09-20 实测抓到），
并且程序化补丁要在 `FlowDesigner.__applyPatch` 里标记"不是拖拽会话"（否则历史重复、下次真拖拽丢撤销点）；
④ **结构增量（协议 v2）要引擎工作区版本**：`['add', parentId, 子树文档]` / `['remove', id]`
（4.0.0 只有状态补丁，结构一变仍重发整份文档）。本仓的 `structureScenario` 与 e2e 断言依赖它，
所以本地跑镜像 e2e 要把工作区引擎链进 `node_modules/ice-render` 再 `npm run build`。
⑤ **镜像必须能"起不来就回退"**：探测不过 / `new Worker` 抛错 / `ready` 握手超时 / 运行期看门狗
判定已死 → 引擎会还原落墨通道并立刻用主线程重绘一帧，然后回调 `onFallback`；**应用要接住它**
（切回主线程模式、如实显示原因），否则用户看到的是"画面冻住、也不报错"。示例页有
`?backend=main` 与 `?worker=<坏脚本>` 两个开关专门测这条；
⑥ **静止态验收必须先排空**：`frame` 带 `seq`，等 `host.renderedSeq >= bridge.lastFrameSeq`（示例页的
`settle()`），不要用"又收到一张位图"判断。实测数据、结论与修掉的坑见
`docs/worker-mirror-rendering.md`；示例页 `examples/worker-mirror.html`，回归
`e2e/worker-mirror.spec.ts`。

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

## 布局机制的使用边界（2026-09-15 排查结论）

引擎的布局机制（`setLayout` + `ICELayoutManager`）在 2.8/2.9 已对齐 Swing 并补齐（不继承 /
自顶向下校验 / 尺寸协商 / 快照往返 / 交叉轴对齐 / 等分网格）。**本仓的使用边界**：

- **画布上的图元继续用绝对坐标**：这是设计器语义 —— 用户在拖，位置就是数据
  （`left/top` 随快照走）。不要给画布节点套布局器。
- **端子排（`TerminalStrip`）复核结论：保留手写坐标**（2026-09-15 第二轮逐点审计，推翻上一轮的"待迁"结论）。
  上一轮把它当成"纵向等距"的候选，复核后发现**引擎布局接管与它的语义冲突**：
  `ICEGroup.setLayout()` 会（默认）对整棵子树 `transformable=false / draggable=false`
  （见 `ICEGroup.__disableTransformRecursively`：位置由布局决定，用户不能再拖）——
  而二次图里的**端子是可拖的实体**（位置是数据，随快照走），端子排只是个"让端子一起动的容器"。
  一旦挂上布局器，端子就再也拖不动了；用 `setLayout(manager, { disableTransform: false })`
  只是打了折（拖完下一次重排又会被拉回去）。
  另外端子必须是 `strip` 的**直接子节点**（`terminal.parentNode === strip` 是既有语义，
  本仓单测与 e2e 都按这条断言）。
  高度按内容自适应确实是缺口，但那是**组件级策略**（新建/删除端子时重算 `state.height`），
  不需要把位置交给布局器 —— 与 `ICETable` 的"行几何"同一条口径（见 `ice-web-components`
  `docs/guides/layout.md` 第四节的 canvas 类）。
- **图表几何不是布局**：`ice-chart` 的漏斗/饼图/桑基/仪表等是系列自身的几何（已复核，见该仓），
  `force` 布局是图论物理，两者都不该塞进容器布局器。


## 主题写入契约（引擎 2.14 起，2026-09-17）

本仓写引擎主题一律走**命名补丁** `ice.setThemePatch('ice-designer', { semantic: { chrome } })`，
**不要**调 `ice.setTheme()` / `ice.setChrome()` —— 那是"基座"（UI 主题的地盘），两边都写基座就是
"后写的赢"：应用切 UI 主题会把设计器外壳抹掉，设计器推外壳会把 UI 主题抹掉。

优先级：**基座 < 命名补丁**（按注册顺序）。所以宿主想改设计器的外壳颜色，要用**自己的补丁**
（`ice.setThemePatch('host', { semantic: { chrome: … } })`，注册在设计器之后）——`setChrome` 压不住补丁；
要整个回到引擎默认外壳用 `clearThemePatch('ice-designer')`。

两条纪律：

- **派生值要跟着基座重算**：设计器外壳是从 `semantic.primary/success/warning` 派生的
  （见 `src/theme/designerTheme.ts`），补丁本身不会自己变 —— 所以 `applyDesignerChrome()` 会
  订阅 `ice.onThemeChange`，基座一变就重算补丁（只认 `kind === 'theme'`，避免自己触发自己）。
- **写死色值有预算棘轮**：`tests/theme/color-budget.test.ts`（只减不增）。写死色值不是一律禁止
  （图形本身有领域配色），但新增必须登记，不能顺手写。
