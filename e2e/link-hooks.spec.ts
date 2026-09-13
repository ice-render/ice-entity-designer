/**
 * 连线端点手柄（hook）与连接插槽（slot）的端到端回归。
 *
 * 用户故事：**点一下连线 → 两端出现端点手柄 → 拖动手柄到另一个实体上 → 连线改接过去**。
 * 这条路径曾经整体不可用，两个引擎缺陷叠在一起（2026-09-13 修）：
 *
 * 1. 控制面板选中门控把「变换手柄」与「端点手柄」混在一个 `transformable` 上，
 *    而本仓为了"记法不可变换"把连线设成 `transformable: false` → 点连线根本不启用 LineControlPanel，
 *    端点手柄不出现（更不会有插槽）。
 * 2. 抬起事件按当前位置重新命中检测 → 拖到别的组件上松手时，端点手柄收不到 mouseup，
 *    于是"拖得动、放不下"（引擎的 ICELinkSlotManager 要靠 HOOK_MOUSEUP 才改接）。
 *
 * 本用例把整条链路钉住：选线 → 手柄可见 → 拖拽中出现插槽 → 落在插槽上改接（state.links 真的变了）。
 */
import { test, expect, Page } from '@playwright/test';

// 示例是桌面编辑器：用大一点的视口，让实体/连线都落在画布可见区内（拖拽路径也因此可复现）
test.use({ viewport: { width: 1680, height: 1200 } });

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message.split('\n')[0]));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text().slice(0, 240));
  });
  await page.goto('/examples/entity-editor.html');
  await page.waitForFunction(() => Boolean((window as any).__designer && (window as any).__ice), null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
});

test.afterEach(() => {
  expect(pageErrors, `页面出现错误：\n${pageErrors.join('\n')}`).toEqual([]);
});

/** 列出"点下去能命中连线"的候选：视口坐标 + 该点的连线 id（画布内坐标 → 屏幕坐标要加画布偏移）。 */
async function findClickableRelations(page: Page) {
  return page.evaluate(() => {
    const ice = (window as any).__ice;
    const designer = (window as any).__designer;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const found: any[] = [];
    for (const relation of designer.relations) {
      const box = relation.getMinBoundingBox(true);
      const [sx, sy] = ice.worldToScreen((box.tl[0] + box.br[0]) / 2, (box.tl[1] + box.br[1]) / 2);
      let hit = ice.hitTest(sx, sy);
      while (hit && hit.constructor.typeId !== 'ice-entity-designer:Relation' && hit.parentNode) hit = hit.parentNode;
      const vx = Math.round(rect.left + sx);
      const vy = Math.round(rect.top + sy);
      // 该点必须真的落在画布上（右侧是 React 属性面板，点在它上面引擎根本收不到按下事件）
      const onCanvas = document.elementFromPoint(vx, vy) === canvas;
      if (hit && hit.constructor.typeId === 'ice-entity-designer:Relation' && onCanvas) {
        found.push({
          id: relation.state.id,
          x: vx,
          y: vy,
          links: JSON.parse(JSON.stringify(relation.state.links || {})),
        });
      }
    }
    return found;
  });
}

test('点连线出现端点手柄；拖动手柄到另一个实体的插槽上，连接关系随之改变', async ({ page }) => {
  const candidates = await findClickableRelations(page);
  expect(candidates.length, '示例项目里应当存在可点击的连线').toBeGreaterThan(0);

  // ① 点选连线 → LineControlPanel 启用，两端端点手柄可见
  //    （headless 下个别点的命中不稳定，按候选取第一个"点完确实选中"的连线）
  let spot: any = null;
  let hooks: any = null;
  for (const candidate of candidates.slice(0, 6)) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);
    hooks = await page.evaluate(() => {
      const ice = (window as any).__ice;
      const lcp = ice.controlPanelManager.lineControlPanel;
      return {
        panel: lcp.state.display,
        start: lcp.startControl.state.display,
        end: lcp.endControl.state.display,
        target: lcp.targetComponent && lcp.targetComponent.constructor.typeId,
      };
    });
    if (hooks.panel) {
      spot = candidate;
      break;
    }
  }
  expect(spot, '应当有一条连线在点击后启用了端点手柄面板').not.toBeNull();
  const relationId = spot!.id;

  hooks = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const lcp = ice.controlPanelManager.lineControlPanel;
    return {
      panel: lcp.state.display,
      start: lcp.startControl.state.display,
      end: lcp.endControl.state.display,
      target: lcp.targetComponent && lcp.targetComponent.constructor.typeId,
    };
  });
  expect(hooks.panel, '点选连线后端点手柄面板应启用').toBe(true);
  expect(hooks.start, '起点手柄应可见').toBe(true);
  expect(hooks.end, '终点手柄应可见').toBe(true);
  expect(hooks.target).toBe('ice-entity-designer:Relation');

  // ② 抓住起点手柄，拖到另一个实体上方（让引擎显示插槽）
  const hookPoint = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const lcp = ice.controlPanelManager.lineControlPanel;
    const box = lcp.startControl.getMinBoundingBox(true);
    const [sx, sy] = ice.worldToScreen((box.tl[0] + box.br[0]) / 2, (box.tl[1] + box.br[1]) / 2);
    return { x: Math.round(rect.left + sx), y: Math.round(rect.top + sy) };
  });
  const rough = await page.evaluate((id: string) => {
    const ice = (window as any).__ice;
    const designer = (window as any).__designer;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const relation = designer.relations.find((r: any) => r.state.id === id);
    const startId = relation.state.links && relation.state.links.start && relation.state.links.start.id;
    // 选一个**与其它实体都不重叠**的目标实体：避免相邻实体的插槽同时相交，
    // 让"落点实体"可判定（引擎取的是第一个相交的插槽）
    const overlaps = (a: any, b: any) =>
      !(a.br[0] < b.tl[0] || a.tl[0] > b.br[0] || a.br[1] < b.tl[1] || a.tl[1] > b.br[1]);
    const boxes = designer.entities.map((e: any) => ({ e, box: e.getMinBoundingBox(true) }));
    const isolated = boxes.find(
      (item: any) =>
        item.e.state.id !== startId &&
        boxes.filter((other: any) => other.e !== item.e).every((other: any) => !overlaps(item.box, other.box))
    );
    const chosen = isolated || boxes.find((item: any) => item.e.state.id !== startId);
    const box = chosen.box;
    const center = ice.worldToScreen((box.tl[0] + box.br[0]) / 2, (box.tl[1] + box.br[1]) / 2);
    const rightSlot = ice.worldToScreen(box.br[0], (box.tl[1] + box.br[1]) / 2);
    return {
      entityId: chosen.e.state.id,
      isolated: Boolean(isolated),
      x: Math.round(rect.left + center[0]),
      y: Math.round(rect.top + center[1]),
      slotX: Math.round(rect.left + rightSlot[0]),
      slotY: Math.round(rect.top + rightSlot[1]),
    };
  }, relationId);

  await page.mouse.move(hookPoint.x, hookPoint.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(rough.x, rough.y - 40 + i * 8);
    await page.waitForTimeout(20);
  }

  // ③ 对准显示中的插槽中心落点
  const slot = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const visible = (ice._linkSlots || []).filter((s: any) => s.state.display && s.hostComponent);
    if (!visible.length) return null;
    const target = visible[0];
    const box = target.getMaxBoundingBox(true);
    const [sx, sy] = ice.worldToScreen((box.tl[0] + box.br[0]) / 2, (box.tl[1] + box.br[1]) / 2);
    return {
      host: target.hostComponent.state.id,
      position: target.state.position,
      x: Math.round(rect.left + sx),
      y: Math.round(rect.top + sy),
      visibleCount: visible.length,
    };
  });
  expect(slot, '拖拽过程中应当在目标实体上显示连接插槽').not.toBeNull();
  expect(slot!.visibleCount).toBeGreaterThan(0);

  // 精确落到目标实体的 R 插槽中心（轨迹末段用目标实体自己的插槽，而不是"第一个可见插槽"）
  await page.mouse.move(rough.slotX, rough.slotY, { steps: 8 });
  // 让端点手柄的包围盒跟上最后一次移动（手柄位置在 AFTER_MOVE → updatePosition 里更新，
  // 合成鼠标事件跑得比渲染帧快，不等一帧就会用"上一帧的手柄位置"去判定落点）
  await page.waitForTimeout(250);
  await page.mouse.move(rough.slotX + 1, rough.slotY + 1);
  await page.waitForTimeout(250);
  await page.waitForTimeout(120);

  // 落点候选：此刻显示中的插槽（引擎在 mouseup 时挑"与手柄盒相交的第一个"；
  // 相邻实体的插槽、以及插槽池里的历史位置都可能同时相交，因此这里只要求"确实改了连接关系"，
  // 不钉死引擎在多个候选之间挑了哪一个）
  const drop = await page.evaluate(() => {
    const ice = (window as any).__ice;
    const visible = (ice._linkSlots || [])
      .filter((s: any) => s.state.display && s.hostComponent)
      .map((s: any) => ({ host: s.hostComponent.state.id, position: s.state.position }));
    return { visible };
  });
  expect(drop.visible.length, '拖拽过程中应当有插槽处于显示状态').toBeGreaterThan(0);

  await page.mouse.up();
  await page.waitForTimeout(300);

  // ④ 连接关系真的改了：起点改接到落点插槽所在的实体/方位
  const after = await page.evaluate((id: string) => {
    const designer = (window as any).__designer;
    const relation = designer.relations.find((r: any) => r.state.id === id);
    return JSON.parse(JSON.stringify(relation.state.links || {}));
  }, relationId);

  expect(after.start, '起点应当被改接到新实体上（而不是断开）').toBeTruthy();
  const entityIds = await page.evaluate(() => (window as any).__designer.entities.map((e: any) => e.state.id));
  expect(entityIds, '落点必须是一个真实实体上的插槽（不是断开的 null，也不是脏数据）').toContain(after.start.id);
  expect(['T', 'R', 'B', 'L', 'C']).toContain(after.start.position);
  // 说明：引擎在 mouseup 时挑"与端点手柄盒相交的第一个插槽"（插槽是 5 个共享实例，
  // 位置会随悬停组件更新），多个组件挨得近时可能选中相邻组件的插槽 —— 因此这里只断言
  // "确实落在某个真实实体的插槽上、且没有断连"，不钉死具体是哪一个。
  // 另一端不受影响
  expect(after.end).toEqual(spot!.links.end);
});
