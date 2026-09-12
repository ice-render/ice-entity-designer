import { expect, test } from '@playwright/test';
import { expectCanvasInteractions } from './canvas-helpers';

/**
 * tests/gantt-editor.html 端到端回归：甘特域包（移动端 2.0 发布排期）。
 *
 * 覆盖域包四件事：时间轴与任务条渲染、**拖拽按天吸附**（排期语义）、依赖跟随、
 * 以及语义校验与矢量导出。与 uml/statechart spec 共用「零控制台报错」约定。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/tests/gantt-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

test('加载：任务条/标尺/依赖齐全，排期校验干净', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      titles: designer.nodes.map((n: any) => n.state.title),
      dates: designer.nodes.map((n: any) => n.state.start),
      deps: designer.edges.length,
      issues: designer.validateGantt(),
      rulerHasHeader: designer.ruler.childNodes.some((c: any) => c.state.text === '任务'),
      rulerHasTask: designer.ruler.childNodes.some((c: any) => c.state.text === '前端开发'),
      dayCount: designer.dayCount(),
    };
  });
  expect(info.titles).toEqual(['需求评审', '交互设计', '前端开发', '后端接口', '联调测试', '灰度发布']);
  expect(info.dates[0]).toBe('2026-03-02');
  expect(info.deps).toBe(6);
  expect(info.issues).toEqual([]);
  expect(info.rulerHasHeader).toBe(true);
  expect(info.rulerHasTask).toBe(true);
  expect(info.dayCount).toBeGreaterThanOrEqual(33);
  expect((page as any).__errors).toEqual([]);
});

test('拖拽按天吸附：日期落到整天，依赖线跟着重路由', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const task = designer.nodes.find((n: any) => n.state.title === '前端开发');
    const link = designer.edges.find((e: any) => {
      const links = e.state.links || {};
      return links.start && links.start.id === task.state.id;
    });
    const beforeStart = task.state.start;
    const beforePoints = link ? link.state.points.map((p: number[]) => p.slice()) : null;
    const dayWidth = designer.dayWidth;

    // 往右拖 2.6 天 → 应吸附到 3 天
    task.setPosition(task.state.left + dayWidth * 2.6, task.state.top);
    const afterPoints = link ? link.state.points.map((p: number[]) => p.slice()) : null;
    return { beforeStart, afterStart: task.state.start, beforePoints, afterPoints };
  });
  expect(result.afterStart).toBe('2026-03-13'); // 03-10 + 3 天
  expect(result.afterPoints).not.toEqual(result.beforePoints);
  expect((page as any).__errors).toEqual([]);
});

test('改每日像素与导出 SVG：时间轴缩放后重排，矢量产物含任务名与百分比', async ({ page }) => {
  await page.fill('#in-daywidth', '40');
  await page.dispatchEvent('#in-daywidth', 'change');
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const task = designer.nodes.find((n: any) => n.state.title === '前端开发');
    return { dayWidth: designer.dayWidth, width: task.state.width };
  });
  expect(info.dayWidth).toBe(40);
  expect(info.width).toBe(12 * 40); // 12 天 × 40

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('release-gantt.svg');
  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('前端开发（12 天）');
  expect(svg).toContain('35%');
  expect(svg).toContain('任务');
  expect(svg).toContain('<path');
  expect((page as any).__errors).toEqual([]);
});

test('画布：滚轮缩放、中键/空白拖拽平移、复位回到单位视口', async ({ page }) => {
  await expectCanvasInteractions(page);
  expect((page as any).__errors).toEqual([]);
});
