import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * examples/uml-editor.html 端到端回归：UML 类图域包（电商支付类模型）。
 *
 * 覆盖域包的四件事：记法渲染（三段式类框 + 六种关系）、语义校验、属性面板改模型、
 * 以及矢量导出。与 bpmn-editor.spec.ts 共用一套「零控制台报错」约定。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/uml-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('加载：类模型渲染、六种关系齐全、零控制台报错', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      classes: designer.nodes.map((n: any) => n.state.className),
      kinds: designer.edges.map((e: any) => e.state.relationKind),
      markers: designer.edges.map((e: any) => e.state.umlMarker),
      issues: designer.validateUml().length,
    };
  });

  expect(info.classes).toEqual(
    expect.arrayContaining(['Entity', 'User', 'Order', 'Payable', 'OrderItem', 'OrderStatus'])
  );
  expect(info.kinds).toEqual(
    expect.arrayContaining(['inheritance', 'realization', 'association', 'composition', 'dependency'])
  );
  expect(info.markers).toEqual(expect.arrayContaining(['triangle', 'diamond', 'open', 'none']));
  expect(info.issues).toBe(0);
  expect((page as any).__errors).toEqual([]);
});

test('语义校验：把两个类改成同名后报「类名重复」', async ({ page }) => {
  await page.evaluate(() => {
    const designer = (window as any).__designer;
    const user = designer.nodes.find((n: any) => n.state.className === 'User');
    user.applyPatch({ className: 'Order' });
  });
  await page.click('#btn-validate');
  await expect(page.locator('#validate-output')).toContainText('类名重复：Order');
  expect((page as any).__errors).toEqual([]);
});

test('属性面板：改类成员后类框重排，导出 SVG 含三段文字与关系', async ({ page }) => {
  await page.evaluate(() => {
    const designer = (window as any).__designer;
    const order = designer.nodes.find((n: any) => n.state.className === 'Order');
    order.applyPatch({ methods: ['+ pay(amount: number): void', '+ refund(): void'] });
    designer.select(order.state.id);
  });
  await page.waitForTimeout(300);
  const texts = await page.evaluate(() => {
    const order = (window as any).__designer.nodes.find((n: any) => n.state.className === 'Order');
    return order.childNodes.filter((c: any) => typeof c.state.text === 'string').map((c: any) => c.state.text);
  });
  expect(texts).toContain('+ refund(): void');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('uml-class-diagram.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('<svg');
  expect(svg).toContain('«interface»'); // 构造型是文本，必须进导出
  expect(svg).toContain('+ refund(): void');
  expect(svg).toContain('<path'); // 关系线/类框都是矢量
  await expect(page.locator('#validate-output')).toContainText('已导出 SVG');
  expect((page as any).__errors).toEqual([]);
});

test('文本互操作：导出 PlantUML → 改文本 → 导入，模型随之更新', async ({ page }) => {
  await page.click('#btn-export-text');
  const text = await page.evaluate(() => (window as any).__exportedText as string);
  expect(text.startsWith('@startuml')).toBe(true);
  expect(text).toContain('abstract class Entity');
  expect(text).toContain('interface Payable');
  expect(text).toContain('Entity <|-- User'); // 方向约定：箭头指向父类
  expect(text).toContain('Order *-- OrderItem'); // 组合：实心菱形在整体一侧

  // 改名 + 新增一个类，再导回模型
  const edited = text
    .replace(/User/g, 'Customer')
    .replace('@enduml', 'class Coupon {\n  - code: string\n}\nCustomer --> Coupon : 使用\n@enduml');
  await page.fill('#text-output', edited);
  await page.click('#btn-import-text');
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => ({
    classes: (window as any).__designer.nodes.map((n: any) => n.state.className),
    status: document.getElementById('validate-output')!.textContent,
  }));
  expect(info.classes).toContain('Customer');
  expect(info.classes).toContain('Coupon');
  expect(info.classes).not.toContain('User');
  expect(info.status).toContain('已导入');
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});
