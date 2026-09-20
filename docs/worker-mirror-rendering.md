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
| 拖动单个节点每帧 p50 | 2.60 ms | 2.50 ms | 省 4%（引擎的静态层 / 组件位图缓存已经把这类负载吸收掉了） |
| worker 内渲染耗时 | —— | 2.8 ms | 在主线程之外，不占帧预算 |
| 端到端延迟（改状态 → 位图回到主线程） | —— | **4.7 ms** | 约一帧量级：这是镜像方案的**真实代价** |
| 初始态像素（worker vs 文档重建） | —— | **0 差异** | 含文字/连线：真实图元也能逐像素一致 |
| 文档体积（全量 scene 消息） | —— | 473 KB | 结构变更时才发（状态走增量补丁） |

规模趋势（同一负载，`?nodes=N`）：40/120/250/400 节点下主线程每帧 0.50/1.20/2.30/4.50 ms →
0.30/0.80/1.50/3.00 ms，**省 31%~46%**。

## 结论

1. **worker 镜像能让主线程的"缩放平移"类负载轻 30%~40%**，代价是约一帧的端到端延迟
   （4~6 ms）。对编辑器这类"交互为主、画面可以晚一帧"的场景，这笔交易是划算的。
2. **纯几何缓存已经很好的负载（拖动单个节点）收益很小**（4%）—— 引擎自己的静态层与组件位图
   早就把这类负载压下去了。所以要不要上 worker，取决于**场景里有没有大范围重绘**（缩放/平移、
   主题切换、批量改样式），而不是"有没有很多图元"。
3. **画面对得上**：初始态 worker 渲染与"同一份文档另建一台 ICE 直绘"**逐像素 0 差异**（含文字）。

## 镜像的保真边界（重要）

**镜像的保真边界 = 序列化格式的保真边界。**

IED 的 `FlowNode` / `FlowEdge` 是复合组件：节点内部的图标 / 文字、连线上的标签都是**派生子件**
（构造函数按 state 造出来，**不写进序列化文档**）。worker 侧把文档重建成树时，这些子件是**新造**的
—— 于是：

- 它们的 **id 与主线程那一份不同**，应用层对它们做的 `setState`（例如拖动节点后按新位置重排
  连线标签）在 worker 侧**找不到目标**（协议会报 `missing` 并触发一次全量重同步）；
- 结果是：几何（节点世界盒）逐项一致，**只有这些子件的视觉细节会差一点**。
  实测：119 个节点里 3 个不一致（全是连线标签），像素差约 9%（只落在标签周围）。

要彻底消掉这批差异，有两条路（都还没做）：

1. **让它们进文档**：`FlowNode` / `FlowEdge` 实现 `getSerializableChildren()`，把派生子件的
   状态写进快照（引擎的序列化机制支持，见 `docs/architecture/06-serialization.md`）；
2. **镜像按"结构路径"寻址**（而不是 id）：协议加一条"这是容器 X 的第 N 个派生子件"的寻址方式。

在那之前，宿主可以：把这类子件排除在"必须逐像素一致"的验收之外（本仓的 e2e 就是这么做的），
或者干脆让应用只镜像"文档里有的那部分"。

## 这次验证顺带修掉的引擎缺陷（4 个）

真实应用的负载把"只有真跑起来才会暴露"的问题一次性挖了出来：

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| 1 | 真实图元一画就抛 `this.ctx.fillText is not a function` | 几何通道（`createGeometryOnlyContext`）漏登记 `fillText`/`strokeText` | 补齐成员并按源码加**守卫测试**（引擎新用一个 ctx 成员却没登记就变红） |
| 2 | **容器型组件状态完全进不了镜像**（拖 FlowNode 不动） | `ICEGroup.setState` 是**完全覆盖**、不经过 `ICEComponent.setState` 的钩子 | 在 `ICEGroup.setState` 里补钩子 + 守卫测试（每个 `setState` 覆盖要么调 `super`、要么自己报信） |
| 3 | 缩放/平移后，镜像始终停在旧视口 | 协议里**没有视口消息**；且新起的镜像不会对齐"当前视口/选择" | 加 `viewport` 消息 + `MirrorBridge.prime()`（接上 worker 时先对齐现状） |
| 4 | 切回主线程渲染后画面整体错位（缩放了 1.6 倍） | `MirrorHost` 的 2d 合成没复位画布上下文 —— 主画布上还留着上一个组件的 CTM | 合成前 `save + setTransform(单位) + 复位 alpha/composite + clearRect + drawImage + restore` |

## 怎么跑

```bash
# 前置：node_modules/ice-render 需要**含 MirrorHost / MirrorTarget 的版本**
#（本仓 peer 声明是 ^3.0.0；这批能力随下一个引擎版本发布。本地开发可以把工作区引擎链进来）
npm run build           # 先构建 IED 产物（示例页从 ../dist 与 node_modules/ice-render 取）
npx http-server . -p 8091 -c-1
# 浏览器打开 /examples/worker-mirror.html?nodes=200，按钮可切换渲染通道、跑基准、像素比对
npm run test:e2e -- worker-mirror   # 自动化验收
```
