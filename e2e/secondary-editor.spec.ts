import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * examples/secondary-editor.html：电力**二次回路**（保护电流回路 + 端子排）简化版。
 *
 * 与一次侧的区别是「图种」：二次图是回路图，一条线 = 一个回路（带回路编号 A411/B411/C411/N411）。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/secondary-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('加载：三相电流回路 + 端子排 + 保护装置齐全，二次校验干净', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      symbols: designer.symbols.length,
      terminals: designer.terminals.map((item: any) => item.state.name),
      wires: designer.edges.length,
      circuitNos: designer.edges.map((edge: any) => edge.state.circuitNo),
      cableNos: designer.edges.map((edge: any) => edge.state.cableNo).filter((value: string) => !!value),
      device: designer.symbols.find((item: any) => item.state.kind === 'relayDevice').state,
      issues: designer.validateSecondary(),
    };
  });

  expect(info.terminals.sort()).toEqual(['201', '202', '203', '204']);
  expect(info.circuitNos).toEqual(expect.arrayContaining(['A411', 'B411', 'C411', 'N411']));
  expect(info.cableNos).toEqual(expect.arrayContaining(['1D1', '1D8']));
  expect(info.device.name).toBe('线路保护');
  expect(info.device.tag).toBe('RCS-941A');
  expect(info.wires).toBe(8);
  expect(info.issues).toEqual([]);
  expect((page as any).__errors).toEqual([]);
});

test('端子排是容器：拖动端子排，端子跟着走；端子各自可接线', async ({ page }) => {
  const delta = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const strip = designer.nodes.find(
      (item: any) => item.constructor.typeId === 'ice-entity-designer:TerminalStrip',
    );
    const terminal = designer.terminals[0];
    const before = terminal.getMinBoundingBox(true).tl.slice();
    strip.setPosition(strip.state.left + 50, strip.state.top + 20);
    const after = terminal.getMinBoundingBox(true).tl.slice();
    return {
      delta: [Math.round(after[0] - before[0]), Math.round(after[1] - before[1])],
      parentIsStrip: terminal.parentNode === strip,
    };
  });
  expect(delta.delta).toEqual([50, 20]);
  expect(delta.parentIsStrip).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('二次校验：删掉一条三相回路 → 缺相报错；导线缺编号 → 报错', async ({ page }) => {
  const issues = await page.evaluate(() => {
    const designer = (window as any).__designer;
    // C 相有两条导线（绕组→端子、端子→装置），要两条都删掉才算这一相缺失
    designer.edges
      .filter((edge: any) => edge.state.circuitNo === 'C411')
      .map((edge: any) => edge.state.id)
      .forEach((id: string) => designer.remove(id));
    const afterRemove = designer.validateSecondary().map((issue: any) => issue.message);
    // 再把一条导线的编号清掉
    const aWire = designer.edges.find((edge: any) => edge.state.circuitNo === 'A411');
    aWire.setState({ circuitNo: '', label: '' });
    const afterClear = designer.validateSecondary().map((issue: any) => issue.message);
    return { afterRemove, afterClear };
  });
  expect(issues.afterRemove.some((text: string) => text.includes('缺相') && text.includes('C411'))).toBe(true);
  expect(issues.afterClear.some((text: string) => text.includes('缺少回路编号'))).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('矢量导出与快照往返：SVG 含回路编号，JSON 能原样载入', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('line-protection-current-circuit.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('<svg');
  expect(svg).toContain('A411');
  expect(svg).toContain('201');

  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-json')]);
  expect(jsonDownload.suggestedFilename()).toBe('line-protection-current-circuit.json');
  await page.click('#btn-import-json');
  await expect(page.locator('#validate-output')).toContainText('已导入');
  const counts = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      terminals: designer.terminals.length,
      wires: designer.edges.length,
      issues: designer.validateSecondary().length,
    };
  });
  // 端子排的端子是真实子节点，快照往返后必须还在
  expect(counts).toEqual({ terminals: 4, wires: 8, issues: 0 });
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});
