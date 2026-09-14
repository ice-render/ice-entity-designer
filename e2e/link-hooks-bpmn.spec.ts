/**
 * BPMN 编辑器里的端点手柄 / 插槽定位回归（2026-09-13）。
 *
 * 实测出来的两个真实缺陷（都表现为"钩子和插槽的位置错乱"）：
 * 1. `LineControlPanel` 给面板自身设了 `top: -5`，两个端点手柄是它的子组件 → 手柄整体偏离连线端点 5px；
 * 2. `ICELinkSlot` 换宿主时只订阅新宿主的 AFTER_RENDER、**不立刻重算位置** →
 *    钩子先掠过大泳道、再落到泳道里的任务上时，插槽仍留在泳道边上（视觉上完全对不上）。
 *
 * 本用例把两条都钉住：手柄中心 == 连线端点；插槽中心 == 悬停任务的 T/R/B/L/C。
 */
import { test, expect, Page } from '@playwright/test';

test.use({ viewport: { width: 1680, height: 1100 } });
test.describe.configure({ retries: 1 });

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message.split('\n')[0]));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text().slice(0, 240));
  });
  await page.goto('/examples/bpmn-editor.html');
  await page.waitForFunction(() => Boolean((window as any).__designer && (window as any).__ice), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
});

test.afterEach(() => {
  expect(pageErrors, `页面出现错误：\n${pageErrors.join('\n')}`).toEqual([]);
});

/** 找一条"点下去能命中连线"的连线（返回视口坐标 + 该连线）。 */
async function clickableLink(page: Page) {
  return page.evaluate(() => {
    const ice = (window as any).__ice;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    for (const link of (ice.childNodes || []).filter((c: any) => c.isLine)) {
      const box = link.getMinBoundingBox(true);
      const [sx, sy] = ice.worldToScreen((box.tl[0] + box.br[0]) / 2, (box.tl[1] + box.br[1]) / 2);
      const vx = Math.round(rect.left + sx);
      const vy = Math.round(rect.top + sy);
      if (vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) continue;
      let hit = ice.hitTest(sx, sy);
      while (hit && !hit.isLine && hit.parentNode) hit = hit.parentNode;
      if (hit && hit.isLine && document.elementFromPoint(vx, vy) === canvas) return { id: link.state.id, x: vx, y: vy };
    }
    return null;
  });
}

test('端点手柄居中在连线端点上，且拖动后插槽贴着悬停的任务', async ({ page }) => {
  const link = await clickableLink(page);
  expect(link, '示例里应当存在可点击的连线').not.toBeNull();

  // 点选连线
  await page.mouse.move(link!.x, link!.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(200);

  // ① 手柄中心必须与连线端点的世界坐标重合
  const hooks = await page.evaluate((id: string) => {
    const ice = (window as any).__ice;
    const lcp = ice.controlPanelManager.lineControlPanel;
    const clicked = (ice.childNodes || []).find((c: any) => c.isLine && c.state.id === lcp.targetComponent?.state.id);
    const pts = (lcp.targetComponent || clicked).state.points;
    const m = lcp.targetComponent.calcAbsoluteLinearMatrix();
    const world = (p: number[]) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    const start = lcp.startControl.getMaxBoundingBox(true).center;
    const end = lcp.endControl.getMaxBoundingBox(true).center;
    return {
      panel: lcp.state.display,
      startDelta: [Math.round(start[0] - world(pts[0])[0]), Math.round(start[1] - world(pts[0])[1])],
      endDelta: [
        Math.round(end[0] - world(pts[pts.length - 1])[0]),
        Math.round(end[1] - world(pts[pts.length - 1])[1]),
      ],
      linkId: id,
    };
  }, link!.id);
  expect(hooks.panel, '点连线后应出现端点手柄面板').toBe(true);
  expect(hooks.startDelta, '起点手柄应当居中在连线起点').toEqual([0, 0]);
  expect(hooks.endDelta, '终点手柄应当居中在连线终点').toEqual([0, 0]);

  // ② 拖到某个任务（linkable 的 FlowNode）上 → 插槽中心必须等于该任务的 T/R/B/L/C
  const target = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const found: any[] = [];
    const walk = (nodes: any[]) => {
      for (const c of nodes || []) {
        if (c.state && c.state.linkable && !c.isLine && typeof c.state.title === 'string') found.push(c);
        walk(c.childNodes);
      }
    };
    walk(ice.childNodes || []);
    const task = found.find((c) => c.state.title === '身份核验') || found[0];
    const b = task.getMinBoundingBox(true);
    const [sx, sy] = ice.worldToScreen(b.center[0], b.center[1]);
    return {
      id: task.state.id,
      bbox: [...b.tl.map(Math.round), ...b.br.map(Math.round)],
      x: Math.round(rect.left + sx),
      y: Math.round(rect.top + sy),
    };
  });

  const hook = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const b = ice.controlPanelManager.lineControlPanel.startControl.getMaxBoundingBox(true);
    const [sx, sy] = ice.worldToScreen(b.center[0], b.center[1]);
    return { x: Math.round(rect.left + sx), y: Math.round(rect.top + sy) };
  });
  await page.evaluate((bbox: number[]) => {
    (window as any).__targetBBox = bbox;
  }, target.bbox);

  await page.mouse.move(hook.x, hook.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(hook.x + ((target.x - hook.x) * i) / 15, hook.y + ((target.y - hook.y) * i) / 15);
    await page.waitForTimeout(20);
  }
  // 等引擎把碰撞定到任务上（渲染帧落后于合成鼠标事件）
  await page
    .waitForFunction((id) => (window as any).__ice?.linkSlotManager?.collision?.state?.id === id, target.id, {
      timeout: 5_000,
    })
    .catch(() => {
      /* 超时不致命：下面的断言会报出真正的问题 */
    });
  await page.waitForTimeout(200);

  const slots = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const mgr = ice.linkSlotManager;
    const host = mgr.collision;
    if (!host) return null;
    const b = host.getMinBoundingBox(true);
    const expectByPosition: any = {
      T: [b.tc[0], b.tc[1]],
      R: [b.rc[0], b.rc[1]],
      B: [b.bc[0], b.bc[1]],
      L: [b.lc[0], b.lc[1]],
      C: [b.center[0], b.center[1]],
    };
    const targetBox = (window as any).__targetBBox as number[];
    const out: any[] = [];
    for (const s of ice._linkSlots || []) {
      if (!s.state.display) continue;
      const c = s.getMaxBoundingBox(true).center;
      const e = expectByPosition[s.state.position];
      out.push({
        position: s.state.position,
        host: s.hostComponent && s.hostComponent.state.id,
        delta: [Math.round(c[0] - e[0]), Math.round(c[1] - e[1])],
        // 插槽是否落在"目标任务"的范围内（±20px 容差）：用来抓"贴到大泳道上"的错乱
        nearTarget:
          c[0] >= targetBox[0] - 20 &&
          c[0] <= targetBox[2] + 20 &&
          c[1] >= targetBox[1] - 20 &&
          c[1] <= targetBox[3] + 20,
      });
    }
    return {
      hostId: host.state.id,
      hostType: host.constructor.typeId,
      hostBBox: [...b.tl.map(Math.round), ...b.br.map(Math.round)],
      slots: out,
    };
  });

  expect(slots, '拖动时应当命中某个宿主并显示插槽').not.toBeNull();
  // 命中可能是任务本身、也可能是它内部同尺寸的形状（z 序更高）——对用户来说"插槽贴在这个任务上"就是对的，
  // 因此这里不看组件 id，只看"插槽位置是否都落在目标任务的范围内"。
  expect(slots!.slots.length).toBeGreaterThan(0);
  for (const s of slots!.slots) {
    expect(s.delta, `${s.position} 插槽应当贴在该宿主的对应位置上`).toEqual([0, 0]);
    expect(s.nearTarget, `${s.position} 插槽应当落在目标任务范围内（不是大泳道边上）`).toBe(true);
  }
});
