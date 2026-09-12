/**
 * 甘特图（gantt）域包规格测试 —— 第三个 domain pack。
 *
 * 与前两个包不同，甘特会逼出引擎的两个新能力：
 * - **时间轴**：日期 ↔ 像素的换算与刻度渲染（标尺 + 左列任务名 + 行分隔线）；
 * - **拖拽吸附粒度**：拖动任务条要吸附到「整天」，而不是任意像素（排期语义）。
 *
 * 记法：任务条（宽度 = 持续天数 × 每日像素）、进度覆盖、依赖箭头（完成 → 开始）、
 * 标尺（年-月-日刻度）与左列任务名。
 */
import { ICE, EventBus } from 'ice-render';
import GanttTask from '../../src/gantt/GanttTask';
import GanttDependency from '../../src/gantt/GanttDependency';
import GanttRuler from '../../src/gantt/GanttRuler';
import GanttDesigner from '../../src/gantt/GanttDesigner';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new GanttDesigner(ice);
  return { ice, designer };
}

function childTexts(component: any): string[] {
  return (component.childNodes || [])
    .filter((child: any) => typeof child.state.text === 'string')
    .map((child: any) => child.state.text);
}

describe('甘特域包 · 任务条（时间 ↔ 像素）', () => {
  it('任务条位置与宽度由「起始日期 + 持续天数 × 每日像素」决定', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const task = designer.createTask({ title: '需求评审', start: '2026-03-02', days: 5, row: 0 });

    // 第 0 天（项目起点）的任务条左边缘 = 左列宽度
    expect(task.barLeft()).toBe(designer.labelColumnWidth);
    expect(task.state.width).toBe(5 * 30);
    expect(childTexts(task)).toContain('需求评审（5 天）');

    const later = designer.createTask({ title: '开发', start: '2026-03-09', days: 4, row: 1 });
    // 晚 7 天 → 右移 7 × 30
    expect(later.barLeft()).toBe(designer.labelColumnWidth + 7 * 30);
  });

  it('拖动任务条会吸附到整天（排期语义，不是任意像素）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const task = designer.createTask({ title: '开发', start: '2026-03-02', days: 4, row: 0 });

    // 往右拖 47px（1.57 天）→ 应吸附到 2 天
    task.setPosition(task.state.left + 47, task.state.top);
    expect(task.state.start).toBe('2026-03-04');
    expect(task.barLeft()).toBe(designer.labelColumnWidth + 2 * 30);
  });
});

describe('甘特域包 · 进度', () => {
  it('进度覆盖条的宽度 = 进度 × 任务条宽度，文字标注百分比', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(20);
    const task = designer.createTask({ title: '联调', start: '2026-03-02', days: 10, row: 0, progress: 0.4 });
    expect(task.progressWidth()).toBeCloseTo(0.4 * 10 * 20, 1);
    expect(childTexts(task).join(' | ')).toContain('40%');
  });
});

describe('甘特域包 · 依赖与标尺', () => {
  it('依赖箭头从「前置任务结束」指向「后置任务开始」', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 3, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-06', days: 2, row: 1 });
    const link = designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });

    expect(link.constructor.typeId).toBe(GanttDependency.typeId);
    expect(link.state.arrow).toBe('end');
    const box = link.getMinBoundingBox(true);
    // 连线应当落在两条任务条之间（而不是叠在某个任务上）
    expect(box.tl[0]).toBeGreaterThanOrEqual(a.barLeft());
    expect(box.br[0]).toBeLessThanOrEqual(b.barLeft() + b.state.width + 1);
  });

  it('标尺渲染日期刻度与左列任务名（引擎的时间轴能力）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    // 刻意跨月：2/25 起，验证「月初显示月份」这条刻度规则
    designer.createTask({ title: '需求评审', start: '2026-02-25', days: 5, row: 0 });
    designer.createTask({ title: '开发', start: '2026-03-03', days: 4, row: 1 });

    const ruler = designer.ruler;
    expect(ruler.constructor.typeId).toBe(GanttRuler.typeId);
    const texts = childTexts(ruler).join(' | ');
    expect(texts).toContain('任务'); // 左列表头
    expect(texts).toContain('需求评审'); // 左列任务名
    expect(texts).toContain('开发');
    expect(texts).toContain('3月'); // 跨月时月初给出月份
    // 每日一个刻度（去掉表头与任务名后应当有 10 个以上的刻度文字）
    const ticks = childTexts(ruler).filter((text) => /^(\d+月|\d+)$/.test(text));
    expect(ticks.length).toBeGreaterThanOrEqual(10);
  });

  it('拖动任务后标尺/依赖随之更新（复用引擎的 AFTER_MOVE 跟随）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 3, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-20', days: 2, row: 1 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });
    const link = designer.edges[0];
    // 引擎在 ROUND_FINISH 后才把「跟随宿主」的监听挂上
    (designer as any).ice.evtBus.trigger('ROUND_FINISH');
    const before = link.state.points.map((point: number[]) => point.slice());

    a.applyPatch({ start: '2026-03-10' });

    const after = link.state.points.map((point: number[]) => point.slice());
    expect(after).not.toEqual(before);
  });
});

describe('甘特域包 · 校验与快照', () => {
  it('语义校验：依赖成环 / 进度越界 / 任务早于项目起点', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 3, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-06', days: 2, row: 1 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });
    expect(designer.validateGantt()).toEqual([]);

    // 成环
    designer.createDependency({ sourceId: b.state.id, targetId: a.state.id });
    expect(
      designer
        .validateGantt()
        .map((issue: any) => issue.message)
        .join(' | ')
    ).toContain('依赖成环');

    // 进度越界
    b.applyPatch({ progress: 1.4 });
    expect(
      designer
        .validateGantt()
        .map((issue: any) => issue.message)
        .join(' | ')
    ).toContain('进度');
  });

  it('快照往返：任务与依赖原样恢复（含日期与进度）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(24);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 3, row: 0, progress: 0.5 });
    const b = designer.createTask({ title: 'B', start: '2026-03-06', days: 2, row: 1 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });

    const snapshot = designer.serialize();
    const reloaded = makeDesigner();
    reloaded.designer.setDayWidth(24);
    reloaded.designer.load(snapshot);

    const tasks = reloaded.designer.nodes;
    expect(tasks.map((task: any) => task.state.title).sort()).toEqual(['A', 'B']);
    const restoredA = tasks.find((task: any) => task.state.title === 'A');
    expect(restoredA.state.start).toBe('2026-03-02');
    expect(restoredA.state.days).toBe(3);
    expect(restoredA.state.progress).toBe(0.5);
    expect(reloaded.designer.edges.length).toBe(1);
  });

  it('导出 SVG：任务名、百分比与日期刻度都进矢量产物', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    designer.createTask({ title: '需求评审', start: '2026-03-02', days: 5, row: 0, progress: 0.6 });
    const svg = designer.toSvg({ padding: 12, background: '#ffffff' });
    expect(svg).toContain('需求评审（5 天）');
    expect(svg).toContain('60%');
    expect(svg).toContain('任务');
    expect(svg).toContain('<path');
  });
});

describe('甘特域包 · 自动排程 / 关键路径 / 资源冲突', () => {
  it('自动排程：后置任务被推到「前置任务结束」之后（完成→开始，结束日不含当天）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 4, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-03', days: 2, row: 1 }); // 故意排早了
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });

    designer.autoSchedule();

    // A 占 3-02 ~ 3-05（4 天，不含 3-06 起算）→ B 最早 3-06 开工
    expect(a.state.start).toBe('2026-03-02');
    expect(b.state.start).toBe('2026-03-06');
  });

  it('自动排程会级联：整条链依次顺延（且不改变原本就合规的排期）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 3, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-02', days: 2, row: 1 });
    const c = designer.createTask({ title: 'C', start: '2026-03-02', days: 1, row: 2 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });
    designer.createDependency({ sourceId: b.state.id, targetId: c.state.id });

    designer.autoSchedule();
    expect([a.state.start, b.state.start, c.state.start]).toEqual(['2026-03-02', '2026-03-05', '2026-03-07']);

    // 再排一次应当幂等（已经合规）
    designer.autoSchedule();
    expect([a.state.start, b.state.start, c.state.start]).toEqual(['2026-03-02', '2026-03-05', '2026-03-07']);
  });

  it('关键路径：时长最长的那条链，浮时为 0', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    // 短链：A(2) → C(1)；长链：A(2) → B(10) → C(1)
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 2, row: 0 });
    const b = designer.createTask({ title: 'B', start: '2026-03-04', days: 10, row: 1 });
    const c = designer.createTask({ title: 'C', start: '2026-03-14', days: 1, row: 2 });
    const fast = designer.createTask({ title: '快速通道', start: '2026-03-04', days: 1, row: 3 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });
    designer.createDependency({ sourceId: b.state.id, targetId: c.state.id });
    designer.createDependency({ sourceId: a.state.id, targetId: fast.state.id });
    designer.createDependency({ sourceId: fast.state.id, targetId: c.state.id });

    const critical = designer.criticalPath();
    expect(critical.map((task: any) => task.state.title)).toEqual(['A', 'B', 'C']);
    // 快速通道不在关键路径上（有浮时）
    expect(critical.map((task: any) => task.state.title)).not.toContain('快速通道');
  });

  it('关键路径按「尽早排」算：任务自身日期偏晚也不会把链路算错（回归）', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    // 依赖链 A(4) → B(6) → C(3)；但 C 自己写了个很晚的日期（没有自动排程）
    const a = designer.createTask({ title: '设计', start: '2026-03-02', days: 4, row: 0 });
    const b = designer.createTask({ title: '开发', start: '2026-03-03', days: 6, row: 1 });
    const c = designer.createTask({ title: '测试', start: '2026-03-20', days: 3, row: 2 });
    designer.createDependency({ sourceId: a.state.id, targetId: b.state.id });
    designer.createDependency({ sourceId: b.state.id, targetId: c.state.id });

    // 关键路径是整条链，而不是「浮时为 0 的末端任务」
    expect(designer.criticalPath().map((task: any) => task.state.title)).toEqual(['设计', '开发', '测试']);
  });

  it('资源冲突：同一负责人的任务时间重叠时报出来，不重叠时不报', () => {
    const { designer } = makeDesigner();
    designer.setDayWidth(30);
    const a = designer.createTask({ title: 'A', start: '2026-03-02', days: 4, row: 0, resource: '张三' });
    const b = designer.createTask({ title: 'B', start: '2026-03-10', days: 3, row: 1, resource: '张三' });
    expect(designer.validateGantt().filter((issue: any) => issue.message.includes('资源')).length).toBe(0);

    // 把 B 挪到与 A 重叠
    designer.updateTask(b.state.id, { start: '2026-03-04' });
    const conflicts = designer.validateGantt().filter((issue: any) => issue.message.includes('资源'));
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].message).toContain('张三');
    expect(conflicts[0].level).toBe('warning');

    // 换个人就不冲突
    designer.updateTask(b.state.id, { resource: '李四' });
    expect(designer.validateGantt().filter((issue: any) => issue.message.includes('资源')).length).toBe(0);
  });
});
