/**
 * 给水排水工艺流程图示例页（`examples/water-editor.html`）的端到端回归。
 *
 * 覆盖的是这一行的"真价值"：不只是画得出来，而是**画完能说清工艺上对不对** ——
 * 工艺校验、流径分析（关阀断流）、快照往返、矢量导出，以及记法不可变换。
 */
import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  (page as any).__errors = errors;
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto('/examples/water-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer);
  await page.waitForTimeout(250);
});

test('加载：AAO 案例渲染、设备名与位号齐全、工艺校验干净', async ({ page }) => {
  const state = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      nodes: designer.nodes.length,
      edges: designer.edges.length,
      names: designer.nodes.map((node: any) => node.state.name),
      tags: designer.nodes.map((node: any) => node.state.tag),
      issues: designer.validateWater(),
      trace: designer.traceFlow(),
    };
  });

  expect(state.nodes).toBeGreaterThanOrEqual(19);
  expect(state.edges).toBeGreaterThanOrEqual(20);
  ['细格栅', '厌氧池', '缺氧池', '好氧池', '二沉池', '污泥脱水机'].forEach((name) =>
    expect(state.names).toContain(name)
  );
  ['GR-101', 'AT-101', 'AX-101', 'AE-101', 'SC-101', 'AIT-101'].forEach((tag) => expect(state.tags).toContain(tag));
  expect(state.issues).toEqual([]);
  expect(state.trace.connected).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('工艺校验：缺管径、断流、缺在线监测都能被抓出来', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    // 1) 管线缺管径
    const pipe = designer.edges.find((edge: any) => edge.state.medium === 'effluent');
    pipe.setState({ dn: '', label: '' });
    // 2) 拆掉在线监测（让出水路径上没有监测点）
    const analyzer = designer.nodes.find((node: any) => node.state.kind === 'analyzer');
    const inEdge = designer.edges.find(
      (edge: any) => edge.state.links && edge.state.links.end && edge.state.links.end.id === analyzer.state.id
    );
    const outEdge = designer.edges.find(
      (edge: any) => edge.state.links && edge.state.links.start && edge.state.links.start.id === analyzer.state.id
    );
    const nextId = outEdge.state.links.end.id;
    designer.remove(analyzer.state.id);
    designer.createPipe({ sourceId: inEdge.state.links.start.id, targetId: nextId, medium: 'effluent', dn: 'DN500' });
    return designer.validateWater().map((issue: any) => issue.code);
  });

  expect(result).toContain('pipe-missing-dn');
  expect(result).toContain('outlet-without-analyzer');
  expect((page as any).__errors).toEqual([]);
});

test('流径分析：关掉出水阀即断流，并报出卡在哪个阀门', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const before = designer.traceFlow();
    const valve = designer.nodes.find((node: any) => node.state.kind === 'valve');
    designer.setValveState(valve.state.id, 'closed');
    const after = designer.traceFlow();
    const issues = designer.validateWater().map((issue: any) => issue.code);
    return {
      beforeConnected: before.connected,
      afterConnected: after.connected,
      blockedAt: after.blockedAt,
      valveId: valve.state.id,
      issues,
    };
  });

  expect(result.beforeConnected).toBe(true);
  expect(result.afterConnected).toBe(false);
  expect(result.blockedAt).toBe(result.valveId);
  expect(result.issues).toContain('flow-disconnected');
  expect((page as any).__errors).toEqual([]);
});

test('矢量导出与快照往返：SVG 含设备名与管径，JSON 能原样载入', async ({ page }) => {
  await page.click('#btn-export-svg');
  await page.click('#btn-export-json');
  const check = await page.evaluate(() => {
    const svg = (window as any).__exportedSvg || '';
    const json = (window as any).__exportedJson || '';
    const before = (window as any).__designer.nodes.length;
    const report = (window as any).__designer.load(json);
    (window as any).__designer.fitViewport();
    return {
      svgHasName: svg.indexOf('厌氧池') >= 0,
      svgHasDn: svg.indexOf('DN500') >= 0,
      before,
      loaded: report.nodes,
      issues: (window as any).__designer.validateWater(),
    };
  });
  expect(check.svgHasName).toBe(true);
  expect(check.svgHasDn).toBe(true);
  expect(check.loaded).toBe(check.before);
  expect(check.issues).toEqual([]);
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});

test('记法不可变换：符号只允许拖动（transformable=false，拖完管线跟着重算）', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const allDisabled = designer.nodes
      .map((node: any) => node.state.transformable)
      .every((value: any) => value === false);
    const draggable = designer.nodes.every((node: any) => node.state.draggable === true);
    const tank = designer.nodes.find((node: any) => node.state.kind === 'aerobicTank');
    const edge = designer.edges.find(
      (item: any) => item.state.links && item.state.links.start && item.state.links.start.id === tank.state.id
    );
    const before = { left: tank.state.left, points: edge ? JSON.stringify(edge.state.points) : '' };
    tank.setPosition(tank.state.left + 30, tank.state.top + 16);
    const after = { left: tank.state.left, points: edge ? JSON.stringify(edge.state.points) : '' };
    return {
      allDisabled,
      draggable,
      moved: after.left !== before.left,
      rerouted: edge ? after.points !== before.points : false,
    };
  });

  expect(result.allDisabled).toBe(true);
  expect(result.draggable).toBe(true);
  expect(result.moved).toBe(true);
  expect(result.rerouted).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('符号库：31 种符号都能新建、都能渲染（派生形状非空）', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const kinds = Object.keys((window as any).IED.WATER_SYMBOL_PRESETS);
    const created = kinds.map((kind) =>
      designer.createSymbol(kind, { name: 'TEST-' + kind, tag: kind, left: 40 + kinds.indexOf(kind) * 6, top: 900 })
    );
    const empty: string[] = [];
    created.forEach((node: any) => {
      if (!node.parts || node.parts.length < 2) empty.push(node.state.kind);
    });
    created.forEach((node: any) => designer.remove(node.state.id));
    return { tested: kinds.length, empty };
  });

  expect(result.tested).toBe(31);
  expect(result.empty).toEqual([]);
  expect((page as any).__errors).toEqual([]);
});

test('介质：管线介质切换会改线色与线型，标注自动跟着走', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const pipe = designer.edges.find((edge: any) => edge.state.medium === 'sewage');
    const before = pipe.state.style.strokeStyle;
    pipe.setMedium('sludge', 'DN200');
    const after = pipe.state.style.strokeStyle;
    return { before, after, label: pipe.state.label, lineType: pipe.state.lineType };
  });

  expect(result.after).not.toBe(result.before);
  expect(result.label).toContain('DN200');
  expect(result.label).toContain('剩余污泥');
  expect((page as any).__errors).toEqual([]);
});
