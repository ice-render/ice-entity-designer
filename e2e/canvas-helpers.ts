import { expect, type Page } from '@playwright/test';

/**
 * 画布视口交互的公共断言（UML / 状态机 / 甘特 / BPMN 四个示例页共用）。
 *
 * 约定：示例页的 canvas 铺满 `.canvas-wrap`，所以 canvas 相对坐标 = 元素左上角 + 相对偏移，
 * 不需要像老的 2200×1700 大画布那样先滚动外层容器。坐标算错时立刻报错，
 * 而不是让后面的断言莫名其妙地失败。
 */

export async function viewport(page: Page): Promise<{ scale: number; tx: number; ty: number }> {
  return page.evaluate(() => ({ ...(window as any).__ice.viewport }));
}

export async function canvasSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const wrap = (document.getElementById('canvas-1') as HTMLElement).parentElement as HTMLElement;
    return { width: wrap.clientWidth, height: wrap.clientHeight };
  });
}

export async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    (p) => {
      const rect = (document.getElementById('canvas-1') as HTMLElement).getBoundingClientRect();
      return { x: Math.round(rect.left + p.x), y: Math.round(rect.top + p.y) };
    },
    { x, y }
  );
  const under = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    return el ? el.id || el.tagName : null;
  }, point);
  expect(under, `坐标 ${JSON.stringify(point)} 上应为 canvas-1`).toBe('canvas-1');
  await page.mouse.move(point.x, point.y);
  return point;
}

/** 找一个空白点（hitTest 不命中任何图元），用于验证「空白处拖拽平移」 */
export async function findBlankPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const wrap = (document.getElementById('canvas-1') as HTMLElement).parentElement as HTMLElement;
    for (let y = 24; y < wrap.clientHeight - 24; y += 32) {
      for (let x = 24; x < wrap.clientWidth - 24; x += 32) {
        if (!ice.hitTest(x, y)) {
          return { x, y };
        }
      }
    }
    return null;
  });
  expect(point, '画布上应能找到空白点').not.toBeNull();
  return point as { x: number; y: number };
}

/** 三段式回归：滚轮缩放 → 中键/空白拖拽平移 → 复位回单位视口 */
export async function expectCanvasInteractions(page: Page): Promise<void> {
  const size = await canvasSize(page);
  const before = await viewport(page);
  const anchor = { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };

  await canvasPoint(page, anchor.x, anchor.y);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  const zoomed = await viewport(page);
  expect(zoomed.scale).toBeGreaterThan(before.scale);

  const fromMiddle = await canvasPoint(page, anchor.x, anchor.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(fromMiddle.x + 80, fromMiddle.y + 50, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(300);
  const pannedMiddle = await viewport(page);
  expect(pannedMiddle.scale).toBe(zoomed.scale);
  expect([pannedMiddle.tx, pannedMiddle.ty]).not.toEqual([zoomed.tx, zoomed.ty]);

  const blank = await findBlankPoint(page);
  const fromBlank = await canvasPoint(page, blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(fromBlank.x + 70, fromBlank.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const pannedBlank = await viewport(page);
  expect([pannedBlank.tx, pannedBlank.ty]).not.toEqual([pannedMiddle.tx, pannedMiddle.ty]);

  await page.click('#btn-reset');
  await page.waitForTimeout(200);
  expect(await viewport(page)).toMatchObject({ scale: 1, tx: 0, ty: 0 });
}
