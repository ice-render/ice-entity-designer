# Worker 镜像渲染：在 IED 上的真实验证

> 2026-09-20 实测（`examples/worker-mirror.html` + `e2e/worker-mirror.spec.ts`）。
> 引擎侧机制见 `ice-render/docs/architecture/10-worker-offscreen.md`。

## 这是什么

引擎把渲染拆成了两条通道：**主线程持有组件树与状态**（唯一真相、DOM 事件、命中检测），
**worker 持有一棵镜像树**只负责光栅化，画面用 `transferToImageBitmap` 回传。
这个例子把 IED 的流程图接上去，用真实图元（`FlowNode` / `FlowEdge`，含节点标题与连线标签）
量两件事：**画面对不对**、**主线程省了多少**。

```js
// 主线程（应用侧）
const ice = new ICE().init('view', { renderMode: 'full' });
const designer = new IED.FlowDesigner(ice),
const host = new ICE.MirrorHost({ canvas: view, ice, workerUrl: 'worker-mirror.worker.js' });
host.start();          // 接管落墨（几何通道）与显示（worker 位图）

// worker 侧（worker-mirror.worker.js）
ICE.init(offscreenCanvas.getContext('2d'));
IED.registerDesignerTypes(ice);        // ★ 见下：worker 这份 ICE 没有 Designer 来注册类型
const target = new ICE.MirrorTarget(ice);
```

## 实测结果（流程图，200 节点 / 799 组件 / 画布 900×620）

| 指标 | 主线程渲染（现状） | worker 镜像 | 结论 |
|---|---|---|---|
| **缩放平移**每帧主线程耗时 p50 | 1.90 ms | **1.20 ms** | **省 37%**（缓存整批失效，是所有图元重画的最重负载） |
| 拖动单个节点每帧 p50 | 3.20 ms | 2.80 ms | 省 12%（引擎的静态层 / 组件位图缓存已经把这类负载吸收掉了） |
| worker 内渲染耗时 | —— | 3.8 ms | 在主线程之外，不占帧预算 |
| 端到端延迟（改状态 → 位图回到主线程） | —— | **7.0 ms** | 约一帧量级：这是镜像方案的**真实代价** |
| 静止态几何对账 | —— | **399/399 逐项相等** | 每个节点的世界盒 + 连线两端点 |
| 静止态像素（worker vs 文档重建 / vs 主线程源树） | —— | **0 差异 / 0.00%（558000 像素）** | 含文字/连线：真实图元也能逐像素一致 |
| 全量重同步次数（改名 / 改类型 / 改位置三步） | —— | **0** | 派生更新按应用层入口重放，不靠重发文档兜底 |
| 文档体积（全量 scene 消息） | —— | 473 KB | 结构变更时才发（状态走增量补丁） |

规模趋势（同一负载，`?nodes=N`）：40/120/250/400 节点下主线程每帧 0.50/1.20/2.30/4.50 ms →
0.30/0.80/1.50/3.00 ms，**省 31%~46%**。

## 结论

1. **worker 镜像能让主线程的"缩放平移"类负载轻 30%~40%**，代价是约一帧的端到端延迟
   （4~6 ms）。对编辑器这类"交互为主、画面可以晚一帧"的场景，这笔交易是划算的。
2. **纯几何缓存已经很好的负载（拖动单个节点）收益有限**（12%）—— 引擎自己的静态层与组件位图
   早就把这类负载压下去了。所以要不要上 worker，取决于**场景里有没有大范围重绘**（缩放/平移、
   主题切换、批量改样式），而不是"有没有很多图元"。
3. **画面对得上**：初始态 worker 渲染与"同一份文档另建一台 ICE 直绘"**逐像素 0 差异**（含文字）；
   跑完基准、改完属性之后，worker 与主线程源树仍然**几何逐项相等、像素 0 差异**。

## 镜像的保真边界（重要）

**保真边界 = 序列化格式的保真边界 + 「派生逻辑跟着代码走」。**

IED 的 `FlowNode` / `FlowEdge` 是复合组件：节点内部的形状 / 标题 / BPMN 角标、连线上的标签都是
**派生子件**（构造函数按 state 造出来，**不写进序列化文档**）。worker 侧重建时它们是**新造**的
（id 与主线程不同），所以对它们的 `setState` 在 worker 里**没有寻址目标**。处理方式是两条：

1. **不镜像、只计数**：桥用 `isMirroredComponent()`（与 Serializer / Deserializer 同源判定）
   认出这类写入，**不发** op（发过去只会换来 `missing` → 全量重同步，实测每改一次节点重发
   **473KB**），计数落在 `bridge.skippedDerived` —— 宿主看得见，不是静默丢弃；
2. **重放应用层补丁**：worker 收到 `ops` 后走 `component.applyPatch()`（而不是裸 `setState`），
   于是应用层的派生逻辑（重建内部部件、重算连线走线、规范化老属性）在 worker 上**跑同一份代码**。
   这一条同时要求应用层自己把"有跟随者"的改动走公开入口：`FlowNode.applyPatch` 的位置改动走
   `setPosition()`（派发 `BEFORE_MOVE`/`AFTER_MOVE`）、尺寸改动派发 `AFTER_RESIZE` ——
   否则主线程这边连线不跟随，两边照样分叉。

结果是上面那张表里的 **399/399 几何一致 + 像素 0 差异**。这条边界剩下的含义是设计而不是缺陷：
**只改派生部件、容器状态没动**的写法不在文档模型内（`serialize → load` 往返也留不住它）。

## 结构变更也走增量（协议 v2）

编辑器里最高频的两件事是"加图元"和"删图元"，而它们在 v1 里是最贵的：结构一变就重发整份文档。
v2 起结构也走增量 —— `['add', parentId, 子树文档]` / `['remove', id]`，worker 侧用
`Deserializer.decodeInto()` 挂上并维护 id 索引（全量 `scene` 只在首次 / 拿不到可寻址 id / worker 报
`missing` 时发，作为兜底与自愈）。

本仓实测（200 节点 / 800+ 组件，"新建一个节点"）：

| | v1（结构 → 全量） | v2（结构增量） |
|---|---|---|
| 发出去的字节 | 485 924 B（474KB） | **1 037 B**（≈470×） |
| 全量重同步 | 1 次 | **0 次** |
| worker 那一帧 `renderMs` | 125.3 ms | **3.9 ms** |
| 端到端（改完 → 位图回来） | 165.5 ms | **9.7 ms** |

端到端那 53ms 里的大头不是镜像，而是**应用层自己的 `createNode`**（`__captureHistory()` 会给撤销栈
做一次整图快照）—— 这是下一步值得动的地方。

回归：`examples/worker-mirror.html` 的 `structureScenario()`（新建节点 + 连线 → 删除）+
`e2e/worker-mirror.spec.ts` 里那条断言：加 2 删 2 条结构 op、`appliedScenes` 不变、几何逐项一致。

## 文本口径（语言 / 字体）与直绘模式

- **语言**：worker 里没有主画布元素可继承，汉字字形（简/繁/日）会与主线程分叉 —— 宿主把主画布
  的 `lang` / `dir` 推过去（`text` 消息），worker 落到自己的 `ctx` 与 `root.textLanguage`，
  **组件缓存 / 静态层的离屏画布也继承同一口径**。本仓示例页给画布写了 `lang="zh-CN"`，
  e2e 断言 worker 侧 `ctx.lang` 与之一致。
- **字体**：宿主在主线程把字体字节取好交给 `MirrorHost` 的 `fonts` 选项，worker 用 `FontFace` +
  `self.fonts` 注册（运行时不支持时如实报 `fontErrors`、不抛）。
- **直绘模式（本页不具备条件）**：`transferControlToOffscreen` 要求显示画布**还没有 2d 上下文**，
  而本页把引擎 init 在同一块可见画布上（输入要绑它）。想直绘要把显示层与"输入/量测层"拆成两块
  画布 —— 引擎参考宿主 `ice-render/examples/worker/mirror-render.html?direct=1` 是完整示例
  （直绘与位图两条路径的**页面截图逐字节一致**）。

## 图片下发与"落墨占比"护栏

- **图片下发**：worker 里没有 `Image` 构造器 —— 在此之前**带图片的图（如游戏厅的壁纸/图标、
  组件库的 `ICEImageView`）会让整个镜像退回主线程**（实测加一个 `ICEImage` 就 `hostActive: false`）。
  现在主线程渲染发现用图 → 宿主解码成 `ImageBitmap` → 零拷贝下发，worker 直接画（未到达时"未加载"
  不抛，到了会把用到它的组件标脏重画）。
  ⚠️ **边界**：**缩放绘制**时 Chromium 对 `Image` 与 `ImageBitmap` 的重采样不同（原图 1:1 逐点一致；
  缩到 72×72 差 770 像素/最大 93）——要严格一致就按原图尺寸绘制。
- **"落墨占比"三档护栏**（本仓 `headroom()` + e2e）：主线程直绘 / 几何通道（删掉落墨、不启 worker）/
  worker 镜像。镜像是把"落墨"那一档搬走，所以**收益上界 = 落墨占比**。
  实测（200 节点、缩放的视口负载）：主线程 1.90ms → 几何通道 1.20ms → 镜像 1.20ms，**占比 37%**；
  用例钉住区间（占比 ∈ (0.1, 0.75)、镜像 ≤ 几何通道 × 1.25），掉出区间说明"测的东西变了"。

## 兼容保护：某些浏览器上不去 worker 怎么办

**不支持的宿主上，页面必须与"从没接过 worker"一模一样** —— 这是机制（`MirrorHost`）保证的，
应用只需要**接住回退回调**。三道闸 + 一个固定动作：

| 闸 | 覆盖的失败 | 机制 |
|---|---|---|
| 启动前探测 | 没有 `Worker` / `OffscreenCanvas`+`transferToImageBitmap` / `ImageBitmap` | `ICE.MirrorHost.detect({ canvas })`；探测不过**根本不接管落墨通道** |
| 启动期兜底 | CSP `worker-src`、`file://`、企业策略让 `new Worker()` 同步抛；脚本 404 / 顶层抛；worker 自报没有 OffscreenCanvas；协议版本不一致 | try/catch + `ready` 握手（默认 4s）+ `caps`/版本校验 |
| 运行期看门狗 | worker 卡长任务 / 画布分配失败 / 被宿主掐掉（不一定触发 `onerror`） | 背压下"有帧在途却超时无位图" = 已死 → 回退 |

回退动作固定三步：**还原落墨通道与缓存开关 → 立刻用主线程重绘一帧 → 上报**
（`onFallback({reason, message, support})` + 一条 `MIRROR_FALLBACK` 事件）。
本仓示例页把回退原因显示在日志里、并把模式切回主线程（`window.__mirrorFallback` 供测试读取）：

```js
const support = ICE.MirrorHost.detect({ canvas: view });   // 不支持就别接
if (support.supported) {
  host = new ICE.MirrorHost({
    canvas: view, ice, workerUrl: 'worker-mirror.worker.js',
    fallback: 'auto',                                       // 默认就是 auto
    onFallback: (info) => console.warn('[镜像回退]', info.reason, info.message),
  });
  host.start();
}
```

两个开关供测试/运维用（与引擎参考宿主同一套口径）：`?backend=main` 强制主线程渲染、
`?worker=<url>` 换成（可以是坏的）worker 脚本。回归：`npx playwright test e2e/worker-mirror.spec.ts`，
其中两条用例分别覆盖"worker 脚本 404 → 自动回退且画布仍可用、改状态画面跟着变"与
"`?backend=main` 页面照常可用"。

## 一个"看不到状态分叉、只看得到滞后"的坑（已修）

镜像的帧节拍原先**没有背压**：主线程每步都发 `frame`，而 worker 一帧要几毫秒 —— 一个 30 帧的基准
跑完，worker 侧积压了 200+ 条 `frame` 消息（`renderedSeq=45` vs `lastFrameSeq=240`），镜像要好几秒
才追上，期间画出来的每一帧都是**过时**状态，静止态对账还会把它误读成"状态分叉"（实测差 2px 的
那种假差异）。现在 `MirrorHost` **至多一帧在途**，并且 `frame` 带 `seq`、worker 原样回传 ——
宿主用 `host.renderedSeq >= bridge.lastFrameSeq` 这组水印判断"这张位图是哪一帧"，本仓示例页的
`settle()` 就是这么做的（静止态比对前必须先排空）。

## 这次验证顺带修掉的缺陷（7 个：引擎 5 + IED 2）

真实应用的负载把"只有真跑起来才会暴露"的问题一次性挖了出来：

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| 1 | 真实图元一画就抛 `this.ctx.fillText is not a function` | 几何通道（`createGeometryOnlyContext`）漏登记 `fillText`/`strokeText` | 补齐成员并按源码加**守卫测试**（引擎新用一个 ctx 成员却没登记就变红） |
| 2 | **容器型组件状态完全进不了镜像**（拖 FlowNode 不动） | `ICEGroup.setState` 是**完全覆盖**、不经过 `ICEComponent.setState` 的钩子 | 在 `ICEGroup.setState` 里补钩子 + 守卫测试（每个 `setState` 覆盖要么调 `super`、要么自己报信） |
| 3 | 缩放/平移后，镜像始终停在旧视口 | 协议里**没有视口消息**；且新起的镜像不会对齐"当前视口/选择" | 加 `viewport` 消息 + `MirrorBridge.prime()`（接上 worker 时先对齐现状） |
| 4 | 切回主线程渲染后画面整体错位（缩放了 1.6 倍） | `MirrorHost` 的 2d 合成没复位画布上下文 —— 主画布上还留着上一个组件的 CTM | 合成前 `save + setTransform(单位) + 复位 alpha/composite + clearRect + drawImage + restore` |
| 5 | **用属性面板 / 脚本改位置，连线不跟随**（拖拽却正常） | `FlowNode.applyPatch` 直接写 `setState({left,top})`，没过引擎的 `setPosition()`（只有它会派发 `BEFORE_MOVE`/`AFTER_MOVE`）；尺寸同理没派发 `AFTER_RESIZE` | `applyPatch` 里位置走 `setPosition()`、尺寸前后派发 `BEFORE_RESIZE`/`AFTER_RESIZE`；`FlowDesigner.__applyPatch` 把程序化补丁标成"不是拖拽会话"（免得历史重复、下次真拖拽丢撤销点） |
| 6 | 镜像里**连线不跟手**、改了标题还是旧文字 | worker 侧只落 `setState`，应用层派生（重建 / 重布线）没重放 | `MirrorTarget` 走 `component.applyPatch()` 重放（引擎基类新增 `ICEComponent.applyPatch`，默认 `= setState`） |
| 7 | 静止态对账"镜像落后一大截"（像状态分叉，实际是滞后） | 帧节拍没有背压：`frame` 消息积压 200+ 条 | `MirrorHost` 至多一帧在途 + `frame.seq` 水印（`renderedSeq`/`lastFrameSeq`） |

## 怎么跑

```bash
# 前置：node_modules/ice-render 要含 MirrorHost / MirrorTarget —— 4.0.0 及以上即可跑镜像与兼容回退；
# 结构增量（协议 v2）与"起不来就回退"的最新口径要**工作区版本**（下一个小版本发布后即 ^4.1.0）
#（本地开发：ln -s <workspace>/ice-render node_modules/ice-render 后 npm run build）
npm run build           # 先构建 IED 产物（示例页从 ../dist 与 node_modules/ice-render 取）
npx http-server . -p 8091 -c-1
# 浏览器打开 /examples/worker-mirror.html?nodes=200，按钮可切换渲染通道、跑基准、像素比对
npm run test:e2e -- worker-mirror   # 自动化验收
```
