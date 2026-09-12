/**
 * 甘特域包 · 文本互操作（Mermaid gantt 语法子集）。
 *
 * Mermaid 的 gantt 是事实标准：导出的文本能直接进 Markdown / 文档站 / PR 描述。
 * 记法约定（写死并测试）：
 * - `section` ↔ 负责人（resource）：Mermaid 的 section 就是「一组任务」，与「同一个负责人/团队」天然对应；
 * - 单前置依赖用 `after <id>`（Mermaid 会自己画依赖箭头）；**多前置**在 Mermaid 里没法表达，
 *   这类任务退化成「显式起始日期」，依赖关系写进 `%% task <id>: deps=...` 注释（Mermaid 忽略注释，往返不丢）；
 * - 进度：1 → `done`，0 ~ 1 之间 → `active`，同时把精确数值写进 `%% task <id>: progress=...`（Mermaid 只认标签）。
 */
import { ICE, EventBus } from 'ice-render';
import GanttDesigner from '../../src/gantt/GanttDesigner';
import { toMermaidGantt, fromMermaidGantt } from '../../src/gantt/gantt_text';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer = new GanttDesigner(ice);
  designer.setDayWidth(28);
  return { ice, designer };
}

/** 与示例页同一套案例：移动端 2.0 发布排期 */
function buildCase(designer: any) {
  const review = designer.createTask({
    title: '需求评审',
    start: '2026-03-02',
    days: 4,
    progress: 1,
    row: 0,
    resource: '产品',
  });
  const design = designer.createTask({
    title: '交互设计',
    start: '2026-03-05',
    days: 6,
    progress: 0.8,
    row: 1,
    resource: '产品',
  });
  const frontend = designer.createTask({
    title: '前端开发',
    start: '2026-03-10',
    days: 12,
    progress: 0.35,
    row: 2,
    resource: '前端组',
  });
  const backend = designer.createTask({
    title: '后端接口',
    start: '2026-03-09',
    days: 14,
    progress: 0.5,
    row: 3,
    resource: '后端组',
  });
  const test = designer.createTask({ title: '联调测试', start: '2026-03-24', days: 6, row: 4 });
  designer.createDependency({ sourceId: review.state.id, targetId: design.state.id });
  designer.createDependency({ sourceId: design.state.id, targetId: frontend.state.id });
  designer.createDependency({ sourceId: review.state.id, targetId: backend.state.id });
  designer.createDependency({ sourceId: frontend.state.id, targetId: test.state.id });
  designer.createDependency({ sourceId: backend.state.id, targetId: test.state.id });
  return { review, design, frontend, backend, test };
}

/**
 * 内容快照：**按任务标题**（而不是数组下标）对齐，依赖表达成前置任务标题。
 * 导出会把「没有负责人的任务」提到最前面（Mermaid 的 section 语法要求），
 * 所以往返比较的是内容，不是行序。
 */
function snapshot(designer: any) {
  const titleById = new Map<string, string>();
  designer.nodes.forEach((task: any) => titleById.set(task.state.id, task.state.title));
  return designer.nodes
    .map((task: any) => ({
      title: task.state.title,
      start: task.state.start,
      days: task.state.days,
      progress: task.state.progress,
      resource: task.state.resource,
      after: designer.edges
        .filter((edge: any) => edge.state.links.end.id === task.state.id)
        .map((edge: any) => titleById.get(edge.state.links.start.id))
        .sort(),
    }))
    .sort((a: any, b: any) => (a.title < b.title ? -1 : 1));
}

describe('甘特文本互操作 · 导出 Mermaid', () => {
  it('按负责人分组 section，进度用 done/active 标签', () => {
    const { designer } = makeDesigner();
    buildCase(designer);

    const text = toMermaidGantt(designer, { title: '移动端 2.0 发布排期' });

    expect(text.startsWith('gantt')).toBe(true);
    expect(text).toContain('title 移动端 2.0 发布排期');
    expect(text).toContain('dateFormat YYYY-MM-DD');
    expect(text).toContain('section 产品');
    expect(text).toContain('section 前端组');
    expect(text).toMatch(/需求评审 :done, t1, 2026-03-02, 4d/);
    expect(text).toMatch(/交互设计 :active, t2, 2026-03-05, 6d/);
    // 没有负责人的任务放在所有 section 之前（Mermaid 允许顶层任务）
    expect(text.indexOf('联调测试')).toBeLessThan(text.indexOf('section 产品'));
  });

  it('排期正好是「紧接前置结束」时用 after（Mermaid 才画得出依赖箭头）', () => {
    const { designer } = makeDesigner();
    buildCase(designer);
    designer.autoSchedule();

    const text = toMermaidGantt(designer);
    expect(text).toMatch(/交互设计 :active, t2, after t1, 6d/);
    expect(text).toMatch(/前端开发 :active, t3, after t2, 12d/);
    // 联调测试有两个前置：Mermaid 没有多前置语法，仍是显式日期
    // （autoSchedule 只推后不提前，所以这里保留文档里写的 03-24）
    expect(text).toMatch(/联调测试 :t5, 2026-03-24, 6d/);
  });

  it('Mermaid 表达不了的东西走注释通道：精确进度、带 buffer 的排期、多前置依赖', () => {
    const { designer } = makeDesigner();
    buildCase(designer);

    const text = toMermaidGantt(designer);

    // 0.35 这种数值进度只能落在注释里（标签只有 done / active）
    expect(text).toContain('%% task t3: progress=0.35');
    // 进度恰好 1 时用 done 表达，不必再写注释
    expect(text).not.toContain('%% task t1: progress');
    // 交互设计比「需求评审结束」晚一天（人为留的 buffer）：Mermaid 的 after 表达不了，退回显式日期 + 注释补依赖
    expect(text).toMatch(/交互设计 :active, t2, 2026-03-05, 6d/);
    expect(text).toContain('%% task t2: progress=0.8 deps=t1');
    // 联调测试有两个前置：同样退化成显式日期 + 注释补依赖
    expect(text).toMatch(/联调测试 :t5, 2026-03-24, 6d/);
    expect(text).toContain('%% task t5: deps=t3,t4');
  });
});

describe('甘特文本互操作 · 导入 Mermaid', () => {
  it('往返：标题/负责人/日期/天数/进度/依赖逐项还原', () => {
    const { designer } = makeDesigner();
    buildCase(designer);
    const text = toMermaidGantt(designer);

    const { designer: next } = makeDesigner();
    const report = fromMermaidGantt(text, next);

    expect(report.warnings).toEqual([]);
    expect(report.tasks).toBe(designer.nodes.length);
    expect(report.dependencies).toBe(designer.edges.length);
    expect(snapshot(next)).toEqual(snapshot(designer));
  });

  it('导入：section 映射成负责人，`after` 解析成「前置结束 → 本任务开始」并建依赖', () => {
    const { designer } = makeDesigner();
    const report = fromMermaidGantt(
      [
        'gantt',
        '  dateFormat YYYY-MM-DD',
        '  section 前端组',
        '  需求评审 :done, review, 2026-03-02, 4d',
        '  前端开发 :active, fe, after review, 12d',
      ].join('\n'),
      designer
    );

    expect(report.warnings).toEqual([]);
    expect(report.tasks).toBe(2);
    expect(report.dependencies).toBe(1);
    const [review, fe] = designer.nodes;
    expect(review.state.resource).toBe('前端组');
    expect(review.state.progress).toBe(1);
    expect(fe.state.start).toBe('2026-03-06'); // 完成 → 开始：03-02 + 4 天
    expect(fe.state.days).toBe(12);
    // active 只能给出「进行中」，落成 0.5（精确值要靠 %% task 注释）
    expect(fe.state.progress).toBe(0.5);
    expect(designer.edges[0].state.links.start.id).toBe(review.state.id);
  });

  it('导入容错：未知指令忽略、坏行进 warnings、`%% task` 注释补精确值', () => {
    const { designer } = makeDesigner();
    const report = fromMermaidGantt(
      [
        'gantt',
        '  title 排期',
        '  dateFormat YYYY-MM-DD',
        '  excludes weekends',
        '  任务 A :a1, 2026-03-02, 3d',
        '  %% task a1: progress=0.35',
        '  这行不合法',
      ].join('\n'),
      designer
    );

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('这行不合法');
    expect(designer.nodes).toHaveLength(1);
    expect(designer.nodes[0].state.title).toBe('任务 A');
    expect(designer.nodes[0].state.progress).toBe(0.35);
  });
});
