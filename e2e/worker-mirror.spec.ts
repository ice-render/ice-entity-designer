/**
 * **真实应用验证**：ICE 家族的 worker 镜像渲染，接在 IED 的流程图上跑。
 *
 * 这个用例回答两个问题（也是"要不要上 worker 渲染"的全部依据）：
 *
 * 1. **画面对不对**：worker 侧镜像渲染出来的流程图，必须与主线程源树的直绘**逐像素一致**。
 *    场景是真实图元（`FlowNode` / `FlowEdge`，含节点标题与连线标签）—— 文本度量与字形栅格化
 *    两边必须一致，否则对编辑器就是不可用。
 * 2. **主线程省了多少**：同一件逻辑工作（改状态 + 让这一帧落地）在两种渲染通道下的
 *    **主线程阻塞时间**。刻意分开报两类负载：
 *    - `drag`（改一个节点）：引擎自己的静态层 / 组件位图缓存已经把代价吸收掉了，收益有限；
 *    - `viewport`（缩放平移）：两级缓存整批失效、所有图元按新栅格重画 —— 这才是 worker 该省的。
 *    混成一个平均数只会掩盖结论，所以这里分开断言、分开打印。
 *
 * 基准页：`examples/worker-mirror.html`（`?nodes=N` 控制规模）。
 *
 * ⚠️ 前置：`node_modules/ice-render` 必须是**含 `MirrorHost` / `MirrorTarget` 的版本**。
 * 本仓 peer 声明是 `^3.0.0`，这批能力随下一个引擎版本发布；引擎未发布前，本地把工作区引擎
 * 链进来再跑（`ln -s <workspace>/ice-render node_modules/ice-render`）—— 见
 * `docs/worker-mirror-rendering.md` 的"怎么跑"。
 */
import { test, expect } from '@playwright/test';

type Bench = { p50: number; p95: number; components: number; workload: string };
type BenchAll = {
  main: { viewport: Bench; drag: Bench };
  mirror: { viewport: Bench; drag: Bench };
  latency: { p50: number };
  worker: { renderMs: number; frames: number; appliedViewports: number } | null;
  sceneBytes: number;
};

test('worker 镜像（IED 流程图）：画面与主线程逐像素一致，主线程帧成本显著下降', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/examples/worker-mirror.html?nodes=200', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__ready(), undefined, { timeout: 30_000 });

  // ① 初始态：worker 镜像 vs "用同一份文档另建一台 ICE 直绘" —— 必须严格 0 差异
  await page.evaluate(() => (window as any).__setMode('mirror'));
  await page.waitForTimeout(400);
  const initial: any = await page.evaluate(() => (window as any).__compare());
  expect(initial.diff, `初始态逐像素一致：${JSON.stringify(initial)}`).toBe(0);

  // ① 几何对账（基准**之前**）：镜像里的每个节点，世界盒必须与主线程**逐项相等**。
  const treesBefore: any = await page.evaluate(() => (window as any).__compareTrees());
  expect(treesBefore.equal ? 'ok' : `镜像与主树的节点世界盒不一致：${JSON.stringify(treesBefore)}`).toBe('ok');
  expect(treesBefore.count, '应当对账到足够多的节点').toBeGreaterThan(100);

  // ② 两类负载 × 两种通道
  const bench: BenchAll = await page.evaluate(() => (window as any).__page.benchBoth(90));
  const saveViewport = 1 - bench.mirror.viewport.p50 / bench.main.viewport.p50;
  const saveDrag = 1 - bench.mirror.drag.p50 / bench.main.drag.p50;

  console.log(
    `[ied-mirror] 组件=${bench.main.viewport.components} 场景=${(bench.sceneBytes / 1024).toFixed(0)}KB · ` +
      `viewport 主线程 ${bench.main.viewport.p50.toFixed(2)}ms → 镜像 ${bench.mirror.viewport.p50.toFixed(2)}ms（省 ${(
        saveViewport * 100
      ).toFixed(0)}%）· ` +
      `drag ${bench.main.drag.p50.toFixed(2)}ms → ${bench.mirror.drag.p50.toFixed(2)}ms（省 ${(saveDrag * 100).toFixed(
        0
      )}%）· ` +
      `worker 渲染 ${(bench.worker ? bench.worker.renderMs : 0).toFixed(2)}ms · 端到端 ${bench.latency.p50.toFixed(
        1
      )}ms`
  );
  test.info().annotations.push({
    type: 'ied-mirror',
    description:
      `viewport: ${bench.main.viewport.p50.toFixed(2)}ms → ${bench.mirror.viewport.p50.toFixed(2)}ms; ` +
      `drag: ${bench.main.drag.p50.toFixed(2)}ms → ${bench.mirror.drag.p50.toFixed(2)}ms; ` +
      `e2e ${bench.latency.p50.toFixed(1)}ms`,
  });

  // 缩放/平移这类重型负载上，主线程必须明显更轻（留足余量：只要求省 20% 以上）
  expect(saveViewport, `视口负载下主线程应当明显更轻（省 ${(saveViewport * 100).toFixed(0)}%）`).toBeGreaterThan(0.2);
  // 端到端延迟要在一帧量级（镜像方案的真实代价；超过 2 帧说明链路上有拖延）
  expect(bench.latency.p50, `端到端延迟 ${bench.latency.p50.toFixed(1)}ms 应当 < 33ms`).toBeLessThan(33);
  expect(bench.worker && bench.worker.appliedViewports, '视口变更应当真的推到了 worker').toBeGreaterThan(0);

  // ④ 几何对账（基准**之后**）：允许极少数不一致 —— 这是**镜像保真边界**的体现：
  //    必须**逐项相等**。这条 2026-09-20 收紧过一次：原先允许 <5%（3/399 个节点不一致），
  //    原因是"派生子件（节点标题 / 连线标签）不进文档 → 主线程对它们的更新镜像不过去"。
  //    现在补丁按**应用层入口**重放（`MirrorTarget` → `applyPatch`），派生部件在镜像侧同样会重建，
  //    主线程与镜像的连线走线也走同一条通路 —— 所以这一栏可以要求严格相等，任何不一致都是真回归：
  //    它意味着"镜像的树/派生几何与主线程分叉"（例如位置补丁没派发 AFTER_MOVE、视口没同步）。
  const treesAfter: any = await page.evaluate(() => (window as any).__compareTrees());
  const mismatchRatio = treesAfter.mismatchCount / treesAfter.count;
  console.log(
    `[ied-mirror] 基准后几何对账：${treesAfter.count - treesAfter.mismatchCount}/${treesAfter.count} 一致（不一致 ${
      treesAfter.mismatchCount
    } 个）`
  );
  expect(mismatchRatio, `基准后几何必须逐项一致：${JSON.stringify(treesAfter)}`).toBe(0);

  // ⑤ 像素差异：几何一致 ⇒ 像素也应当一致（含节点标题与连线标签的文字栅格化）
  const pixel: any = await page.evaluate(() => (window as any).__compareWithMainView());
  const diffRatio = pixel.diff / pixel.total;
  console.log(`[ied-mirror] 基准后像素差 ${pixel.diff}/${pixel.total}（${(diffRatio * 100).toFixed(2)}%）`);
  expect(diffRatio, `基准后像素应当逐像素一致：${JSON.stringify(pixel)}`).toBe(0);

  // ⑥ 派生通路（改标题 / 改类型 / 改位置）：镜像必须**重放**应用层补丁，而不是靠全量重同步兜底
  const derived: any = await page.evaluate(() => (window as any).__derivedScenario());
  console.log(
    `[ied-mirror] 派生通路：几何不一致 ${derived.trees.mismatchCount}/${derived.trees.count} · ` +
      `全量重同步 ${derived.scenesBefore}→${derived.scenesAfter} · 未镜像的派生写入 ${derived.skippedDerived}`
  );
  expect(derived.trees.equal, `派生通路后几何必须一致：${JSON.stringify(derived.trees)}`).toBe(true);
  // 改名只写派生部件（标题文本），改类型会重建内部部件（主线程上是一次真实的结构变更）——
  // 两者都不该让 worker 重发整份文档（那是"每改一次属性就传 473KB"的风暴）
  expect(
    derived.scenesAfter,
    `改名/改类型/改位置都不该触发全量重同步（场景数 ${derived.scenesBefore} → ${derived.scenesAfter}）`
  ).toBe(derived.scenesBefore);
  expect(derived.skippedDerived, '派生部件的写入应当被识别出来（计数而不是发给 worker）').toBeGreaterThan(0);

  expect(errors, '不应有页面/console 错误').toEqual([]);
});

/**
 * **兼容保护的集成验收（应用侧）**：worker 上不去时，IED 页面必须自己回退到主线程渲染。
 *
 * 这条与引擎侧 `e2e/visual/worker-fallback.spec.ts` 的分工：引擎那条验"机制会不会回退"，
 * 这条验"**应用有没有接住**" —— 页面得把模式切回主线程、如实显示原因，且画布仍然正常。
 */
test('兼容回退：worker 脚本加载失败 → 页面自动回退主线程，画布仍然可用', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  await page.setViewportSize({ width: 1400, height: 900 });
  // 故意指向不存在的 worker 脚本（脚本没部署 / 被 CSP 挡 / 加载期就抛）
  await page.goto('/examples/worker-mirror.html?nodes=40&worker=no-such-worker.js', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__ready(), undefined, { timeout: 20_000 });

  await page.evaluate(() => (window as any).__setMode('mirror'));
  await page.waitForFunction(() => !!(window as any).__mirrorFallback, undefined, { timeout: 15_000 });

  const state: any = await page.evaluate(() => ({
    fallback: (window as any).__mirrorFallback,
    mode: (window as any).__page.mode,
    stats: (window as any).__stats(),
  }));
  console.log(`[ied-mirror:fallback] ${state.fallback.reason} —— ${state.fallback.message}`);
  expect(['worker-error', 'ready-timeout'], `回退原因应当明确：${JSON.stringify(state.fallback)}`).toContain(
    state.fallback.reason
  );
  // 模式必须切回主线程（否则用户看到一块冻住的画布）
  expect(state.mode, '回退之后模式应当回到 main').toBe('main');
  expect(state.stats.mode).toBe('main');

  // 画布仍然可用：主线程重绘出了内容
  const ink: any = await page.evaluate(() => {
    const p = (window as any).__page;
    const view = document.getElementById('view');
    return p.inkBox(view, view.width, view.height);
  });
  expect(ink.n, `回退后画布必须有内容：${JSON.stringify(ink)}`).toBeGreaterThan(0);
  expect(errors, '回退路径不应产生未捕获异常').toEqual([]);
});

test('兼容回退：?backend=main 强制主线程渲染，页面照常可用', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/examples/worker-mirror.html?nodes=40&backend=main', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__ready(), undefined, { timeout: 20_000 });

  const mode: any = await page.evaluate(async () => {
    const p = (window as any).__page;
    const after = await p.setMode('mirror');
    const view = document.getElementById('view');
    return { after, ink: p.inkBox(view, view.width, view.height), stats: p.stats() };
  });
  expect(mode.after, '强制主线程时 setMode("mirror") 应当原样返回 main').toBe('main');
  expect(mode.ink.n, '主线程渲染必须有内容').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
