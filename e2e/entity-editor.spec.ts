/**
 * ice-entity-designer 端到端回归（真实页面 + 打好的内核产物）。
 *
 * 把 `tests/entity-editor.html` 这个完整编辑器页面当作「用户路径」跑：工具栏按钮、画布交互
 * （命中 / 拖拽 / 连线 / 滚轮缩放 / 平移）、React+antd 实体面板、保存/加载、schema 与校验，
 * 并统一断言 **整页零 console error / 零 pageerror**。
 *
 * 与单元测试的分工：单测覆盖应用逻辑（EntityDesigner / Entity / Relation）；
 * 这里覆盖「DOM → 应用 → 内核 → 画布像素」整条链路。
 */
import { test, expect, Page } from '@playwright/test';

/** 每个用例收集的页面错误；afterEach 统一断言为空（避免"只断言局部"漏掉运行时异常） */
let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message.split('\n')[0]));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text().slice(0, 240));
  });
  await page.goto('/tests/entity-editor.html');
  await page.waitForFunction(() => Boolean((window as any).__designer && (window as any).__ice), null, {
    timeout: 30_000,
  });
  // 等首批帧上屏 + 示例项目 renderPanel 完成
  await page.waitForTimeout(500);
});

test.afterEach(() => {
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});

async function counts(page: Page) {
  return page.evaluate(() => {
    const designer = (window as any).__designer;
    return { entities: designer.entities.length, relations: designer.relations.length };
  });
}

/** 折线等距采样（用于比较两条路线的几何差异） */
function samplePath(pts: number[][], n: number): number[][] {
  if (!pts || pts.length < 2) return [];
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(d);
    total += d;
  }
  const out: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const target = (total * k) / n;
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= target || i === segs.length - 1) {
        const t = segs[i] === 0 ? 0 : (target - acc) / segs[i];
        out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
        break;
      }
      acc += segs[i];
    }
  }
  return out;
}

/** 两条路线的最大偏差（世界坐标） */
function maxDeviation(a: number[][], b: number[][]): number {
  const sa = samplePath(a, 24);
  const sb = samplePath(b, 24);
  let max = 0;
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    max = Math.max(max, Math.hypot(sa[i][0] - sb[i][0], sa[i][1] - sb[i][1]));
  }
  return max;
}

/**
 * 只统计「这条关系所在的画布区域」的像素指纹。
 *
 * 为什么不用整屏指纹：选中高亮、右侧面板重渲染都会让整屏像素变化，无法区分
 * 「画布上真的画出了曲线」和「只是别处变了」。这里在页面内用 getImageData 采样该关系的
 * world 包围盒（换成画布像素坐标）—— 全部在页面内完成，不依赖截图裁切的坐标系。
 */
async function relationRegionHash(page: Page, id: string, pad = 24) {
  return page.evaluate(
    ({ id, pad }) => {
      const ice = (window as any).__ice;
      const r = (window as any).__designer.relations.find((x: any) => x.state.id === id);
      const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('拿不到 canvas 2d context');
      const vp = ice.getRenderViewport();
      const xs = r.state.points.map((p: number[]) => p[0] * vp.scale + vp.tx);
      const ys = r.state.points.map((p: number[]) => p[1] * vp.scale + vp.ty);
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad);
      const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad);
      const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)) + pad);
      const y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)) + pad);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return { hash: 0, w: 0, h: 0, ink: 0 };
      const d = ctx.getImageData(x0, y0, w, h).data;
      let hash = 0;
      let ink = 0;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p + 3] > 40 && Math.abs(d[p] - 255) + Math.abs(d[p + 1] - 255) + Math.abs(d[p + 2] - 255) > 40) ink++;
        hash = (hash * 31 + d[p + 3]) >>> 0;
      }
      return { hash, w, h, ink };
    },
    { id, pad }
  );
}

/** 画布像素指纹（采样 alpha），用于断言"确实重绘了" */
async function canvasHash(page: Page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('拿不到 canvas 2d context');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 3; i < data.length; i += 40) hash = (hash * 31 + data[i]) >>> 0;
    return hash;
  });
}

async function paintedPixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('拿不到 canvas 2d context');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++;
    return painted;
  });
}

/** 第 index 个实体中心的【屏幕坐标】（含画布偏移），供真实鼠标操作使用 */
/**
 * 实体内部的「画布坐标」（CSS px，原点=画布左上角）。
 *
 * 取盒子内 30% 处的点而不是中心：示例项目用连线**连接各实体中心**，而连线的 zIndex 高于实体，
 * 直接点中心会被 hitTest 判成连线（`findRootEntity` 对连线返回 null → 点击被忽略）。
 * ratio 可调，默认取左上 30% 的空白内部区域。
 */
async function entityCanvasPoint(page: Page, index = 0) {
  const point = await page.evaluate((i) => {
    const ice = (window as any).__ice;
    const entity = (window as any).__designer.entities[i];
    const box = entity.getMinBoundingBox(true);
    const [x1, y1] = ice.worldToScreen(box.tl[0], box.tl[1]);
    const [x2, y2] = ice.worldToScreen(box.br[0], box.br[1]);

    // 在实体内部网格上找一个「hitTest 回环命中该实体自身」的点：
    // 示例项目里连线连的是各实体**中心**且 zIndex 高于实体，随手取中心/比例点常常打在线条上，
    // 于是 findRootEntity 得到 null → 点击被忽略（这正是最初连线建不出来的原因）。
    for (const ry of [0.25, 0.4, 0.6, 0.75]) {
      for (const rx of [0.25, 0.4, 0.6, 0.75]) {
        const x = Math.round(x1 + (x2 - x1) * rx);
        const y = Math.round(y1 + (y2 - y1) * ry);
        let root = ice.hitTest(x, y);
        while (root && root.parentNode) root = root.parentNode;
        if (root === entity) {
          return { x, y };
        }
      }
    }
    return null;
  }, index);

  expect(point, '实体 #' + index + ' 内部找不到未被连线覆盖的可点击点').not.toBeNull();
  return point as { x: number; y: number };
}

/**
 * 把画布内某点滚到可视区，鼠标移到该点，返回页面坐标。
 *
 * 画布是 2200×1700 且外层 `.canvas-wrap` 可滚动 —— 直接用元素坐标算页面坐标会落到视口外，
 * 事件就丢给了别的元素（这正是最初「滚轮不缩放 / 点击建不出连线」的原因）。
 */
async function moveToCanvasPoint(page: Page, point: { x: number; y: number }) {
  const pagePoint = await page.evaluate((p) => {
    const el = document.getElementById('canvas-1') as HTMLElement;
    const wrap = el.parentElement as HTMLElement;
    wrap.scrollLeft = Math.max(0, p.x - wrap.clientWidth / 2);
    wrap.scrollTop = Math.max(0, p.y - wrap.clientHeight / 2);
    // 竖向未必走 wrap 的滚动条（wrap 高度 = 画布高度时它没有纵向溢出，滚的是整个文档）
    // → 再滚文档，把目标点带到视口中央，否则点会落在 900px 视口之外、事件根本到不了画布。
    let rect = el.getBoundingClientRect();
    window.scrollBy(0, rect.top + p.y - window.innerHeight / 2);
    rect = el.getBoundingClientRect();
    return { x: Math.round(rect.left + p.x), y: Math.round(rect.top + p.y) };
  }, point);

  await page.mouse.move(pagePoint.x, pagePoint.y);

  // 自检：鼠标确实停在画布上（坐标算错时要立刻报错，而不是让后面的断言莫名其妙地失败）
  const under = await page.evaluate((pt) => {
    const target = document.elementFromPoint(pt.x, pt.y);
    return target ? target.id || target.tagName : null;
  }, pagePoint);
  expect(under, '坐标 ' + JSON.stringify(pagePoint) + ' 上的元素应为 canvas-1').toBe('canvas-1');
  return pagePoint;
}

async function clickCanvasAt(page: Page, point: { x: number; y: number }, button: 'left' | 'middle' = 'left') {
  const pagePoint = await moveToCanvasPoint(page, point);
  await page.mouse.down({ button });
  await page.mouse.up({ button });
  return pagePoint;
}

async function viewport(page: Page) {
  return page.evaluate(() => ({ ...(window as any).__ice.viewport }));
}

async function entityPositions(page: Page) {
  return page.evaluate(() =>
    (window as any).__designer.entities.map((e: any) => [e.state.id, Math.round(e.state.left), Math.round(e.state.top)])
  );
}

test('加载：画布有输出、示例项目就绪、React+antd 实体面板渲染', async ({ page }) => {
  expect(await paintedPixels(page)).toBeGreaterThan(0);

  const { entities, relations } = await counts(page);
  expect(entities).toBeGreaterThan(0);
  expect(relations).toBeGreaterThan(0);

  // 实体面板由 React + antd 渲染（不是空壳：应能看到 antd 的类名/表格结构）
  const panelHtml = await page.locator('#entity-panel').innerHTML();
  expect(panelHtml.length).toBeGreaterThan(50);
  expect(panelHtml).toContain('ant-');
});

test('工具栏：新增实体 → 实体数 +1、画布重绘、撤销按钮变为可用', async ({ page }) => {
  const before = await counts(page);
  const beforeHash = await canvasHash(page);

  await page.click('#btn-add-entity');
  await page.waitForTimeout(400);

  const after = await counts(page);
  expect(after.entities).toBe(before.entities + 1);
  expect(after.relations).toBe(before.relations);
  expect(await canvasHash(page)).not.toBe(beforeHash);
  await expect(page.locator('#btn-undo')).toBeEnabled();
});

test('撤销 / 重做：按钮与键盘快捷键（Cmd+Z / Cmd+Shift+Z）', async ({ page }) => {
  const start = await counts(page);

  await page.click('#btn-add-entity');
  await page.waitForTimeout(300);
  expect((await counts(page)).entities).toBe(start.entities + 1);

  await page.click('#btn-undo');
  await page.waitForTimeout(400);
  expect((await counts(page)).entities).toBe(start.entities);
  await expect(page.locator('#btn-redo')).toBeEnabled();

  await page.click('#btn-redo');
  await page.waitForTimeout(400);
  expect((await counts(page)).entities).toBe(start.entities + 1);

  // 键盘：Cmd+Z 撤销、Cmd+Shift+Z 重做
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(400);
  expect((await counts(page)).entities).toBe(start.entities);

  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(400);
  expect((await counts(page)).entities).toBe(start.entities + 1);
});

test('删除选中实体：级联删除其连线（不留悬空关系）', async ({ page }) => {
  // 选一个有连线的实体（链接端点取自 relations 的 links）
  const targetId = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const relation = designer.relations[0];
    return relation.state.links.start.id;
  });
  const before = await counts(page);
  const linkedCount = await page.evaluate(
    (id) =>
      (window as any).__designer.relations.filter((r: any) => {
        const links = r.state.links || {};
        return (links.start && links.start.id === id) || (links.end && links.end.id === id);
      }).length,
    targetId
  );
  expect(linkedCount).toBeGreaterThan(0);

  await page.evaluate((id) => (window as any).__designer.select(id), targetId);
  await page.click('#btn-delete-selected');
  await page.waitForTimeout(400);

  const after = await counts(page);
  expect(after.entities).toBe(before.entities - 1);
  expect(after.relations).toBe(before.relations - linkedCount);
  // 该实体确实不在画布上了
  expect(await page.evaluate((id) => Boolean((window as any).__ice.findComponent(id)), targetId)).toBe(false);
});

test('连线模式：依次点击两个实体建立关系（标签为基数）', async ({ page }) => {
  const before = await counts(page);

  await page.click('#btn-toggle-link');
  await expect(page.locator('#relation-hint')).toContainText('连接模式');

  const a = await entityCanvasPoint(page, 0);
  await clickCanvasAt(page, a);
  await page.waitForTimeout(250);
  // 中间态：第一次点击必须被识别为「源 Entity」，否则后面根本不会建连线
  await expect(page.locator('#relation-hint')).toContainText('已选择源 Entity');

  const b = await entityCanvasPoint(page, 1);
  await clickCanvasAt(page, b);
  await page.waitForTimeout(400);

  const after = await counts(page);
  expect(after.relations).toBe(before.relations + 1);

  const label = await page.evaluate(() => {
    const relations = (window as any).__designer.relations;
    return relations[relations.length - 1].state.label;
  });
  expect(label).toMatch(/^[0-9N.]+ : [0-9N.]+$/);
});

test('四种布局按钮：实体位置发生改变', async ({ page }) => {
  for (const id of ['#btn-layout-force', '#btn-layout-horizontal', '#btn-layout-vertical', '#btn-layout-radial']) {
    const before = await entityPositions(page);
    await page.click(id);
    await page.waitForTimeout(500);
    const after = await entityPositions(page);
    expect(JSON.stringify(after), id + ' 应改变至少一个实体的位置').not.toBe(JSON.stringify(before));
  }
});

test('Schema 与校验按钮：输出可解析 JSON / 校验文案', async ({ page }) => {
  await page.click('#btn-schema');
  await page.waitForTimeout(300);
  const schemaText = (await page.locator('#schema-output').textContent()) || '';
  const schema = JSON.parse(schemaText);
  expect(Array.isArray(schema)).toBe(true);
  expect(schema.length).toBe((await counts(page)).entities);
  expect(schema[0]).toHaveProperty('name');
  expect(schema[0]).toHaveProperty('columns');

  await page.click('#btn-validate');
  await page.waitForTimeout(300);
  const validation = (await page.locator('#validation-output').textContent()) || '';
  expect(validation.length).toBeGreaterThan(0);
});

test('保存 / 加载：localStorage round-trip 能恢复项目', async ({ page }) => {
  await page.click('#btn-save-project');
  await page.waitForTimeout(300);
  await expect(page.locator('#validation-output')).toContainText('项目已保存');
  expect(await page.evaluate(() => window.localStorage.getItem('ice-entity-designer-project'))).toBeTruthy();

  const saved = await counts(page);
  // 改动项目：新增一个实体
  await page.click('#btn-add-entity');
  await page.waitForTimeout(300);
  expect((await counts(page)).entities).toBe(saved.entities + 1);

  await page.click('#btn-load-project');
  await page.waitForTimeout(600);
  expect((await counts(page)).entities).toBe(saved.entities);
});

test('画布：滚轮缩放、空白处拖拽平移、复位按钮回到单位视口', async ({ page }) => {
  const before = await viewport(page);

  // 滚轮缩放：先把鼠标移到画布内（并滚动到可视区），滚轮事件才会落在 canvas 上
  await moveToCanvasPoint(page, { x: 600, y: 500 });
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
  const zoomed = await viewport(page);
  expect(zoomed.scale).not.toBe(before.scale);
  expect(zoomed.scale).toBeGreaterThan(before.scale);

  // 中键拖拽平移（示例页对 evt.button === 1 直接平移，不依赖命中空白）
  const from = await moveToCanvasPoint(page, { x: 600, y: 500 });
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(from.x + 90, from.y + 60, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(400);
  const panned = await viewport(page);
  expect(panned.tx !== zoomed.tx || panned.ty !== zoomed.ty).toBe(true);

  await page.click('#btn-reset');
  await page.waitForTimeout(400);
  expect(await viewport(page)).toMatchObject({ scale: 1, tx: 0, ty: 0 });
});

test('拖拽实体：位置随真实鼠标位移改变', async ({ page }) => {
  await page.click('#btn-reset');
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const e = (window as any).__designer.entities[0];
    return [e.state.left, e.state.top];
  });

  const point = await moveToCanvasPoint(page, await entityCanvasPoint(page, 0));
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y + 50, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const e = (window as any).__designer.entities[0];
    return [e.state.left, e.state.top];
  });

  expect(after[0]).toBeGreaterThan(before[0]);
  expect(after[1]).toBeGreaterThan(before[1]);
});

test('选中实体后实体面板更新为选中项', async ({ page }) => {
  const name = await page.evaluate(() => (window as any).__designer.entities[2].state.entityName);
  const id = await page.evaluate(() => (window as any).__designer.entities[2].state.id);

  await clickCanvasAt(page, await entityCanvasPoint(page, 2));
  await page.waitForTimeout(400);

  // 点击确实选中了实体（而不是它身上穿过的连线 / 空白）
  const selected = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return { id: designer.selectedId, name: designer.selected && designer.selected.state.entityName };
  });
  expect(selected.id).toBe(id);
  expect(selected.name).toBe(name);

  // 面板是 React+antd 受控表单：实体名出现在 input 的 value 里
  const values = await page
    .locator('#entity-panel input')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(values).toContain(name);
});

test('连线形态：属性面板可切 Visio/贝塞尔，工具栏决定新建连线的形态', async ({ page }) => {
  // 1) 默认全部是 visio（既有项目外观不变）
  const initial = await page.evaluate(() => (window as any).__designer.relations.map((r: any) => r.state.linkShape));
  expect(initial.length).toBeGreaterThan(0);
  expect(initial.every((shape: string) => shape === 'visio')).toBe(true);

  // 2) 选中第一条关系 → 属性面板出现「连线形态」下拉
  await page.evaluate(() => {
    const designer = (window as any).__designer;
    designer.select(designer.relations[0].state.id);
    (window as any).__renderPanel();
  });
  await page.waitForTimeout(300);
  const shapeField = page.locator('.ant-form-item').filter({ hasText: '连线形态' });
  await expect(shapeField).toHaveCount(1);

  const beforeHash = await canvasHash(page);
  const beforeRoute = await page.evaluate(() => {
    const r = (window as any).__designer.relations[0];
    return { points: r.state.points.map((p: number[]) => [...p]), count: r.state.points.length };
  });
  const relationId = await page.evaluate(() => (window as any).__designer.relations[0].state.id);
  const regionBefore = await relationRegionHash(page, relationId);

  // 3) 切到贝塞尔：状态变化 + 采样成密集折线 + **该关系所在区域**确实重绘
  await shapeField.locator('.ant-select').click();
  await page.locator('.ant-select-item-option').filter({ hasText: '贝塞尔曲线' }).click();
  await page.waitForTimeout(400);

  const afterSwitch = await page.evaluate(() => {
    const relation = (window as any).__designer.relations[0];
    return {
      linkShape: relation.state.linkShape,
      points: relation.state.points.map((p: number[]) => [...p]),
      count: relation.state.points.length,
    };
  });
  expect(afterSwitch.linkShape).toBe('bezier');

  // ① 点集必须是「采样后的密集折线」：Visio 正交路线只有几个点，贝塞尔是 8~25 个采样点
  expect(afterSwitch.count).toBeGreaterThanOrEqual(8);
  expect(afterSwitch.count).toBeGreaterThan(beforeRoute.count * 2);

  // ② 路线几何必须真的变了 —— 这一条专门用来挡住「页面更新了、内核产物没更新」的半更新状态：
  //    那种情况下 linkShape 只是被写进 state，引擎仍按 Visio 布线，路线一模一样。
  expect(maxDeviation(beforeRoute.points, afterSwitch.points)).toBeGreaterThan(5);

  // ③ 该关系所在的画布区域像素必须变化（证明画布重绘了这条线，而不是只有面板在变）
  const regionAfter = await relationRegionHash(page, relationId);
  expect(regionAfter.ink).toBeGreaterThan(0);
  expect(regionAfter.hash).not.toBe(regionBefore.hash);
  expect(await canvasHash(page)).not.toBe(beforeHash);

  // 4) 工具栏选 bezier → 新建的连线即贝塞尔
  await page.selectOption('#rel-shape', 'bezier');
  await page.click('#btn-toggle-link');
  const a = await entityCanvasPoint(page, 0);
  await clickCanvasAt(page, a);
  await page.waitForTimeout(250);
  const b = await entityCanvasPoint(page, 1);
  await clickCanvasAt(page, b);
  await page.waitForTimeout(400);

  const newest = await page.evaluate(() => {
    const relations = (window as any).__designer.relations;
    return relations[relations.length - 1].state.linkShape;
  });
  expect(newest).toBe('bezier');

  // 5) 保存 / 加载后形态仍在（持久化白名单里有 linkShape）
  await page.click('#btn-save-project');
  await page.waitForTimeout(300);
  await page.click('#btn-load-project');
  await page.waitForTimeout(600);

  const restored = await page.evaluate(() => (window as any).__designer.relations.map((r: any) => r.state.linkShape));
  expect(restored).toContain('bezier');
  // 切过形态的那条仍为 bezier（没有被打回 visio）
  expect(restored[0]).toBe('bezier');
});

test('连线形态：工具栏下拉可直接改当前选中的连线（不必绕属性面板）', async ({ page }) => {
  // 1) 先确保没有选中项：这时工具栏下拉只改「新建默认值」，已有连线一条都不该动
  await page.evaluate(() => {
    const designer = (window as any).__designer;
    if (designer.selectedId) {
      designer.select(null);
      (window as any).__renderPanel();
    }
  });
  await page.waitForTimeout(200);

  const initial = await page.evaluate(() => (window as any).__designer.relations.map((r: any) => r.state.linkShape));
  expect(initial.length).toBeGreaterThan(0);
  expect(initial.every((s: string) => s === 'visio')).toBe(true);

  await page.selectOption('#rel-shape', 'bezier');
  await page.waitForTimeout(300);
  const untouched = await page.evaluate(() => (window as any).__designer.relations.map((r: any) => r.state.linkShape));
  expect(untouched).toEqual(initial);

  // 2) 选中一条连线 → 工具栏下拉应跟随这条线的形态（与属性面板显示一致）
  const relationId = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const id = designer.relations[0].state.id;
    designer.select(id);
    (window as any).__renderPanel();
    return id;
  });
  await page.waitForTimeout(300);
  expect(await page.inputValue('#rel-shape')).toBe('visio');

  const routeBefore = await page.evaluate(() =>
    (window as any).__designer.relations[0].state.points.map((p: number[]) => [...p])
  );
  const regionBefore = await relationRegionHash(page, relationId);

  // 3) 只动工具栏下拉（完全不碰属性面板）→ 这条连线立即变贝塞尔，且画布真的重绘
  await page.selectOption('#rel-shape', 'bezier');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const r = (window as any).__designer.relations[0];
    return {
      linkShape: r.state.linkShape,
      count: r.state.points.length,
      points: r.state.points.map((p: number[]) => [...p]),
    };
  });
  expect(after.linkShape).toBe('bezier');
  // 采样成密集折线（Visio 正交路线只有几个点）
  expect(after.count).toBeGreaterThanOrEqual(8);
  // 路线几何真的变了 —— 用来挡住「state 改了、内核仍按 Visio 布线」的半更新状态
  expect(maxDeviation(routeBefore, after.points)).toBeGreaterThan(5);
  // 该关系所在的画布区域像素必须变化
  const regionAfter = await relationRegionHash(page, relationId);
  expect(regionAfter.ink).toBeGreaterThan(0);
  expect(regionAfter.hash).not.toBe(regionBefore.hash);

  // 4) 属性面板同步显示「贝塞尔曲线」，工具栏下拉也能反向切回 visio
  await expect(
    page.locator('.ant-form-item').filter({ hasText: '连线形态' }).locator('.ant-select-selection-item')
  ).toHaveText('贝塞尔曲线');

  await page.selectOption('#rel-shape', 'visio');
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => {
    const r = (window as any).__designer.relations[0];
    return { linkShape: r.state.linkShape, count: r.state.points.length };
  });
  expect(back.linkShape).toBe('visio');
  expect(back.count).toBeLessThan(8);
  expect(await page.inputValue('#rel-shape')).toBe('visio');
});
