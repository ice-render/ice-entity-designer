import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * examples/statechart-editor.html 端到端回归：状态机域包（订单状态机，含复合状态）。
 *
 * 覆盖域包四件事：记法渲染（伪状态/状态/复合状态/转移标签）、复合状态的容器行为、
 * 语义校验、以及矢量导出。与 uml/bpmn 两个 spec 共用「零控制台报错」约定。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/statechart-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('加载：伪状态/状态/复合状态与转移标签齐全，语义校验干净', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const composite = designer.nodes.find((n: any) => n.state.kind === 'composite');
    return {
      kinds: designer.nodes.map((n: any) => n.state.kind).sort(),
      labels: designer.edges.map((e: any) => e.state.label),
      issues: designer.validateStatechart(),
      nested: composite.childNodes.filter((c: any) => c.state && c.state.kind).map((c: any) => c.state.title),
    };
  });
  const counts = info.kinds.reduce((acc: any, kind: string) => {
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  // 1 个初始 + 1 个终止 + 1 个复合状态 + 5 个普通状态（待支付/已支付/已取消/库存校验/安排发货）
  expect(counts).toEqual({ initial: 1, final: 1, composite: 1, state: 5 });
  expect(info.labels).toEqual(expect.arrayContaining(['支付成功 [金额 > 0] / 生成订单', '超时未支付', '缺货']));
  expect(info.nested.sort()).toEqual(['安排发货', '库存校验']);
  expect(info.issues).toEqual([]);
  expect((page as any).__errors).toEqual([]);
});

test('复合状态的容器行为：拖动复合状态，子状态跟着走', async ({ page }) => {
  const delta = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const composite = designer.nodes.find((n: any) => n.state.kind === 'composite');
    const child = designer.nodes.find((n: any) => n.state.title === '库存校验');
    const before = child.getMinBoundingBox(true).tl.slice();
    composite.setPosition(composite.state.left + 60, composite.state.top + 40);
    const after = child.getMinBoundingBox(true).tl.slice();
    return [after[0] - before[0], after[1] - before[1]];
  });
  expect(delta[0]).toBeCloseTo(60, 1);
  expect(delta[1]).toBeCloseTo(40, 1);
});

test('语义校验与矢量导出：注入违规后能报出，导出的 SVG 含状态名与转移标签', async ({ page }) => {
  await page.evaluate(() => {
    const designer = (window as any).__designer;
    // 造一个孤立的普通状态
    designer.createState({ title: '孤儿状态', left: 1200, top: 700 });
  });
  await page.click('#btn-validate');
  await expect(page.locator('#validate-output')).toContainText('孤儿状态');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('order-statechart.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('待支付');
  // `>` 在 SVG 文本里是转义的（&gt;），断言导出后的真实形态
  expect(svg).toContain('支付成功 [金额 &gt; 0] / 生成订单');
  expect(svg).toContain('订单处理');
  expect(svg).toContain('<path');
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});

test('文本互操作：导出 PlantUML → 改文本 → 导入，模型随之更新', async ({ page }) => {
  await page.click('#btn-export-text');
  const text = await page.evaluate(() => (window as any).__exportedText as string);
  expect(text.startsWith('@startuml')).toBe(true);
  expect(text).toContain('[*] --> 待支付'); // 初始伪状态映射成 [*]
  expect(text).toContain('待支付 --> 已支付 : 支付成功 [金额 > 0] / 生成订单');
  expect(text).toContain('state 订单处理 {'); // 复合状态成块，子状态声明在块里
  expect(text).toContain('安排发货 --> [*] : 已发货');

  // 改名 + 给复合状态补一个子状态，再导回模型
  const edited = text.replace(/已取消/g, '已作废').replace('state 安排发货', 'state 安排发货\n  state 打印面单');
  await page.fill('#text-output', edited);
  await page.click('#btn-import-text');
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const composite = designer.nodes.find((n: any) => n.state.title === '订单处理');
    return {
      titles: designer.nodes.map((n: any) => n.state.title).filter((title: string) => !!title),
      nested: composite.childNodes
        .filter((child: any) => child.state && child.state.title)
        .map((child: any) => child.state.title)
        .sort(),
      status: document.getElementById('validate-output')!.textContent,
    };
  });
  expect(info.titles).toContain('已作废');
  expect(info.titles).not.toContain('已取消');
  expect(info.nested).toContain('打印面单');
  expect(info.status).toContain('已导入');
  expect((page as any).__errors).toEqual([]);
});
