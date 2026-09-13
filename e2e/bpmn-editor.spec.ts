import { expect, test, type Page } from '@playwright/test';

/**
 * examples/bpmn-editor.html 端到端回归：BPMN 案例（信用卡申请审批）。
 *
 * 覆盖：加载与渲染、BPMN 语义校验、XML 导出→导入 round-trip、连线类型切换、
 * 以及 canvas 上的真实交互（连线模式、滚轮缩放）。
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto('/examples/bpmn-editor.html');
  await page.waitForFunction(() => !!(window as any).__designer && !!(window as any).__ice);
  await page.waitForTimeout(400);
  (page as any).__errors = errors;
});

async function counts(page: Page) {
  return page.evaluate(() => {
    const designer = (window as any).__designer;
    return { nodes: designer.nodes.length, edges: designer.edges.length };
  });
}

test('加载：BPMN 案例渲染、元素类型齐全、零控制台报错', async ({ page }) => {
  const { nodes, edges } = await counts(page);
  expect(nodes).toBeGreaterThan(10);
  expect(edges).toBeGreaterThan(8);

  const kinds = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return designer.nodes.map((node: any) => node.state.kind);
  });
  ['bpmnPool', 'bpmnLane', 'bpmnEvent', 'bpmnTask', 'bpmnGateway', 'bpmnDataObject', 'bpmnAnnotation'].forEach(
    (kind) => {
      expect(kinds).toContain(kind);
    }
  );

  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('canvas-1') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) ink++;
    }
    return ink;
  });
  expect(painted).toBeGreaterThan(10000);

  // 引擎自带的对齐标尺没有被禁用（拖拽时会显示对齐提示线）
  expect(await page.evaluate(() => (window as any).__ice.alignmentGuide.isEnabled())).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

test('容器：拖动池会带着泳道与里面的节点一起走（引擎容器能力）', async ({ page }) => {
  const before = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const pool = designer.nodes.find((node: any) => node.state.kind === 'bpmnPool');
    const lane = designer.nodes.find((node: any) => node.state.kind === 'bpmnLane');
    const task = designer.nodes.find((node: any) => node.state.kind === 'bpmnTask');
    return {
      poolId: pool.state.id,
      laneBox: lane.getMinBoundingBox(true).tl.slice(),
      taskBox: task.getMinBoundingBox(true).tl.slice(),
      nested: !!task.parentNode && task.parentNode.state.kind === 'bpmnLane',
    };
  });
  expect(before.nested).toBe(true);

  const after = await page.evaluate((poolId) => {
    const designer = (window as any).__designer;
    const pool = designer.ice.findComponent(poolId);
    // 只挑「两端都落在被拖动池内」的连线（跨池的消息流端点不在这个池里）
    const insidePool = (component: any) => {
      let current = component;
      while (current) {
        if (current.state && current.state.id === poolId) return true;
        current = current.parentNode;
      }
      return false;
    };
    const edge = designer.edges.find((item: any) => {
      const links = item.state.links || {};
      const source = links.start && links.start.id && designer.ice.findComponent(links.start.id);
      const target = links.end && links.end.id && designer.ice.findComponent(links.end.id);
      return source && target && insidePool(source) && insidePool(target);
    });
    const edgeBefore = edge && edge.state.points ? edge.state.points.map((p: any) => p.slice()) : null;
    pool.setPosition(pool.state.left + 50, pool.state.top + 30);
    const lane = designer.nodes.find((node: any) => node.state.kind === 'bpmnLane');
    const task = designer.nodes.find((node: any) => node.state.kind === 'bpmnTask');
    return {
      laneBox: lane.getMinBoundingBox(true).tl.slice(),
      taskBox: task.getMinBoundingBox(true).tl.slice(),
      edgePointsChanged: edge
        ? JSON.stringify(edge.state.points.map((p: any) => p.slice())) !== JSON.stringify(edgeBefore)
        : false,
      edgeDelta:
        edge && edgeBefore && edge.state.points[0]
          ? [edge.state.points[0][0] - edgeBefore[0][0], edge.state.points[0][1] - edgeBefore[0][1]]
          : null,
    };
  }, before.poolId);

  expect(after.laneBox[0] - before.laneBox[0]).toBeCloseTo(50, 1);
  expect(after.taskBox[1] - before.taskBox[1]).toBeCloseTo(30, 1);
  // 挂在容器内部图元上的连线必须同步重路由（用户报告的「线不跟随」回归）
  expect(after.edgePointsChanged).toBe(true);
  expect(after.edgeDelta[0]).toBeCloseTo(50, 0);
  expect(after.edgeDelta[1]).toBeCloseTo(30, 0);
});

test('BPMN 校验：案例本身合法，注入违规后能报出具体问题', async ({ page }) => {
  await page.click('#btn-validate');
  await page.waitForTimeout(300);
  await expect(page.locator('#validate-output')).toContainText('通过');

  // 注入违规：给开始事件接一条流入
  const injected = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const start = designer.nodes.find(
      (node: any) => node.state.kind === 'bpmnEvent' && node.state.eventKind === 'start'
    );
    const extra = designer.createNode('bpmnTask', { title: '外部系统', left: 120, top: 700 });
    designer.createEdge({ sourceId: extra.state.id, targetId: start.state.id });
    return designer.validateBpmn().map((issue: any) => issue.code);
  });
  expect(injected).toContain('start-incoming');
  expect(injected).toContain('unreachable-node');
});

test('SVG 导出：矢量产物含池/泳道/节点/连线，可下载且与画布口径一致', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-svg')]);
  expect(download.suggestedFilename()).toBe('bpmn-process.svg');
  await page.waitForTimeout(300);

  const svg = await page.evaluate(() => (window as any).__exportedSvg as string);
  expect(svg).toContain('<svg');
  expect(svg).toContain('viewBox=');
  // 节点文字进的是 <text><tspan>，标题与任务名应当都在
  expect(svg).toContain('银行');
  expect(svg).toContain('身份核验');
  // 图形确实是路径（不是把画布贴成一张位图）
  expect(svg).toContain('<path');
  expect(svg).not.toContain('<image');
  // 顺序流/消息流都在（示例里消息流是虚线）
  expect(svg).toContain('stroke-dasharray');
  await expect(page.locator('#validate-output')).toContainText('已导出 SVG');
  expect((page as any).__errors).toEqual([]);
});

test('BPMN XML：导出含 2.0 命名空间与 DI 布局，导入后元素数量与语义保持', async ({ page }) => {
  await page.click('#btn-export');
  await page.waitForTimeout(300);
  const xml = await page.inputValue('#xml-output');
  expect(xml).toContain('http://www.omg.org/spec/BPMN/20100524/MODEL');
  expect(xml).toContain('<bpmn:participant');
  expect(xml).toContain('<bpmn:messageFlow');
  expect(xml).toContain('<bpmn:conditionExpression');
  expect(xml).toContain('<bpmndi:BPMNShape');

  const before = await counts(page);
  await page.click('#btn-import');
  await page.waitForTimeout(500);
  const after = await counts(page);
  // 导入的是「元素 + 池」，数量应与导出前一致（池由 participant 还原）
  expect(after.edges).toBe(before.edges);
  expect(after.nodes).toBeGreaterThanOrEqual(before.nodes);
  await expect(page.locator('#validate-output')).toContainText('已导入');
  expect((page as any).__errors).toEqual([]);
});

test('连线：切换为消息流后线型变化，条件/默认流标记生成', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const sequence = designer.edges.find((edge: any) => (edge.state.flowType || 'sequence') === 'sequence');
    designer.updateEdge(sequence.state.id, { flowType: 'message' });
    const markers = (window as any).__ice.toolNodes.filter(
      (node: any) => node.constructor.typeId === 'ice-entity-designer:BpmnFlowMarker',
    );
    return {
      lineDash: sequence.state.lineDash,
      arrowStyle: sequence.state.arrowStyle,
      markerCount: markers.length,
      defaultFlow: designer.edges.some((edge: any) => edge.state.isDefault),
      docHasMarker: designer.serialize().includes('BpmnFlowMarker'),
    };
  });
  expect(info.lineDash).toEqual([7, 4]);
  expect(info.arrowStyle).toBe('hollow');
  expect(info.defaultFlow).toBe(true);
  expect(info.markerCount).toBeGreaterThan(0);
  // 标记是派生装饰（工具层），不进入文档
  expect(info.docHasMarker).toBe(false);
});

test('令牌仿真：从开始事件出发沿顺序流推进，停止后令牌清空且不污染文档', async ({ page }) => {
  await page.click('#btn-simulate');
  await page.waitForTimeout(500);

  const running = await page.evaluate(() => {
    const simulator = (window as any).__simulator();
    const ice = (window as any).__ice;
    return {
      tokens: simulator.getTokens().length,
      dots: ice.toolNodes.filter((node: any) => node.constructor.typeId === 'ice-entity-designer:SimToken').length,
      visited: simulator.getVisitedNodeIds().length,
      running: simulator.isRunning(),
      // 令牌是工具层组件：快照里不该出现
      serialized: (window as any).__designer.serialize().includes('SimToken'),
    };
  });
  expect(running.tokens).toBeGreaterThan(0);
  expect(running.dots).toBe(running.tokens);
  expect(running.visited).toBeGreaterThan(0);
  expect(running.serialized).toBe(false);

  // 跑一会儿：令牌会推进（访问到的节点变多）
  await page.waitForTimeout(4000);
  const progressed = await page.evaluate(() => (window as any).__simulator().getVisitedNodeIds().length);
  expect(progressed).toBeGreaterThan(running.visited);

  await page.click('#btn-simulate-stop');
  const stopped = await page.evaluate(() => {
    const simulator = (window as any).__simulator();
    const ice = (window as any).__ice;
    return {
      tokens: simulator.getTokens().length,
      dots: ice.toolNodes.filter((node: any) => node.constructor.typeId === 'ice-entity-designer:SimToken').length,
    };
  });
  expect(stopped.tokens).toBe(0);
  expect(stopped.dots).toBe(0);
  expect((page as any).__errors).toEqual([]);
});

/**
 * 记法不可变换：BPMN 图元的尺寸与朝向是记法的一部分（事件圆、网关菱形、任务圆角矩形、
 * 池/泳道的比例），只允许拖动与点选；需要变尺寸的元素（池 / 泳道 / 子流程 / 数据对象 / 注释）
 * 走属性面板的「宽 / 高」数值输入。
 */
test('记法不可变换：BPMN 图元只允许拖动与点选，容器尺寸走属性面板数值', async ({ page }) => {
  const info = await page.evaluate(() => {
    const designer = (window as any).__designer;
    return {
      nodesTransformable: designer.nodes.map((node: any) => node.state.transformable),
      edgesTransformable: designer.edges.map((edge: any) => edge.state.transformable),
      allDraggable: designer.nodes.every((node: any) => node.state.draggable === true),
    };
  });
  expect(info.nodesTransformable).toEqual(info.nodesTransformable.map(() => false));
  expect(info.edgesTransformable).toEqual(info.edgesTransformable.map(() => false));
  expect(info.allDraggable).toBe(true);

  // 池 / 泳道这类容器：改尺寸走数值（变换手柄已禁用），改完不破坏嵌套
  const pool = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const poolNode = designer.nodes.find((node: any) => node.state.kind === 'bpmnPool');
    const before = { width: poolNode.state.width, height: poolNode.state.height };
    designer.updateNode(poolNode.state.id, { width: before.width + 120, height: before.height + 60 });
    const lane = designer.nodes.find((node: any) => node.state.kind === 'bpmnLane');
    return {
      before,
      after: { width: poolNode.state.width, height: poolNode.state.height },
      laneStillNested: !!lane && lane.parentNode === poolNode,
    };
  });
  expect(pool.after.width).toBe(pool.before.width + 120);
  expect(pool.after.height).toBe(pool.before.height + 60);
  expect(pool.laneStillNested).toBe(true);
  expect((page as any).__errors).toEqual([]);
});

/**
 * 快照往返（回归）：FlowNode 既是复合组件又是容器 —— 池/泳道/节点必须都活下来。
 * 修前实测 `serialize() → load()` 会把 18 个元素打成只剩池（泳道与节点全丢）。
 */
test('快照往返：serialize → load 后元素数量与嵌套都保持', async ({ page }) => {
  const result = await page.evaluate(() => {
    const designer = (window as any).__designer;
    const before = {
      nodes: designer.nodes.length,
      edges: designer.edges.length,
      kinds: designer.nodes.map((node: any) => node.state.kind).sort(),
    };
    const report = designer.load(designer.serialize());
    const lane = designer.nodes.find((node: any) => node.state.kind === 'bpmnLane');
    const pool = designer.nodes.find((node: any) => node.state.kind === 'bpmnPool');
    return {
      before,
      report,
      after: {
        nodes: designer.nodes.length,
        edges: designer.edges.length,
        kinds: designer.nodes.map((node: any) => node.state.kind).sort(),
        laneNested: !!lane && !!pool && lane.parentNode === pool,
      },
    };
  });
  expect(result.after.nodes).toBe(result.before.nodes);
  expect(result.report.nodes).toBe(result.before.nodes);
  expect(result.after.kinds).toEqual(result.before.kinds);
  expect(result.after.laneNested).toBe(true);
  expect((page as any).__errors).toEqual([]);
});
