/**
 * UML 类图域包（第一个 domain pack）规格测试。
 *
 * 域包 = 形状 + 应用层 + 校验 + 互操作 + 文档，全部复用引擎既有机制：
 * 复合组件（hasDerivedChildren）、连线（ICEPolyLine 的 dots/标记）、容器、快照（引擎序列化）。
 *
 * 本文件按「记法」写断言，不写实现细节：
 * - 类框是**三段式**（类名 / 属性 / 方法），接口与枚举带构造型；
 * - 类框高度随成员数量增长（记法要求：不能把成员画出框外）；
 * - 关系有六种，线型与端点标记按 UML 记法区分（继承/实现 = 空心三角、聚合/组合 = 菱形、依赖 = 虚线开放箭头）；
 * - 快照往返：类与关系都能原样恢复，派生内部子组件不写进文档。
 */
import { ICE, EventBus } from 'ice-render';
import UmlClass from '../../src/uml/UmlClass';
import UmlRelation, { UML_RELATION_KINDS } from '../../src/uml/UmlRelation';
import UmlDesigner from '../../src/uml/UmlDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new UmlDesigner(ice);
  return { ice, designer };
}

/** 派生内部子组件里所有可见文本 */
function textsOf(component: any): string[] {
  return (component.childNodes || [])
    .filter((child: any) => typeof child.state.text === 'string')
    .map((child: any) => child.state.text);
}

describe('UML 域包 · 类框（三 compartment）', () => {
  it('类框由「类名 + 属性 + 方法」三段组成，接口/枚举带构造型', () => {
    const cls = new UmlClass({
      kind: 'class',
      className: 'Order',
      attributes: ['- id: string', '+ total: number'],
      methods: ['+ pay(): void'],
    });
    const clsTexts = textsOf(cls);
    expect(clsTexts).toContain('Order');
    expect(clsTexts).toContain('- id: string');
    expect(clsTexts).toContain('+ total: number');
    expect(clsTexts).toContain('+ pay(): void');

    const iface = new UmlClass({ kind: 'interface', className: 'Payable', attributes: [], methods: ['+ pay(): void'] });
    expect(textsOf(iface)).toContain('«interface»');
    expect(textsOf(iface)).toContain('Payable');

    const en = new UmlClass({ kind: 'enum', className: 'Status', attributes: ['PAID', 'UNPAID'] });
    expect(textsOf(en)).toContain('«enumeration»');
  });

  it('内部文字锚点都落在类框内（回归：textBaseline=middle 时按原点居中，用 top 定位会画到框外）', () => {
    const cls = new UmlClass({
      kind: 'interface',
      className: 'Payable',
      attributes: ['- id: string'],
      methods: ['+ pay(): void'],
    });
    // 内部文字都按「中心」定位：left/top 就是文字锚点（局部坐标，父容器左上角为原点）
    cls.childNodes.forEach((child: any) => {
      if (typeof child.state.text !== 'string') {
        return;
      }
      // left/top 是子组件盒子左上角，盒子必须整个落在类框里（超宽会画到框外）
      expect(child.state.left).toBeGreaterThanOrEqual(0);
      expect(child.state.left + child.state.width).toBeLessThanOrEqual(cls.state.width + 0.01);
      expect(child.state.top).toBeGreaterThanOrEqual(0);
      expect(child.state.top + child.state.height).toBeLessThanOrEqual(cls.state.height + 0.01);
    });
  });

  it('类框高度随成员数量增长（成员不会被画到框外）', () => {
    const small = new UmlClass({ className: 'A', attributes: ['x'], methods: [] });
    const big = new UmlClass({
      className: 'B',
      attributes: ['a', 'b', 'c', 'd'],
      methods: ['m1()', 'm2()', 'm3()'],
    });
    expect(big.state.height).toBeGreaterThan(small.state.height);
  });

  it('改成员后重新排版（属性/方法都更新，且派生内部子组件不进快照）', () => {
    const cls = new UmlClass({ className: 'A', attributes: ['x'], methods: [] });
    const before = cls.state.height;
    cls.setState({ attributes: ['x', 'y', 'z'], methods: ['m()'] });
    const after = textsOf(cls);
    expect(after).toContain('y');
    expect(after).toContain('m()');
    expect(cls.state.height).toBeGreaterThan(before);
    // 复合组件：内部子组件由 state 派生，序列化时应当被跳过
    expect(cls.hasDerivedChildren()).toBe(true);
  });
});

describe('UML 域包 · 关系（六种记法）', () => {
  it('六种关系的线型/端点标记按 UML 记法区分', () => {
    const kindStyle = (kind: string) => {
      const relation = new UmlRelation({
        relationKind: kind,
        points: [
          [0, 0],
          [100, 0],
        ],
      });
      return {
        dash: (relation.state.lineDash || []).length > 0,
        arrowStyle: relation.state.arrowStyle,
        faces: (relation as any).__arrowFaceIndexes.length,
        marker: relation.state.umlMarker,
      };
    };

    expect(UML_RELATION_KINDS).toEqual([
      'inheritance',
      'realization',
      'association',
      'aggregation',
      'composition',
      'dependency',
    ]);

    // 继承：实线 + 空心三角；实现：虚线 + 空心三角
    expect(kindStyle('inheritance')).toMatchObject({ dash: false, arrowStyle: 'hollow', marker: 'triangle' });
    expect(kindStyle('realization')).toMatchObject({ dash: true, arrowStyle: 'hollow', marker: 'triangle' });
    // 聚合：空心菱形；组合：实心菱形
    expect(kindStyle('aggregation')).toMatchObject({ dash: false, arrowStyle: 'hollow', marker: 'diamond' });
    expect(kindStyle('composition')).toMatchObject({ dash: false, arrowStyle: 'filled', marker: 'diamond' });
    // 依赖：虚线 + 开放箭头
    expect(kindStyle('dependency')).toMatchObject({ dash: true, arrowStyle: 'hollow', marker: 'open' });
    // 关联：实线、无端点标记
    expect(kindStyle('association')).toMatchObject({ dash: false, arrowStyle: 'none', marker: 'none' });
  });

  it('菱形/三角标记进入路径点集（因此描边与 SVG 导出都能看到）', () => {
    const composition = new UmlRelation({
      relationKind: 'composition',
      points: [
        [0, 0],
        [100, 0],
      ],
    });
    composition.ensureDots();
    // 组合的菱形在「整体」一侧（起点），4 个顶点进 dots
    expect(composition.state.dots.length).toBeGreaterThanOrEqual(5);
    expect((composition as any).__arrowFaceIndexes.length).toBe(1);
  });
});

describe('UML 域包 · 设计器（复用 FlowDesigner 的选择/历史/快照）', () => {
  it('createClass 建类并按 UML 类型注册；relation 按类型建边', () => {
    const { ice, designer } = makeDesigner();
    const order = designer.createClass({ className: 'Order', attributes: ['- id: string'], left: 100, top: 100 });
    const payable = designer.createClass({ kind: 'interface', className: 'Payable', left: 400, top: 100 });

    expect(ice.getTypeId(UmlClass)).toBe('UmlClass');
    expect(designer.nodes.length).toBe(2);
    expect(order.state.kind).toBe('class');
    expect(payable.state.kind).toBe('interface');

    const relation = designer.createRelation({
      sourceId: order.state.id,
      targetId: payable.state.id,
      relationKind: 'realization',
    });
    expect(designer.edges.length).toBe(1);
    expect(relation.state.relationKind).toBe('realization');
    expect(relation.state.lineDash.length).toBeGreaterThan(0);
  });

  it('快照往返：类与关系原样恢复（含成员与关系种类）', () => {
    const { designer } = makeDesigner();
    const a = designer.createClass({
      className: 'A',
      attributes: ['- x: int'],
      methods: ['+ m(): void'],
      left: 80,
      top: 80,
    });
    const b = designer.createClass({ kind: 'interface', className: 'B', left: 400, top: 80 });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id, relationKind: 'inheritance' });

    const snapshot = designer.serialize();
    const reloaded = makeDesigner();
    reloaded.designer.load(snapshot);

    const classes = reloaded.designer.nodes;
    expect(classes.length).toBe(2);
    const restoredA = classes.find((c: any) => c.state.className === 'A');
    expect(restoredA.state.attributes).toEqual(['- x: int']);
    expect(restoredA.state.methods).toEqual(['+ m(): void']);
    expect(textsOf(restoredA)).toContain('- x: int'); // 载入后按 state 重建了内部子组件
    expect(reloaded.designer.edges[0].state.relationKind).toBe('inheritance');
  });

  it('导出 SVG：类框三段文字与关系都进矢量产物', () => {
    const { designer } = makeDesigner();
    const a = designer.createClass({
      className: 'Order',
      attributes: ['- id: string'],
      methods: ['+ pay(): void'],
      left: 60,
      top: 60,
    });
    const b = designer.createClass({ className: 'Payment', left: 380, top: 60 });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id, relationKind: 'association', label: '1..*' });

    const svg = designer.toSvg({ padding: 12, background: '#ffffff' });
    expect(svg).toContain('Order');
    expect(svg).toContain('- id: string');
    expect(svg).toContain('+ pay(): void');
    expect(svg).toContain('Payment');
    expect(svg).toContain('1..*');
    expect(svg).toContain('<path');
  });

  it('语义校验：重名类、继承成环都能报出来', () => {
    const { designer } = makeDesigner();

    // 干净的模型：两个类 + 一条继承（A 继承 Base），不该报错
    const base = designer.createClass({ className: 'Base', left: 60, top: 60 });
    const order = designer.createClass({ className: 'Order', left: 360, top: 60 });
    designer.createRelation({ sourceId: order.state.id, targetId: base.state.id, relationKind: 'inheritance' });
    expect(designer.validateUml()).toEqual([]);

    // 重名：再加一个也叫 Order 的类
    designer.createClass({ className: 'Order', left: 60, top: 320 });
    expect(
      designer
        .validateUml()
        .map((i: any) => i.message)
        .join(' | ')
    ).toContain('类名重复：Order');

    // 继承成环：让 Base 反过来继承 Order
    designer.createRelation({ sourceId: base.state.id, targetId: order.state.id, relationKind: 'inheritance' });
    expect(
      designer
        .validateUml()
        .map((i: any) => i.message)
        .join(' | ')
    ).toContain('继承关系成环');
  });

  it('关系记法有可读描述（属性面板/文档共用一份文案）', () => {
    expect(UmlDesigner.describeRelationKind('inheritance')).toBe('实线 + 空心三角');
    expect(UmlDesigner.describeRelationKind('composition')).toBe('实线 + 实心菱形');
    expect(UmlDesigner.describeRelationKind('dependency')).toBe('虚线 + 开放箭头');
  });
});
