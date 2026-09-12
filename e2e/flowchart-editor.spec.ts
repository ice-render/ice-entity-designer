import { expect, test, type Page } from '@playwright/test';

/**
 * tests/flowchart-editor.html 端到端回归。
 *
 * 覆盖流程图示例的「真·用户路径」：加载、四类节点、拖拽、连线、撤销/重做、
 * 属性面板、快照存取、视图操作，以及 console/pageerror 零报错。
 * 与 entity-editor.spec.ts 共用同一套画布取点/滚动约定。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/tests/flowchart-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

type Counts = { nodes: number; edges: number };

async function counts(page: Page): Promise<Counts> {
  return page.evaluate(() => {
    const designer = (window as any).__designer;
    return { nodes: designer.nodes.length, edges: designer.edges.length };
  });
}

/** 在节点内部找一个「hitTest 回环命中该节点自身」的点（连线常压在节点中心上） */
async function nodeCanvasPoint(page: Page, index = 0) {
  const point = await page.evaluate((idx) => {
    const ice = (window as any).__ice;
    const node = (window as any).__designer.nodes[idx];
    const box = node.getMinBoundingBox(true);
    const [x1, y1] = ice.worldToScreen(box.tl[0], box.tl[1]);
    const [x2, y2] = ice.worldToScreen(box.br[0], box.br[1]);
    for (const ry of [0.3, 0.5, 0.7]) {
      for (const rx of [0.3, 0.5, 0.7]) {
        const x = Math.round(x1 + (x2 - x1) * rx);
        const y = Math.round(y1 + (y2 - y1) * ry);
        let root = ice.hitTest(x, y);
        while (root && root.parentNode) root = root.parentNode;
        if (root === node) {
          return { x, y };
        }
      }
    }
    return null;
  }, index);
  expect(point, `节点 #${index} 内部找不到可点击点`).not.toBeNull();
  return point as { x: number; y: number };
}

/** 画布 2200×1700，可视区小于画布：先滚动画布区把目标点带到中间，再换算页面坐标 */
async function moveToCanvasPoint(page: Page, point: { x: number; y: number }) {
  const pagePoint = await page.evaluate((p) => {
    const el = document.getElementById('canvas-1') as HTMLElement;
    const wrap = el.parentElement as HTMLElement;
    wrap.scrollLeft = Math.max(0, p.x - wrap.clientWidth / 2);
    wrap.scrollTop = Math.max(0, p.y - wrap.clientHeight / 2);
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.left + p.x), y: Math.round(rect.top + p.y) };
  }, point);
  const under = await page.evaluate((p) => {
    const target = document.elementFromPoint(p.x, p.y);
    return target ? target.id || target.tagName : null;
  }, pagePoint);
  expect(under, `坐标 ${JSON.stringify(pagePoint)} 上应为 canvas-1`).toBe('canvas-1');
  await page.mouse.move(pagePoint.x, pagePoint.y);
  return pagePoint;
}

async function clickCanvasAt(page: Page, point: { x: number; y: number }) {
  const pagePoint = await moveToCanvasPoint(page, point);
  await page.mouse.down();
  await page.mouse.up();
  return pagePoint;
}

test('加载：示例流程就绪、画布有落墨、零控制台报错', async ({ page }) => {
  expect(await counts(page)).toEqual({ nodes: 13, edges: 12 });
  await expect(page.locator('#flow-stats')).toContainText('13 个节点 / 12 条连线');

  // 四类形状都真的画出来了：菱形/平行四边形是自定义 ICEPath，最容易静默画不出来
  const kinds = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return designer.nodes.map((node: any) => ({
      kind: node.state.kind,
      children: node.childNodes.map((child: any) => child.constructor.typeId || child.constructor.name),
    }));
  });
  expect(kinds.find((item: any) => item.kind === 'decision').children).toEqual(['FlowDiamond', 'ICEText']);
  expect(kinds.find((item: any) => item.kind === 'io').children).toEqual(['FlowParallelogram', 'ICEText']);
  expect(kinds.filter((item: any) => item.kind === 'terminator').length).toBe(4);

  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) {
      return 0;
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) ink++;
    }
    return ink;
  });
  expect(painted).toBeGreaterThan(10000);
  expect((page as any).__errors).toEqual([]);
});

test('新增四类节点 → 节点数 +4，撤销/重做可回退', async ({ page }) => {
  const before = await counts(page);
  for (const id of ['#btn-add-terminator', '#btn-add-process', '#btn-add-decision', '#btn-add-io']) {
    await page.click(id);
    await page.waitForTimeout(150);
  }
  expect((await counts(page)).nodes).toBe(before.nodes + 4);

  for (let i = 0; i < 4; i++) {
    await page.click('#btn-undo');
    await page.waitForTimeout(120);
  }
  expect((await counts(page)).nodes).toBe(before.nodes);

  for (let i = 0; i < 4; i++) {
    await page.click('#btn-redo');
    await page.waitForTimeout(120);
  }
  expect((await counts(page)).nodes).toBe(before.nodes + 4);
});

test('连线模式：依次点击两个节点建立连线，并随撤销/重做往返', async ({ page }) => {
  const before = await counts(page);
  await page.click('#btn-toggle-link');
  await clickCanvasAt(page, await nodeCanvasPoint(page, 9));
  await page.waitForTimeout(250);
  await expect(page.locator('#relation-hint')).toContainText('已选择源节点');

  await clickCanvasAt(page, await nodeCanvasPoint(page, 2));
  await page.waitForTimeout(400);
  expect((await counts(page)).edges).toBe(before.edges + 1);

  await page.click('#btn-undo');
  await page.waitForTimeout(300);
  expect((await counts(page)).edges).toBe(before.edges);
  await page.click('#btn-redo');
  await page.waitForTimeout(300);
  expect((await counts(page)).edges).toBe(before.edges + 1);
});

test('拖拽节点：位置随真实鼠标位移改变，连线跟随', async ({ page }) => {
  const point = await moveToCanvasPoint(page, await nodeCanvasPoint(page, 2));
  const before = await page.evaluate(() => {
    const node = (window as any).__designer.nodes[2];
    return { left: node.state.left, top: node.state.top };
  });

  await page.mouse.down();
  await page.mouse.move(point.x + 80, point.y + 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const node = designer.nodes[2];
    const edge = designer.edges.find((item: any) => item.state.links && item.state.links.start.id === node.state.id);
    return { left: node.state.left, top: node.state.top, edgeStart: edge ? edge.state.startPoint : null };
  });
  expect(after.left).toBeGreaterThan(before.left);
  expect(after.top).toBeGreaterThan(before.top);
  // 连线端点跟着宿主节点走（插槽吸附）
  expect(after.edgeStart[1]).toBeGreaterThan(0);
});

test('属性面板：选中节点可改标题/类型/配色，选中连线可改标签与形态', async ({ page }) => {
  await clickCanvasAt(page, await nodeCanvasPoint(page, 1));
  await page.waitForTimeout(300);

  const titleInput = page.locator('#shape-panel input[type="text"]').first();
  await titleInput.fill('浏览商品（已改名）');
  await titleInput.dispatchEvent('change');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__designer.nodes[1].state.title)).toBe('浏览商品（已改名）');

  await page.locator('#shape-panel select').first().selectOption('decision');
  await page.waitForTimeout(300);
  const switched = await page.evaluate(() => {
    const node = (window as any).__designer.nodes[1];
    // 引擎内置图元（ICEText）没有 static typeId，回退到类名
    return {
      kind: node.state.kind,
      children: node.childNodes.map((child: any) => child.constructor.typeId || child.constructor.name),
    };
  });
  expect(switched.kind).toBe('decision');
  expect(switched.children).toEqual(['FlowDiamond', 'ICEText']);

  const edgeId = await page.evaluate(() => (window as any).__designer.edges[0].state.id);
  await page.evaluate((id) => (window as any).__designer.select(id), edgeId);
  await page.waitForTimeout(300);
  const labelInput = page.locator('#shape-panel input[type="text"]').first();
  await labelInput.fill('已确认');
  await labelInput.dispatchEvent('change');
  const visioDots = await page.evaluate(() => (window as any).__designer.edges[0].state.dots.length);
  await page.locator('#shape-panel select').first().selectOption('bezier');
  await page.waitForTimeout(400);
  const edgeState = await page.evaluate(() => {
    const edge = (window as any).__designer.edges[0];
    return { label: edge.state.label, linkShape: edge.state.linkShape, dots: edge.state.dots.length };
  });
  expect(edgeState.label).toBe('已确认');
  expect(edgeState.linkShape).toBe('bezier');
  // 形态切换必须真的重新布点：贝塞尔采样点数明显多于正交折线
  expect(edgeState.dots).toBeGreaterThan(visioDots);
});

test('保存 / 清空 / 加载：localStorage round-trip 能恢复整个流程', async ({ page }) => {
  const saved = await counts(page);
  await page.click('#btn-save');
  await expect(page.locator('#status-output')).toContainText('已保存');

  await page.click('#btn-clear');
  await page.waitForTimeout(300);
  expect(await counts(page)).toEqual({ nodes: 0, edges: 0 });

  await page.click('#btn-load');
  await page.waitForTimeout(400);
  expect(await counts(page)).toEqual(saved);
  await expect(page.locator('#status-output')).toContainText('已加载');
});

test('清空后可从零建流程：新增节点 + 连线 + 导出 JSON', async ({ page }) => {
  await page.click('#btn-clear');
  await page.waitForTimeout(300);
  await page.click('#btn-add-process');
  await page.click('#btn-add-decision');
  await page.waitForTimeout(400);
  expect((await counts(page)).nodes).toBe(2);

  // 新节点落在视口中心附近，尚未拖动，直接在两节点间连线
  await page.click('#btn-toggle-link');
  await clickCanvasAt(page, await nodeCanvasPoint(page, 0));
  await page.waitForTimeout(250);
  await clickCanvasAt(page, await nodeCanvasPoint(page, 1));
  await page.waitForTimeout(400);
  expect((await counts(page)).edges).toBe(1);

  await page.click('#btn-export');
  const json = await page.textContent('#json-output');
  expect(json).toContain('"nodes"');
  expect(json).toContain('"edges"');
  expect((page as any).__errors).toEqual([]);
});
