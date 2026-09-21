/**
 * **虚拟文档接入的端到端验收**（引擎虚拟子源 P0/P1/P3 在 IED 侧的真实业务验证）。
 *
 * 页面：`examples/water-large.html`（几万个工艺符号 + 标注 + 管线的厂站图，虚拟文档驱动）。
 * 这里只验收"应用侧看得见的行为"：画出来了、点得中、选得上、拖得动、属性面板对；
 * 另外把**当前的能力边界**（校验/导出/序列化只看见物化出来的那一小部分）也钉住 ——
 * 那是 P2 要解决的契约，不是这一版的缺陷：见 `docs/virtual-integration-feedback.md`。
 */
import { expect, test } from '@playwright/test';

test('虚拟文档：画得出来、点得中、选得上、拖得动', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/examples/water-large.html?n=2000', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__page && !!(window as any).__ready(), undefined, {
    timeout: 60_000,
  });

  // ① 文档规模与"列存 + 窗口物化"的形状：条目数以万计，但活对象只有窗口里那点
  const shape: any = await page.evaluate(() => {
    const p = (window as any).__page;
    return {
      count: p.doc.count,
      symbols: p.doc.symbolCount,
      docBytes: p.doc.bytes,
      materialized: (window as any).__vt.materializedIndices(p.layer).length,
      iceChildren: p.ice.childNodes.length,
    };
  });
  expect(shape.count, '2,000 符号会展开成 6,000 个条目（符号 + 标注 + 管线）').toBe(6000);
  expect(shape.docBytes, '列存文档必须远小于同规模的组件树（实测 ~0.4MB / 2k 符号）').toBeLessThan(4 * 1024 * 1024);
  expect(shape.materialized, '窗口内应当物化出一批标注').toBeGreaterThan(10);
  expect(shape.materialized, '活对象只该是窗口里那点，不是整份文档').toBeLessThan(shape.count / 4);
  expect(shape.iceChildren).toBe(1); // 树里只有虚拟层

  // ② 真实鼠标：按下就"命中 → 物化 → 选中"，属性面板跟着出来
  const pt: any = await page.evaluate(() => {
    const p = (window as any).__page;
    for (let sy = 60; sy < p.ice.canvasHeight - 60; sy += 5) {
      for (let sx = 60; sx < p.ice.canvasWidth - 60; sx += 5) {
        const [wx, wy] = p.ice.screenToWorld(sx, sy);
        const i = p.doc.hitTest(wx, wy);
        if (i >= 0 && p.doc.type[i] === 0) {
          const [psx, psy] = p.ice.worldToScreen(p.doc.x[i] + p.doc.w[i] / 2, p.doc.y[i] + p.doc.h[i] / 2);
          return { sx: Math.round(psx), sy: Math.round(psy), index: i, tag: p.doc.tagOf(i) };
        }
      }
    }
    return null;
  });
  expect(pt, '视口里应当能找到可命中的符号').toBeTruthy();
  const box = await page.locator('#canvas-1').boundingBox();
  const x = (box?.x || 0) + pt.sx;
  const y = (box?.y || 0) + pt.sy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(150);

  const afterPress: any = await page.evaluate(() => {
    const p = (window as any).__page;
    const sel = p.designer.selectedId;
    const node = p.designer.nodes.find((c: any) => c.state.id === sel);
    return { selectedId: sel, tag: node ? node.state.tag : null, left: node ? node.state.left : null };
  });
  expect(afterPress.selectedId, '按下应当选中"物化出来的那个真组件"').toBeTruthy();
  expect(afterPress.tag, '选中的应当是刚被点到的那一个（位号对得上）').toBe(pt.tag);
  await expect(page.locator('#panel')).toContainText('位号');

  // ③ 拖动：走引擎默认拖动路径，位置真的变
  await page.mouse.move(x + 60, y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const afterDrag: any = await page.evaluate(() => {
    const p = (window as any).__page;
    const node = p.designer.nodes.find((c: any) => c.state.id === p.designer.selectedId);
    return { left: node ? node.state.left : null };
  });
  expect(afterDrag.left, '拖动后位置必须改变').not.toBe(afterDrag.left === null ? null : afterPress.left);
  expect(Math.abs(afterDrag.left - afterPress.left), '位移应当是"看得见"的量级').toBeGreaterThan(20);

  // ④ 当前边界（P2 之前的事实）：校验/导出/序列化只看见物化出来的子集，看不见整份文档
  const boundary: any = await page.evaluate(() => {
    const p = (window as any).__page;
    document.getElementById('btn-validate')?.click();
    document.getElementById('btn-svg')?.click();
    document.getElementById('btn-json')?.click();
    return {
      docCount: p.doc.count,
      designerNodes: p.designer.nodes.length,
      designerEdges: p.designer.edges.length,
      svg: (window as any).__exportedSvg ? (window as any).__exportedSvg.length : 0,
      json: (window as any).__exportedJson ? (window as any).__exportedJson.length : 0,
    };
  });
  expect(boundary.docCount, '文档条目数（万级）').toBeGreaterThan(1000);
  expect(boundary.designerNodes + boundary.designerEdges, '设计器只看得见物化出来的那一小部分').toBeLessThan(
    boundary.docCount / 10
  );
  expect(boundary.svg).toBeGreaterThan(0);
  expect(boundary.json).toBeGreaterThan(0);

  expect(errors, '页面不应有任何未捕获错误').toEqual([]);
});

test('虚拟文档：平移帧率与"窗口内物化"的稳定性', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/examples/water-large.html?n=5000', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__page, undefined, { timeout: 60_000 });
  const fps: any = await page.evaluate(async () => {
    const p = (window as any).__page;
    p.ice.setViewport(0.8, 0, 0);
    p.ice.dirty = true;
    p.ice.renderer.frameEvtHandler();
    return p.__probePan(2000);
  });
  // 无头 Chromium 的 rAF 是软同步，阈值放低；真机实测 120fps / 0 长任务
  expect(fps.fps, `平移帧率应当站得住（实测 ${JSON.stringify(fps)}）`).toBeGreaterThan(30);
  expect(fps.longTasks, `平移期间不该有长任务（实测 ${JSON.stringify(fps)}）`).toBe(0);

  const materialized: any = await page.evaluate(() => {
    const p = (window as any).__page;
    return (window as any).__vt.materializedIndices(p.layer).length;
  });
  expect(materialized, '窗口内物化的标注数量应当稳定在几百量级').toBeLessThan(3000);
});
