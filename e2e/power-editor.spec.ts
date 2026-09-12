import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * examples/power-editor.html 端到端回归：电力一次系统图（110kV 变电站案例）。
 *
 * 覆盖：记法渲染、开关分合（运行态）、拓扑带电分析（色标随之变化）、
 * 语义校验（含五防相关的两条规则）、矢量导出、快照往返、画布交互、零控制台报错。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/power-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('加载：110kV 变电站案例渲染、编号与文字符号齐全、校验干净', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      nodes: designer.nodes.length,
      edges: designer.edges.length,
      names: designer.nodes.map((node: any) => node.state.name),
      tags: designer.nodes.map((node: any) => node.state.tag),
      kinds: designer.nodes.map((node: any) => node.state.kind),
      issues: designer.validatePower(),
      energized: designer.topology().energized.length,
      islands: designer.topology().islands.length,
      attachedToBus: designer.nodes.filter((node: any) => !!node.state.attachedBusId).length,
    };
  });

  expect(info.nodes).toBe(23);
  // 母线接间隔不再画导体（方案 A：容器 + 几何贴合 = 隐式等电位），所以导体是 14 段
  expect(info.edges).toBe(14);
  // 设备编号（调度命名）与文字符号都在
  expect(info.names).toEqual(
    expect.arrayContaining(['线路1', '线路2', '#1M', '#2M', '11026', '1102', '10116', '1011', '1012', 'T1', 'T2'])
  );
  expect(info.tags).toEqual(expect.arrayContaining(['QF', 'QS', 'QE', 'W', 'TM', 'G']));
  expect(info.kinds).toEqual(
    expect.arrayContaining(['busbar', 'breaker', 'disconnector', 'earthingSwitch', 'transformer'])
  );
  expect(info.issues).toEqual([]);
  // 案例本身是「全合闸」的正常运行方式：所有设备带电、一个连通域
  expect(info.energized).toBe(23);
  expect(info.islands).toBe(1);
  // 8 个「母线侧」设备是挂上去的：4 条间隔首端 + 母联两端 + 2 把接地开关
  expect(info.attachedToBus).toBe(8);
  expect((page as any).__errors).toEqual([]);
});

test('运行态：分 / 合切换会改拓扑与色标（不带电变灰）', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const breaker = designer.nodes.find((node: any) => node.state.name === '1011');
    const transformer = designer.nodes.find((node: any) => node.state.name === 'T1');
    const before = {
      state: breaker.state.switchState,
      energized: transformer.state.energized,
      badge: breaker.part('stateBadge').state.text,
    };
    // 拉掉 1011（主变 T1 的断路器）→ T1 不再带电
    designer.setSwitchState(breaker.state.id, 'open');
    const after = {
      state: breaker.state.switchState,
      energized: transformer.state.energized,
      badge: breaker.part('stateBadge').state.text,
      color: transformer.part('windingPrimary').state.style.strokeStyle,
    };
    // 再合上 → 恢复
    designer.setSwitchState(breaker.state.id, 'closed');
    return { before, after, restored: transformer.state.energized };
  });

  expect(result.before.state).toBe('closed');
  expect(result.before.badge).toBe('合');
  expect(result.before.energized).toBe(true);
  expect(result.after.state).toBe('open');
  expect(result.after.badge).toBe('分');
  expect(result.after.energized).toBe(false);
  expect(result.after.color).toBe('#94a3b8'); // 明确不带电 → 灰
  expect(result.restored).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('五防校验：带电合接地刀闸会被拦下', async ({ page }) => {
  await page.click('#btn-validate');
  await expect(page.locator('#validate-output')).toContainText('未发现问题');

  const issues = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const earthing = designer.nodes.find((node: any) => node.state.name === '11019');
    designer.setSwitchState(earthing.state.id, 'closed'); // #1M 带电，仍合接地刀闸
    return designer.validatePower().map((issue: any) => `${issue.level}: ${issue.message}`);
  });
  expect(issues.some((text) => text.startsWith('error: 带电合接地刀闸'))).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('矢量导出与快照往返：导出的 SVG 含设备编号，JSON 能原样载入', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('substation-110kv.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('<svg');
  expect(svg).toContain('1101');
  expect(svg).toContain('#1M');

  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-json')]);
  expect(jsonDownload.suggestedFilename()).toBe('substation-110kv.json');
  await page.click('#btn-import-json');
  await expect(page.locator('#validate-output')).toContainText('已导入 23 个设备');
  const counts = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return { nodes: designer.nodes.length, edges: designer.edges.length, issues: designer.validatePower().length };
  });
  expect(counts).toEqual({ nodes: 23, edges: 14, issues: 0 });
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});

test('母线 T 接（方案 A）：拖动母线，挂在它上面的间隔整体跟随', async ({ page }) => {
  const delta = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const bus = designer.nodes.find((node: any) => node.state.name === '#2M');
    const bay = designer.nodes.find((node: any) => node.state.name === '10116');
    const before = [bay.getMinBoundingBox(true).tl[0], bay.getMinBoundingBox(true).tl[1]];
    bus.setPosition(bus.state.left + 60, bus.state.top + 30);
    const after = [bay.getMinBoundingBox(true).tl[0], bay.getMinBoundingBox(true).tl[1]];
    return {
      delta: [Math.round(after[0] - before[0]), Math.round(after[1] - before[1])],
      stillAttached: designer.isAttachedToBus(bay),
      attachedBusName: designer.attachedBusOf(bay) && designer.attachedBusOf(bay).state.name,
    };
  });
  expect(delta.delta).toEqual([60, 30]);
  expect(delta.stillAttached).toBe(true);
  expect(delta.attachedBusName).toBe('#2M');
  expect((page as any).__errors).toEqual([]);
});
