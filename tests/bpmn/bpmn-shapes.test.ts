/**
 * BPMN 2.0 记法图形元件（`src/bpmn/bpmn_shapes.ts`）的**几何回归**。
 *
 * 为什么单独测形状：这些类是纯几何（`createPathObject()` 往 `path2D` 里写命令流），
 * 只有"真的画一次"才会执行到 —— BPMN 的节点测试与 e2e 都只覆盖到「渲染通道」，
 * 于是这一整个模块长期是覆盖率盲区（也正因如此，池/泳道底被盖住那类事故当时没被测到）。
 *
 * 判据用**命令流**而不是像素：`Path2DRecorder._commands` 是引擎为"服务端出图 / 测试断言"
 * 专门留的几何描述（见 ice-render 的 cross-platform/Path2DRecorder），无头环境也能断言
 * "这个记法到底画成了什么形状"，不依赖 canvas。
 */
import { ICE, EventBus } from 'ice-render';
import BpmnDesigner from '../../src/bpmn/BpmnDesigner';
import {
  BpmnAnnotationShape,
  BpmnDataObjectShape,
  BpmnEventShape,
  BpmnFlowMarker,
  BpmnGatewayShape,
  BpmnLaneShape,
  BpmnSubprocessMarker,
  BpmnTaskIcon,
} from '../../src/bpmn/bpmn_shapes';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return new BpmnDesigner(ice);
}

/** 取组件的几何命令流：`ensurePathBuilt()` 是引擎给"没有渲染循环"场景留的公开入口。 */
function commands(component: any): any[][] {
  component.ensurePathBuilt();
  expect(component.path2D).toBeTruthy();
  return component.path2D._commands;
}

/** 命令流的可比较形式（只关心几何，不关心浮点尾数）。 */
function shapeOf(component: any): string {
  return JSON.stringify(
    commands(component).map((command) =>
      command.map((value) => (typeof value === 'number' ? Number(value.toFixed(3)) : value))
    )
  );
}

describe('BPMN 记法 · 事件圆', () => {
  it('三种事件 + 五种触发各自成图，互不雷同（记法可辨识）', () => {
    const triggers = ['none', 'message', 'timer', 'error', 'terminate'];
    ['start', 'intermediate', 'end'].forEach((eventKind) => {
      const geometries = triggers.map((trigger) =>
        shapeOf(new BpmnEventShape({ width: 56, height: 56, eventKind, trigger }))
      );
      geometries.forEach((geometry) => expect(geometry.length).toBeGreaterThan(2));
      // 同一事件下，五种触发必须画出五种不同的内部图标
      expect(new Set(geometries).size).toBe(triggers.length);
    });

    // 中间事件 / 结束事件比开始事件多一圈内环；两者的**几何**一样 ——
    // 结束事件的"粗圈"是描边宽度（style.lineWidth）表达的，见 BpmnEventShape 的注释。
    const start = shapeOf(new BpmnEventShape({ width: 56, height: 56, eventKind: 'start', trigger: 'none' }));
    const intermediate = shapeOf(
      new BpmnEventShape({ width: 56, height: 56, eventKind: 'intermediate', trigger: 'none' })
    );
    const end = shapeOf(new BpmnEventShape({ width: 56, height: 56, eventKind: 'end', trigger: 'none' }));
    expect(intermediate).not.toBe(start);
    expect(end).toBe(intermediate);
  });

  it('中间 / 结束事件比开始事件多一圈内环（双线记法）', () => {
    const count = (eventKind: string) =>
      commands(new BpmnEventShape({ width: 56, height: 56, eventKind, trigger: 'none' })).filter(
        (command) => command[0] === 'arc'
      ).length;
    expect(count('start')).toBe(1);
    expect(count('intermediate')).toBe(2);
    expect(count('end')).toBe(2);
  });
});

describe('BPMN 记法 · 网关 / 任务角标', () => {
  it('四种网关各自成图（排他 × / 并行 + / 包容 ○ / 事件五边形）', () => {
    const geometries = ['exclusive', 'parallel', 'inclusive', 'event'].map((gatewayType) =>
      shapeOf(new BpmnGatewayShape({ width: 70, height: 70, gatewayType }))
    );
    expect(new Set(geometries).size).toBe(4);
    // 四个都从同一个菱形起步（前 5 条命令一致）
    const heads = geometries.map((geometry) => JSON.stringify(JSON.parse(geometry).slice(0, 5)));
    expect(new Set(heads).size).toBe(1);
  });

  it('六种任务角标各自成图，none 不画角标', () => {
    const geometries = ['user', 'service', 'script', 'send', 'receive', 'manual'].map((taskType) =>
      shapeOf(new BpmnTaskIcon({ width: 14, height: 14, taskType }))
    );
    geometries.forEach((geometry) => expect(geometry.length).toBeGreaterThan(2));
    expect(new Set(geometries).size).toBe(6);

    const designer = makeDesigner();
    const bare = designer.createNode('bpmnTask', { title: '无角标', taskType: 'none' });
    const user = designer.createNode('bpmnTask', { title: '用户任务', taskType: 'user' });
    expect(bare.decorationComponents.length).toBe(0);
    expect(user.decorationComponents.length).toBe(1);
    expect(shapeOf(user.decorationComponents[0])).toBe(geometries[0]);
  });

  it('子流程带折叠「+」标记', () => {
    const designer = makeDesigner();
    const subprocess = designer.createNode('bpmnSubprocess', { title: '子流程', width: 200, height: 110 });
    expect(subprocess.decorationComponents.length).toBe(1);
    expect(shapeOf(subprocess.decorationComponents[0])).toBe(
      shapeOf(new BpmnSubprocessMarker({ width: 14, height: 14 }))
    );
  });
});

describe('BPMN 记法 · 数据对象 / 注释 / 池 / 泳道 / 流标记', () => {
  it('五种形状各自成图且互不雷同', () => {
    const geometries = [
      shapeOf(new BpmnDataObjectShape({ width: 130, height: 80 })),
      shapeOf(new BpmnAnnotationShape({ width: 200, height: 80 })),
      shapeOf(new BpmnLaneShape({ width: 900, height: 130, band: 'left', bandSize: 32 })),
      shapeOf(new BpmnLaneShape({ width: 900, height: 260, band: 'top', bandSize: 32 })),
      shapeOf(new BpmnFlowMarker({ width: 14, height: 14, markerType: 'conditional' })),
      shapeOf(new BpmnFlowMarker({ width: 14, height: 14, markerType: 'default' })),
    ];
    geometries.forEach((geometry) => expect(geometry.length).toBeGreaterThan(2));
    expect(new Set(geometries).size).toBe(geometries.length);
  });

  it('名称带：池在顶、泳道在左，分隔线方向不同', () => {
    // closePath 是收尾命令（引擎在 ensurePathBuilt 末尾补），不是分隔线：先滤掉
    const drawn = (shape: any) => commands(shape).filter((command) => command[0] !== 'closePath');
    const top = drawn(new BpmnLaneShape({ width: 900, height: 260, band: 'top', bandSize: 32 }));
    const left = drawn(new BpmnLaneShape({ width: 900, height: 130, band: 'left', bandSize: 32 }));
    // 分隔线是最后两条命令（moveTo + lineTo，格式 [op, x, y]）：
    // 顶带画横线 → 两端 y 相同；左带画竖线 → 两端 x 相同。
    const [topFrom, topTo] = top.slice(-2);
    const [leftFrom, leftTo] = left.slice(-2);
    expect(topTo[2]).toBeCloseTo(topFrom[2], 6);
    expect(topTo[1]).not.toBeCloseTo(topFrom[1], 6);
    expect(leftTo[1]).toBeCloseTo(leftFrom[1], 6);
    expect(leftTo[2]).not.toBeCloseTo(leftFrom[2], 6);
  });

  it('没有 Path2D 运行时（无头 / 低版本小程序）不抛异常', () => {
    const shapes = [
      new BpmnEventShape({ width: 56, height: 56 }),
      new BpmnGatewayShape({ width: 70, height: 70 }),
      new BpmnTaskIcon({ width: 14, height: 14, taskType: 'user' }),
      new BpmnSubprocessMarker({ width: 14, height: 14 }),
      new BpmnDataObjectShape({ width: 130, height: 80 }),
      new BpmnAnnotationShape({ width: 200, height: 80 }),
      new BpmnLaneShape({ width: 900, height: 130 }),
      new BpmnFlowMarker({ width: 14, height: 14 }),
    ];
    shapes.forEach((shape: any) => {
      shape.path2D = null;
      expect(() => (shape as any).createPathObject()).not.toThrow();
    });
  });
});

describe('BPMN 记法 · 整图与 SVG 导出', () => {
  it('案例整图导出矢量：元素名与路径都在，说明每个记法都真的被画出来了', () => {
    const designer = makeDesigner();
    designer.createNode('bpmnPool', { title: '银行', left: 60, top: 60, width: 1300, height: 340 });
    designer.createNode('bpmnLane', { title: '受理岗', left: 60, top: 92, width: 1300, height: 150 });
    const start = designer.createNode('bpmnEvent', { title: '申请提交', eventKind: 'start', left: 240, top: 120 });
    const task = designer.createNode('bpmnTask', { title: '身份核验', taskType: 'service', left: 400, top: 100 });
    const gateway = designer.createNode('bpmnGateway', {
      title: '是否通过',
      gatewayType: 'exclusive',
      left: 880,
      top: 255,
    });
    designer.createNode('bpmnSubprocess', { title: '人工复核', left: 660, top: 250 });
    designer.createNode('bpmnDataObject', { title: '征信报告', left: 1080, top: 380 });
    designer.createNode('bpmnAnnotation', {
      title: '额度 < 6000 时转人工',
      left: 600,
      top: 480,
      width: 320,
      height: 60,
    });
    designer.createEdge({ sourceId: start.state.id, targetId: task.state.id, condition: '${ok}', isDefault: true });
    designer.createEdge({ sourceId: task.state.id, targetId: gateway.state.id, label: '通过' });

    const svg = designer.toSvg({ padding: 8, background: '#ffffff' });
    expect(svg.startsWith('<svg')).toBe(true);
    // 文本按 XML 转义写出（`<` → `&lt;`），这里按导出产物的真实形态断言
    [
      '银行',
      '受理岗',
      '申请提交',
      '身份核验',
      '是否通过',
      '人工复核',
      '征信报告',
      '额度',
      '&lt; 6000 时转人工',
      '通过',
    ].forEach((text) => {
      expect(svg).toContain(text);
    });
    // 记法真的落进了矢量路径里（池/泳道/事件圆/网关/数据对象/注释/角标都有 path）
    const pathCount = (svg.match(/<path/g) || []).length;
    expect(pathCount).toBeGreaterThan(8);
    // 条件流 / 默认流的标记是**工具层**里的派生装饰（不污染文档）：默认不导出，显式要求时能带上
    expect(designer.ice.toolNodes.length).toBeGreaterThan(0);
    const withTools = designer.toSvg({ includeTools: true });
    expect((withTools.match(/<path/g) || []).length).toBeGreaterThan(pathCount);
  });
});
