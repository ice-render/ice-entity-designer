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

  // 110kV 双母线（4 条完整间隔 + 母联 + 母线 PT）+ 10kV 单母线分段（出线 / 电容器 / 站用变）
  expect(info.nodes).toBe(69);
  // 母线接间隔不画导体（方案 A：几何贴合 = 隐式等电位），所以导体是 54 段
  expect(info.edges).toBe(54);
  // 设备编号（调度命名）与文字符号都在
  expect(info.names).toEqual(
    expect.arrayContaining(['甲线', '乙线', 'T1', 'T2', '#1M', '#2M', '#3M', '#4M', '1101', '1013', '900', '601'])
  );
  expect(info.tags).toEqual(expect.arrayContaining(['QF', 'QS', 'QE', 'W', 'TM', 'G', 'C', 'FU', 'TV', 'TA']));
  expect(info.kinds).toEqual(
    expect.arrayContaining([
      'busbar',
      'breaker',
      'disconnector',
      'earthingSwitch',
      'transformer',
      'currentTransformer',
      'voltageTransformer',
      'capacitor',
      'groundingTransformer',
      'fuse',
      'arrester',
      'generator',
      'load',
    ])
  );
  expect(info.issues).toEqual([]);
  // 案例是正常运行方式（间隔各接一条母线、母联合位把另一条母线带上）：全部带电、一个连通域
  expect(info.energized).toBe(69);
  expect(info.islands).toBe(1);
  // 19 个设备是「挂」在母线上的：110kV 侧 4 条间隔各 2 把母线刀闸 + 母联两端 + 母线 PT，
  // 10kV 侧 2 个主变低压侧 CT + 6 条 10kV 间隔的断路器
  expect(info.attachedToBus).toBe(19);
  expect((page as any).__errors).toEqual([]);
});

test('运行态：分 / 合切换会改拓扑与色标（双母联拉开 → Ⅱ 段母线失电变灰）', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    // 案例是双母线运行方式：各间隔只接 #1M，#2M 靠母联 1013 带电
    const tie = designer.nodes.find((node: any) => node.state.name === '1013');
    const bus2 = designer.nodes.find((node: any) => node.state.name === '#2M');
    const before = {
      state: tie.state.switchState,
      energized: bus2.state.energized,
      badge: tie.part('stateBadge').state.text,
    };
    designer.setSwitchState(tie.state.id, 'open'); // 拉开母联 → Ⅱ 段母线失电
    const after = {
      state: tie.state.switchState,
      energized: bus2.state.energized,
      badge: tie.part('stateBadge').state.text,
      color: bus2.part('busbar').state.style.fillStyle,
    };
    designer.setSwitchState(tie.state.id, 'closed'); // 合上恢复
    return { before, after, restored: bus2.state.energized };
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
  await expect(page.locator('#validate-output')).toContainText('已导入 69 个设备');
  const counts = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return { nodes: designer.nodes.length, edges: designer.edges.length, issues: designer.validatePower().length };
  });
  expect(counts).toEqual({ nodes: 69, edges: 54, issues: 0 });
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
    const bay = designer.nodes.find((node: any) => node.state.name === '10112');
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

test('记法不可变换：符号只允许拖动（transformable=false，且拖完连线跟随）', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const allTransformable = designer.nodes.map((node: any) => node.state.transformable);
    const draggable = designer.nodes.every((node: any) => node.state.draggable === true);
    // 拖动一个断路器：位置变、挂在其上的导体端点跟着重算
    const breaker = designer.nodes.find((node: any) => node.state.name === '1102');
    const edge = designer.edges.find((item: any) => {
      const links = item.state.links || {};
      return links.start && links.start.id === breaker.state.id;
    });
    const before = { left: breaker.state.left, points: edge ? JSON.stringify(edge.state.points) : '' };
    breaker.setPosition(breaker.state.left + 24, breaker.state.top + 12);
    const after = { left: breaker.state.left, points: edge ? JSON.stringify(edge.state.points) : '' };
    return {
      allDisabled: allTransformable.every((value: any) => value === false),
      draggable,
      moved: after.left !== before.left,
      linkRerouted: edge ? after.points !== before.points : false,
    };
  });
  expect(result.allDisabled).toBe(true);
  expect(result.draggable).toBe(true);
  expect(result.moved).toBe(true);
  expect(result.linkRerouted).toBe(true);
  expect((page as any).__errors).toEqual([]);
});
