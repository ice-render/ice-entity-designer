import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * examples/power-symbols.html：电力一次系统图符号表。
 *
 * 断言的是「符号表本身」：15 种符号都在、文字符号与标准口径一致、零控制台报错、
 * 能导出矢量。**记法的正确性由单测（tests/power）逐条锁**，这里只保证示例页不退化。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/power-symbols.html');
  await page.waitForFunction(() => !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('符号表：23 种符号齐备，文字符号对齐 JB/T 5872 与 GB/T 4728', async ({ page }) => {
  const info = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const symbols: Array<{ kind: string; tag: string; parts: number }> = [];
    const walk = (list: any[]) => {
      (list || []).forEach((child: any) => {
        if (child.constructor && child.constructor.typeId === 'PowerSymbol') {
          symbols.push({ kind: child.state.kind, tag: child.state.tag, parts: child.parts.length });
        }
        walk(child.childNodes);
      });
    };
    walk(ice.childNodes);
    return symbols;
  });

  expect(info.map((item) => item.kind)).toEqual([
    'busbar',
    'breaker',
    'disconnector',
    'loadSwitch',
    'earthingSwitch',
    'earth',
    'currentTransformer',
    'voltageTransformer',
    'transformer',
    'fuse',
    'arrester',
    'reactor',
    'generator',
    'motor',
    'load',
    'capacitor',
    'arcSuppressionCoil',
    'threeWindingTransformer',
    'groundingTransformer',
    'groundingResistor',
    'cable',
    'cableTermination',
    'cubicle',
  ]);
  const tags = new Map(info.map((item) => [item.kind, item.tag]));
  expect(tags.get('breaker')).toBe('QF');
  expect(tags.get('disconnector')).toBe('QS');
  expect(tags.get('loadSwitch')).toBe('QL');
  expect(tags.get('earthingSwitch')).toBe('QE');
  expect(tags.get('currentTransformer')).toBe('TA');
  expect(tags.get('voltageTransformer')).toBe('TV');
  expect(tags.get('transformer')).toBe('TM');
  expect(tags.get('fuse')).toBe('FU');
  // 第一批补齐的符号
  expect(tags.get('capacitor')).toBe('C');
  expect(tags.get('threeWindingTransformer')).toBe('TM');
  expect(tags.get('cable')).toBe('W');
  expect(tags.get('cubicle')).toBe('GIS');
  // 每个符号都要有派生部件（不是空壳）
  info.forEach((item) => expect(item.parts).toBeGreaterThan(0));
  expect((page as any).__errors).toEqual([]);
});

test('导出 SVG：矢量产物含符号与文字符号，可下载', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('power-symbols.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('<svg');
  expect(svg).toContain('<path');
  expect(svg).toContain('QF');
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});
