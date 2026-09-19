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

/**
 * 读画布上**世界坐标**处的像素（`#rrggbb`）。
 *
 * 用途：断言"某个图元**真的画出来了**"——结构性断言（节点数 / 嵌套 / zIndex）看不出
 * "被别的图元盖住"这种绘制事故（例如池的底排在泳道内容之后，把整个池内容盖成一片底色）。
 * 世界坐标 → CSS 像素用引擎视口、CSS 像素 → 设备像素用画布实际尺寸比（dpr 自适应）。
 */
export async function pixelAtWorld(page: Page, wx: number, wy: number): Promise<string> {
  return page.evaluate(
    (point) => {
      const ice = (window as any).__ice;
      const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return 'no-context';
      const vp = ice.viewport;
      const dpr = canvas.width / canvas.getBoundingClientRect().width || 1;
      const sx = Math.round((point.x * vp.scale + vp.tx) * dpr);
      const sy = Math.round((point.y * vp.scale + vp.ty) * dpr);
      const data = context.getImageData(sx, sy, 1, 1).data;
      return `#${[data[0], data[1], data[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    },
    { x: wx, y: wy }
  );
}

/**
 * 统计某个世界坐标矩形里"有墨"的像素数（亮度低于阈值的点）。
 *
 * 用途：断言**图元的内容（轮廓 / 文字）真的落在画布上**。当两个图元的填充色相同时
 * （例如状态机的复合状态与子状态都是白底），比色法失效 —— 但"名字有没有画出来"始终有效：
 * 被容器底色盖住时，框里一个墨点都没有。
 */
export async function darkPixelsInWorldBox(page: Page, box: number[], threshold = 200): Promise<number> {
  return page.evaluate(
    (input) => {
      const ice = (window as any).__ice;
      const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return -1;
      const vp = ice.viewport;
      const dpr = canvas.width / canvas.getBoundingClientRect().width || 1;
      const toDevice = (wx: number, wy: number) => [
        Math.round((wx * vp.scale + vp.tx) * dpr),
        Math.round((wy * vp.scale + vp.ty) * dpr),
      ];
      const [x0, y0] = toDevice(input.box[0], input.box[1]);
      const [x1, y1] = toDevice(input.box[2], input.box[3]);
      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);
      const data = context.getImageData(x0, y0, width, height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luminance < input.threshold) dark++;
      }
      return dark;
    },
    { box, threshold }
  );
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
