/**
 * 状态机域包 · 文本互操作（PlantUML 状态图语法子集）。
 *
 * 为什么是 PlantUML 而不是 XMI：状态机的现实生态是「人和 AI 都在写 PlantUML 状态图」——
 * 导出成文本能直接进 Markdown / Wiki / PR，导入能把存量图搬进来。
 *
 * 记法约定（写死并测试）：
 * - 伪状态映射成 `[*]`：初始状态的出边写成 `[*] --> A`，终止状态的入边写成 `A --> [*]`；
 * - 复合状态写成 `state "订单处理" { ... }`，**子状态声明在块里**（块的嵌套就是容器归属）；
 * - 转移标签沿用 `事件 [守卫] / 动作`，导入时要拆回三段。
 */
import { ICE, EventBus } from 'ice-render';
import StatechartDesigner from '../../src/statechart/StatechartDesigner';
import { toPlantUmlState, fromPlantUmlState } from '../../src/statechart/statechart_text';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new StatechartDesigner(ice);
  return { ice, designer };
}

/** 与示例页同一套案例：订单状态机（含复合状态） */
function buildCase(designer: any) {
  const initial = designer.createState({ kind: 'initial', left: 120, top: 120 });
  const pending = designer.createState({ title: '待支付', left: 240, top: 100, width: 180, height: 64 });
  const paid = designer.createState({ title: '已支付', left: 620, top: 100, width: 180, height: 64 });
  const done = designer.createState({ kind: 'final', left: 1010, top: 120 });
  const composite = designer.createState({
    kind: 'composite',
    title: '订单处理',
    left: 560,
    top: 300,
    width: 520,
    height: 280,
  });
  const checking = designer.createState({ title: '库存校验', left: 620, top: 380, width: 160, height: 60 });
  const shipping = designer.createState({ title: '安排发货', left: 850, top: 380, width: 160, height: 60 });
  const canceled = designer.createState({ title: '已取消', left: 220, top: 400, width: 180, height: 64 });

  designer.createTransition({ sourceId: initial.state.id, targetId: pending.state.id });
  designer.createTransition({
    sourceId: pending.state.id,
    targetId: paid.state.id,
    event: '支付成功',
    guard: '金额 > 0',
    action: '生成订单',
  });
  designer.createTransition({ sourceId: pending.state.id, targetId: canceled.state.id, event: '超时未支付' });
  designer.createTransition({ sourceId: paid.state.id, targetId: checking.state.id, event: '进入处理' });
  designer.createTransition({ sourceId: checking.state.id, targetId: shipping.state.id, event: '库存充足' });
  designer.createTransition({ sourceId: checking.state.id, targetId: canceled.state.id, event: '缺货' });
  designer.createTransition({ sourceId: shipping.state.id, targetId: done.state.id, event: '已发货' });
  return { initial, pending, paid, done, composite, checking, shipping, canceled };
}

function titlesOf(designer: any): string[] {
  // 伪状态（初始/终止）没有名字：StateNode 的默认 title 是「状态」，这里按 kind 排除
  return designer.nodes
    .filter((node: any) => node.state.kind !== 'initial' && node.state.kind !== 'final')
    .map((node: any) => node.state.title)
    .filter((title: string) => !!title);
}

describe('状态机文本互操作 · 导出 PlantUML', () => {
  it('伪状态成 [*]、复合状态成嵌套块、转移标签原样保留', () => {
    const { designer } = makeDesigner();
    buildCase(designer);

    const text = toPlantUmlState(designer, { title: '订单状态机' });

    expect(text.startsWith('@startuml')).toBe(true);
    expect(text.endsWith('@enduml')).toBe(true);
    expect(text).toContain('title 订单状态机');
    expect(text).toContain('[*] --> 待支付');
    expect(text).toContain('待支付 --> 已支付 : 支付成功 [金额 > 0] / 生成订单');
    expect(text).toContain('安排发货 --> [*]');
    // 复合状态：子状态声明在块内（块的嵌套即容器归属）
    expect(text).toContain('state 订单处理 {');
    const compositeBlock = text.slice(text.indexOf('state 订单处理 {'));
    const block = compositeBlock.slice(0, compositeBlock.indexOf('}'));
    expect(block).toContain('库存校验');
    expect(block).toContain('安排发货');
    expect(block).not.toContain('待支付');
  });

  it('没有初始/终止状态时也能导出（不给伪状态凭空造 [*]）', () => {
    const { designer } = makeDesigner();
    const a = designer.createState({ title: 'A' });
    const b = designer.createState({ title: 'B' });
    designer.createTransition({ sourceId: a.state.id, targetId: b.state.id, event: '下一步' });

    const text = toPlantUmlState(designer);
    expect(text).not.toContain('[*]');
    expect(text).toContain('A --> B : 下一步');
  });

  it('名字含空格或重名时给稳定别名（PlantUML 裸标识符会撞名/截断）', () => {
    const { designer } = makeDesigner();
    const weird = designer.createState({ title: '含 空格' });
    const dupA = designer.createState({ title: '重名' });
    const dupB = designer.createState({ title: '重名' });
    designer.createTransition({ sourceId: weird.state.id, targetId: dupA.state.id, event: '走' });
    designer.createTransition({ sourceId: dupA.state.id, targetId: dupB.state.id, event: '再走' });

    const text = toPlantUmlState(designer);
    expect(text).toContain('state "含 空格" as S1');
    expect(text).toContain('state "重名" as S2');
    expect(text).toContain('state "重名" as S3');
    // 转移引用别名，不引用会撞名的原名
    expect(text).toContain('S1 --> S2 : 走');
    expect(text).toContain('S2 --> S3 : 再走');
  });
});

describe('状态机文本互操作 · 导入 PlantUML', () => {
  it('往返：导出再导入，状态种类/名字/复合容器/转移三段标签逐项还原', () => {
    const { designer } = makeDesigner();
    buildCase(designer);
    const text = toPlantUmlState(designer);

    const { designer: next } = makeDesigner();
    const report = fromPlantUmlState(text, next);

    expect(report.warnings).toEqual([]);
    expect(report.transitions).toBe(designer.edges.length);
    expect(titlesOf(next).sort()).toEqual(titlesOf(designer).sort());
    expect(next.nodes.filter((n: any) => n.state.kind === 'initial')).toHaveLength(1);
    expect(next.nodes.filter((n: any) => n.state.kind === 'final')).toHaveLength(1);

    // 复合状态真的装下了子状态（容器语义，不是平铺）
    const composite = next.nodes.find((n: any) => n.state.title === '订单处理');
    expect(composite.state.kind).toBe('composite');
    const nested = composite.childNodes
      .filter((child: any) => child.state && child.state.title)
      .map((child: any) => child.state.title)
      .sort();
    expect(nested).toEqual(['安排发货', '库存校验']);

    // 标签拆回三段：事件 / 守卫 / 动作
    const paidTransition = next.edges.find((edge: any) => edge.state.event === '支付成功');
    expect(paidTransition.state.guard).toBe('金额 > 0');
    expect(paidTransition.state.action).toBe('生成订单');
    // 只有事件的转移不该被拆出空的守卫/动作
    const timeout = next.edges.find((edge: any) => edge.state.event === '超时未支付');
    expect([timeout.state.guard, timeout.state.action]).toEqual(['', '']);

    expect(next.validateStatechart().filter((issue: any) => issue.level === 'error')).toEqual([]);
  });

  it('导入：注释/空行/未知指令忽略，不认识的行进 warnings 但不阻断', () => {
    const { designer } = makeDesigner();
    const report = fromPlantUmlState(
      [
        '@startuml',
        "' 这是注释",
        '// 也是注释',
        'title 订单状态机',
        'skinparam shadowing false',
        '[*] --> 待支付',
        '待支付 --> 已支付 : 支付成功 [金额 > 0] / 生成订单',
        '这一行不是合法语法',
        '@enduml',
      ].join('\n'),
      designer
    );

    expect(report.transitions).toBe(2);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('这一行不是合法语法');
    // 导入会先清空当前模型（与 BPMN XML 导入同一语义）
    // 中文按 UTF-16 码位排序，直接 sort 比较两边（别硬写顺序）
    expect(titlesOf(designer).sort()).toEqual(['待支付', '已支付'].sort());
    const paid = designer.edges.find((edge: any) => edge.state.event === '支付成功');
    expect([paid.state.guard, paid.state.action]).toEqual(['金额 > 0', '生成订单']);
  });
});
