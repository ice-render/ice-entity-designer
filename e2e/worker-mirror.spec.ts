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
 * 前置：`node_modules/ice-render` 要**含 `MirrorHost` / `MirrorTarget`** —— 即 **4.0.0 及以上**
 * （本仓 peer 声明 `^4.0.0`；`npm install` 装的就是它）。本地改引擎时可以把工作区引擎链进来再跑
 * （`ln -s <workspace>/ice-render node_modules/ice-render`）—— 见 `docs/worker-mirror-rendering.md` 的"怎么跑"。
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

  // ①b 文本绘制语言：主画布 lang 必须推到 worker（否则简/繁/日汉字字形会与主线程分叉）
  const workerLang: any = await page.evaluate(() => {
    const p = (window as any).__page;
    return p.host && p.host.stats ? p.host.stats.textLang : null;
  });
  expect(workerLang, `worker 侧文本语言应当与主画布一致（拿到 ${workerLang}）`).toBe('zh-CN');
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

  /**
   * ⑤ 像素差异：几何一致 ⇒ 像素也应当一致（含节点标题与连线标签的文字栅格化）。
   *
   * ⚠️ **口径（2026-09-21 收紧过的"严格 0"改为"位图容差"）**：参考侧
   * （`compareWithMainView` 里的主线程那台）是**强制直绘**的真值（关静态层 + 全组件重画），
   * 而镜像侧比的是 **worker 的最后一帧** —— 视口负载跑完之后，那一帧可能来自**静态层位图合成**
   * （位图是 8bit 预乘存储，贴回不透明底多一次量化往返，这是位图路径的**既定容差**，见引擎
   * `docs/architecture/04-rendering-performance.md`：「差异像素 ≤1.4%、alpha 差占比 ≤0.5%、
   * 最大预乘差 ≤2」）。
   *
   * 这条以前是严格 0，靠的是一个**隐式前提**：视口变化会清掉静态层，于是镜像侧最后一帧必然是直绘。
   * 2026-09-21 引擎修正了"视口变化不清队列/快照/静态层"（官方 API 平移 9.9 → 116.6fps），
   * 这个隐式前提不再成立 —— 严格 0 就变成了"要求位图合成与直绘逐位相同"，那是不可能守住的契约。
   * 于是按引擎自己的两档口径验收：**覆盖率（几何）必须严格一致**（几何对账那两条），
   * 像素只允许落在位图路径的既定容差内；初始态（无静态层历史）仍然要求**逐像素 0 差异**（①）。
   */
  const pixel: any = await page.evaluate(() => (window as any).__compareWithMainView());
  const diffRatio = pixel.diff / pixel.total;
  const alphaRatio = pixel.alphaDiff / pixel.total;
  console.log(
    `[ied-mirror] 基准后像素差 ${pixel.diff}/${pixel.total}（${(diffRatio * 100).toFixed(2)}%）· ` +
      `alpha 差 ${pixel.alphaDiff}（${(alphaRatio * 100).toFixed(3)}%）· 最大预乘差 ${pixel.maxPremult}`
  );
  expect(pixel.maxPremult, `最大预乘通道差必须落在位图容差内：${JSON.stringify(pixel)}`).toBeLessThanOrEqual(2);
  expect(alphaRatio, `alpha（覆盖率）差占比必须落在位图容差内：${JSON.stringify(pixel)}`).toBeLessThanOrEqual(0.005);
  expect(diffRatio, `差异像素占比必须落在位图容差内：${JSON.stringify(pixel)}`).toBeLessThanOrEqual(0.014);

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

  // ⑦ 结构通路（新建节点 + 连线 → 删除）：走结构增量 op，不得触发全量重同步
  const structure: any = await page.evaluate(() => (window as any).__structureScenario());
  console.log(
    `[ied-mirror] 结构通路：加 ${structure.adds} 条 / 删 ${structure.removes} 条结构 op · ` +
      `全量重同步 ${structure.scenesBefore}→${structure.scenesAfter} · ` +
      `几何不一致 ${structure.afterCreate.mismatchCount}/${structure.afterCreate.count}、${structure.afterDelete.mismatchCount}/${structure.afterDelete.count}`
  );
  expect(structure.afterCreate.equal, `新增节点/连线后几何必须一致：${JSON.stringify(structure.afterCreate)}`).toBe(
    true
  );
  expect(structure.afterDelete.equal, `删除节点后几何必须一致：${JSON.stringify(structure.afterDelete)}`).toBe(true);
  expect(structure.adds, '新增节点/连线应当走结构增量 op').toBeGreaterThan(0);
  expect(structure.removes, '删除节点应当走结构增量 op').toBeGreaterThan(0);
  expect(
    structure.scenesAfter,
    `加/删图元都不该触发全量重同步（场景数 ${structure.scenesBefore} → ${structure.scenesAfter}）`
  ).toBe(structure.scenesBefore);

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

/**
 * **"落墨占比"基准护栏**：主线程直绘 / 几何通道（删掉落墨、不启 worker）/ worker 镜像。
 *
 * 镜像能省的上界 = "主线程那一帧里有多少是落墨" —— 这条基准把它算出来并钉住：
 * 三档掉出合理区间就说明**测的东西变了**（例如镜像没真的在省、或主线程那侧被别的东西拖慢），
 * 而不是"镜像突然快/慢了几毫秒"这种噪声。
 */
test('落墨占比三档：几何通道是镜像的理论地板，占比落在合理区间', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/examples/worker-mirror.html?nodes=200', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__ready(), undefined, { timeout: 30_000 });

  const h: any = await page.evaluate(() => (window as any).__headroom(60));
  console.log(
    `[ied-headroom] viewport p50：主线程 ${h.main}ms · 几何通道 ${h.geometryOnly}ms · 镜像 ${h.mirror}ms · ` +
      `落墨占比 ${(h.inkShare * 100).toFixed(0)}% · 镜像省 ${(h.mirrorSave * 100).toFixed(0)}%`
  );
  test.info().annotations.push({ type: 'ied-headroom', description: JSON.stringify(h) });

  // ① 落墨确实占一部分：几何通道必须比主线程直绘轻
  expect(h.geometryOnly, `几何通道应当比主线程直绘轻：${JSON.stringify(h)}`).toBeLessThan(h.main);
  // ② 占比落在合理区间（本场景实测 ~1/3）：掉到 0 说明镜像没在省，涨到 0.7+ 说明场景/负载变了
  expect(h.inkShare, `落墨占比应当落在合理区间：${JSON.stringify(h)}`).toBeGreaterThan(0.1);
  expect(h.inkShare, `落墨占比应当落在合理区间：${JSON.stringify(h)}`).toBeLessThan(0.75);
  /**
   * ③ 镜像至少要达到"几何通道"那一档（它是镜像的理论地板）。
   *
   * ⚠️ **口径在 2026-09-21 补了一条绝对宽容**：引擎修掉"视口变化当结构变更"之后
   * （官方 API 平移 9.9 → 116.6fps），这个场景的 viewport p50 从 ~1.9ms 降到 **0.2~0.4ms** 量级，
   * 镜像那条固定的每帧开销（一帧 postMessage 往返 + 位图回传，实测约 0.1ms）就**占到了底噪的一半**——
   * 纯比例门（×1.25）会把"底噪抖动"判成回归。所以：比例门照旧，另加 **0.2ms 的绝对宽容**，
   * 它覆盖的是与帧内容无关的固定链路开销，而不是放水（镜像要是真的慢一档，这里仍然会红）。
   */
  expect(h.mirror, `镜像应当与几何通道同档：${JSON.stringify(h)}`).toBeLessThan(h.geometryOnly * 1.25 + 0.2);
  expect(errors, '基准不应产生页面错误').toEqual([]);
});
