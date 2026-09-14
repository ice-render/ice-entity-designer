/**
 * examples 冒烟回归（永久）。
 *
 * 遍历 `examples/` 下**所有**页面，逐页校验：
 *  1) 无 pageerror、无 console error；
 *  2) 引擎 UMD 确实执行了（`window.ICE` 在）—— 用于区分「脚本 404」与「页面渲染出错」；
 *  3) 每张 canvas 的**内容像素占比**达标（与画面主色差异 > 阈值的像素比例），而不只是
 *     「有任意不透明像素」—— 只刷一层背景色的画布同样能让旧判据通过，但用户看到的是一片空白。
 *
 * 为什么补这条：原有的 e2e 只覆盖 8 个编辑器页（bpmn / entity / flowchart / uml / statechart /
 * gantt / power / secondary），`power-symbols.html` 与 `water-symbols.html` 两个示例页**没人跑**。
 * 这次逐页实跑时它们都正常，但「没人跑」本身就是缺口 —— 示例坏了不会有人知道。
 *
 * 前置：`npm run build`（示例页加载 `examples/vendor/*.umd.js`，那是 .gitignore 的构建产物）。
 * 运行：`npm run test:e2e`。
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/** 收集 examples 下的页面（跳过 assets / vendor / node_modules 等非示例目录）。 */
function collectPages(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === 'assets' || name === 'vendor' || name === 'node_modules') continue;
      out.push(...collectPages(full, rel ? `${rel}/${name}` : name));
    } else if (name.endsWith('.html') && name !== 'index.html') {
      out.push(rel ? `${rel}/${name}` : name);
    }
  }
  return out;
}

const pages = collectPages(path.join(ROOT, 'examples'));

test('examples 冒烟：所有页面无错误且画布有实际内容', async ({ page }) => {
  expect(pages.length, '应当收集到示例页').toBeGreaterThan(5);
  // 注：本仓示例页从 `node_modules/ice-render/dist/index.umd.js` 加载引擎（不是 examples/vendor），
  // 缺了整页会像「坏掉」—— 这由下面每页的 `window.ICE` 断言兜住，这里不再单独探路径。

  const failures: string[] = [];
  for (const rel of pages) {
    const errors: string[] = [];
    const onError = (e: any) => errors.push(String(e).slice(0, 140));
    const onConsole = (m: any) => {
      if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140));
    };
    page.on('pageerror', onError);
    page.on('console', onConsole);
    try {
      await page.goto(`/examples/${rel}`, { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const info = await page.evaluate(() => {
        const hasEngine = typeof (window as any).ICE !== 'undefined';
        const canvases = [...document.querySelectorAll('canvas')];
        let best = 0;
        for (const c of canvases) {
          const ctx = (c as HTMLCanvasElement).getContext('2d');
          if (!ctx) continue;
          const w = (c as HTMLCanvasElement).width;
          const h = (c as HTMLCanvasElement).height;
          const d = ctx.getImageData(0, 0, w, h).data;
          // 取左上角像素当「主色」，统计与它差异明显的像素占比
          const bg = [d[0], d[1], d[2]];
          let ink = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (
              d[i + 3] > 40 &&
              Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30
            ) {
              ink++;
            }
          }
          best = Math.max(best, ink / (w * h));
        }
        return { hasEngine, canvases: canvases.length, inkRatio: best };
      });
      const ok = errors.length === 0 && info.hasEngine && info.canvases > 0 && info.inkRatio > 0.02;
      console.log(
        `${ok ? '  ✓' : '  ✗'} ${rel.padEnd(28)} 画布 ${info.canvases} 个 / 内容占比 ${(info.inkRatio * 100).toFixed(
          1
        )}%` + (errors.length ? `  报错: ${errors.slice(0, 2).join(' | ')}` : '')
      );
      if (!ok) failures.push(rel);
    } catch (e) {
      failures.push(rel);
      console.log(`  ✗ ${rel.padEnd(28)} 异常：${String(e).slice(0, 120)}`);
    } finally {
      page.off('pageerror', onError);
      page.off('console', onConsole);
    }
  }
  expect(failures, `以下示例页冒烟失败：${failures.join(', ')}`).toEqual([]);
});
