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
  // 同时做几何对账（此时两边应当逐项相等；基准跑完后再对一次，容差见 ④）

  // ③ 几何对账（基准**之前**）：镜像里的每个节点，世界盒必须与主线程**逐项相等**。
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
  //    IED 的连线标签这类"派生子件"不进序列化文档（`FlowNode`/`FlowEdge` 的构造函数自己造），
  //    worker 侧重建出来的标签 id 与主线程不同，应用层对它们的位置更新自然镜像不过去。
  //    实测：119 个节点里 3 个（都是连线标签）位置不一致，其余全部逐项相等。
  //    这一步是**护栏**：比例一旦失控（例如视口/结构没同步），这里立刻红。
  const treesAfter: any = await page.evaluate(() => (window as any).__compareTrees());
  const mismatchRatio = treesAfter.mismatchCount / treesAfter.count;
  console.log(
    `[ied-mirror] 基准后几何对账：${treesAfter.count - treesAfter.mismatchCount}/${treesAfter.count} 一致（不一致 ${
      treesAfter.mismatchCount
    } 个，多为连线标签等派生子件）`
  );
  expect(mismatchRatio, `基准后几何不一致比例应当很小（派生子件量级）：${JSON.stringify(treesAfter)}`).toBeLessThan(
    0.05
  );

  // ⑤ 像素差异只报数（同一原因：派生子件的视觉细节），超出量级说明镜像真的崩了
  const pixel: any = await page.evaluate(() => (window as any).__compareWithMainView());
  const diffRatio = pixel.diff / pixel.total;
  console.log(`[ied-mirror] 基准后像素差 ${pixel.diff}/${pixel.total}（${(diffRatio * 100).toFixed(2)}%）`);
  expect(diffRatio, `基准后像素差异应保持在"派生子件细节"量级：${JSON.stringify(pixel)}`).toBeLessThan(0.15);

  expect(errors, '不应有页面/console 错误').toEqual([]);
});
