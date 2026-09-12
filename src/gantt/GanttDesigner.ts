/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import FlowDesigner from '../flow/FlowDesigner';
import GanttTask from './GanttTask';
import GanttDependency from './GanttDependency';
import GanttRuler from './GanttRuler';
import { addDays, diffDays } from './gantt_date';

export type GanttIssue = { level: 'error' | 'warning'; message: string; id?: string };

export type GanttTaskInput = {
  title?: string;
  /** `YYYY-MM-DD` */
  start: string;
  days?: number;
  row?: number;
  progress?: number;
  /** 负责人 / 资源名（用于资源冲突检查；空表示不参与） */
  resource?: string;
};

/**
 * @class GanttDesigner 甘特图设计器（第三个 domain pack）
 *
 * 与前两个包同一套结构（`FlowDesigner` 薄扩展 + 类型过滤 + 语义校验 + 复用快照/导出），
 * 额外引入两件甘特特有的东西：
 *
 * 1. **时间轴**：日期 ↔ 像素的统一换算（`dayWidth` / `originDate` / `labelColumnWidth`），
 *    框架（左列任务名 + 日期刻度 + 行线）由一个派生的 `GanttRuler` 组件渲染并在模型变化时重建；
 * 2. **吸附**：任务条的拖拽按「整天」吸附（见 `GanttTask.setPosition`），排期不会出现小数天。
 */
export default class GanttDesigner extends FlowDesigner {
  /** 左列（任务名）宽度 */
  public labelColumnWidth = 140;
  /** 时间轴顶部标尺高度 */
  public headerHeight = 34;
  /** 行高 */
  public rowHeight = 36;
  /** 每天像素 */
  public dayWidth = 28;
  /** 项目起点（自动取最早任务开始日） */
  public originDate = '';

  public ruler: GanttRuler = null as any;
  private __syncing = false;

  constructor(ice: any) {
    super(ice);
    this.ice.registerType(GanttTask.typeId, GanttTask as any);
    this.ice.registerType(GanttDependency.typeId, GanttDependency as any);
    this.ice.registerType(GanttRuler.typeId, GanttRuler as any);
  }

  public get nodes(): any[] {
    return this.__flatten().filter((item: any) => item.constructor && item.constructor.typeId === GanttTask.typeId);
  }

  public get edges(): any[] {
    return this.__flatten().filter(
      (item: any) => item.constructor && item.constructor.typeId === GanttDependency.typeId
    );
  }

  /**
   * 建一条任务（条）：坐标由「起始日期 × 每日像素」算出，不接受任意 left/top
   * —— 甘特的横轴是时间，不是自由画布。
   */
  public createTask(props: GanttTaskInput & { id?: string }): any {
    this.__captureHistory();
    const task = new GanttTask({
      id: props.id,
      title: props.title || '任务',
      start: props.start,
      days: props.days || 3,
      progress: props.progress || 0,
      resource: props.resource || '',
      row: props.row === undefined ? this.nodes.length : props.row,
      dayWidth: this.dayWidth,
      originDate: this.originDate || props.start,
      labelColumnWidth: this.labelColumnWidth,
      rowHeight: this.rowHeight,
      headerHeight: this.headerHeight,
    });
    this.ice.addChild(task);
    this.__attachNodeListeners(task);
    this.selectedId = task.state.id;
    this.syncChrome();
    this.__emitChange();
    return task;
  }

  /** 建一条依赖（完成 → 开始），两端必须都是任务 */
  public createDependency(props: any = {}): any {
    const source = props.sourceId ? this.ice.findComponent(props.sourceId) : null;
    const target = props.targetId ? this.ice.findComponent(props.targetId) : null;
    if (!source || !target) {
      throw new Error('依赖两端必须是已存在的任务');
    }
    this.__captureHistory();
    const startPoint = this.__anchor(source, 'R');
    const endPoint = this.__anchor(target, 'L');
    const link = new GanttDependency({
      links: { start: { id: props.sourceId, position: 'R' }, end: { id: props.targetId, position: 'L' } },
      // 折线的构造期不会把 startPoint/endPoint 落到 points（那是 setState 的行为），
      // 所以这里直接给 points，保证首次渲染就接在两条任务条上。
      points: [startPoint, endPoint],
      startPoint,
      endPoint,
    });
    this.ice.addChild(link);
    this.selectedId = link.state.id;
    this.__emitChange();
    return link;
  }

  /** 改每日像素（时间轴缩放）：所有任务与依赖一起重排 */
  public setDayWidth(dayWidth: number): void {
    this.dayWidth = Math.max(4, Math.round(Number(dayWidth) || 0) || 28);
    this.nodes.forEach((task: any) => {
      task.setState({ dayWidth: this.dayWidth });
    });
    this.syncChrome();
    this.__emitChange();
  }

  /** 改任务（属性面板 / 应用层用）：走 setState，几何与框架自动跟着更新 */
  public updateTask(id: string, patch: any = {}): any {
    const task = this.ice.findComponent(id);
    if (!task || task.constructor.typeId !== GanttTask.typeId) {
      return null;
    }
    this.__captureHistory();
    task.applyPatch(patch);
    this.syncChrome();
    this.__emitChange();
    return task;
  }

  /**
   * **自动排程**：把每个任务推到「所有前置任务结束之后」（完成 → 开始，结束日不含当天）。
   *
   * 语义：任务占 `[start, start + days)`，因此后置任务最早在前置任务 `start + days` 那天开工。
   * 只在**推后**时生效（不提前任何任务）—— 人力排期里"提前"通常意味着别处的约束被破坏。
   * 依赖图必须先无环（有环时本方法不动，交给 `validateGantt()` 报错）。
   */
  public autoSchedule(): void {
    if (this.validateGantt().some((issue) => issue.level === 'error' && issue.message.includes('成环'))) {
      return;
    }
    const tasks = this.nodes;
    if (!tasks.length) {
      return;
    }
    this.__captureHistory();
    const byId = new Map<string, any>();
    tasks.forEach((task: any) => byId.set(task.state.id, task));
    const predecessors = new Map<string, string[]>();
    tasks.forEach((task: any) => predecessors.set(task.state.id, []));
    this.edges.forEach((edge: any) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (from && to && predecessors.has(to)) {
        predecessors.get(to)!.push(from);
      }
    });

    // 拓扑排序（Kahn），再按拓扑序推日期 —— 一轮就能收敛到最早开工日
    const indegree = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    tasks.forEach((task: any) => {
      indegree.set(task.state.id, (predecessors.get(task.state.id) || []).length);
      outgoing.set(task.state.id, []);
    });
    predecessors.forEach((list, id) => {
      list.forEach((from) => outgoing.get(from)!.push(id));
    });
    const queue = tasks
      .filter((task: any) => (indegree.get(task.state.id) || 0) === 0)
      .map((task: any) => task.state.id);
    const order: string[] = [];
    while (queue.length) {
      const id = queue.shift() as string;
      order.push(id);
      (outgoing.get(id) || []).forEach((next) => {
        indegree.set(next, (indegree.get(next) || 0) - 1);
        if ((indegree.get(next) || 0) === 0) {
          queue.push(next);
        }
      });
    }

    order.forEach((id) => {
      const task = byId.get(id);
      const earliest = (predecessors.get(id) || []).reduce((current: string, fromId: string) => {
        const from = byId.get(fromId);
        const end = addDays(from.state.start, Math.max(1, Number(from.state.days) || 1));
        return diffDays(current, end) > 0 ? end : current;
      }, task.state.start);
      if (diffDays(task.state.start, earliest) > 0) {
        task.applyPatch({ start: earliest });
      }
    });

    this.syncChrome();
    this.__emitChange();
  }

  /**
   * **关键路径**：依赖图上「时长最长」的那条链（浮时为 0 的任务）。
   *
   * 用最早/最晚开工时间算总浮时：`float = 最晚开工 - 最早开工`，浮时为 0 的任务即在关键路径上。
   * 有环时返回空数组（无关键路径可言）。
   */
  public criticalPath(): any[] {
    const tasks = this.nodes;
    if (!tasks.length) {
      return [];
    }
    const byId = new Map<string, any>();
    tasks.forEach((task: any) => byId.set(task.state.id, task));
    const predecessors = new Map<string, string[]>();
    const successors = new Map<string, string[]>();
    tasks.forEach((task: any) => {
      predecessors.set(task.state.id, []);
      successors.set(task.state.id, []);
    });
    this.edges.forEach((edge: any) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (from && to && predecessors.has(to) && predecessors.has(from)) {
        predecessors.get(to)!.push(from);
        successors.get(from)!.push(to);
      }
    });

    const durationOf = (task: any): number => Math.max(1, Number(task.state.days) || 1);
    const topo: string[] = [];
    const indegree = new Map<string, number>();
    tasks.forEach((task: any) => indegree.set(task.state.id, (predecessors.get(task.state.id) || []).length));
    const queue = tasks
      .filter((task: any) => (indegree.get(task.state.id) || 0) === 0)
      .map((task: any) => task.state.id);
    while (queue.length) {
      const id = queue.shift() as string;
      topo.push(id);
      (successors.get(id) || []).forEach((next) => {
        indegree.set(next, (indegree.get(next) || 0) - 1);
        if ((indegree.get(next) || 0) === 0) {
          queue.push(next);
        }
      });
    }
    if (topo.length !== tasks.length) {
      return []; // 有环
    }

    // 最早开工（用任务自身日期作为下界，保证与画布上看到的一致）
    const earliestStart = new Map<string, string>();
    topo.forEach((id) => {
      const task = byId.get(id);
      const earliest = (predecessors.get(id) || []).reduce((current: string, fromId: string) => {
        const from = byId.get(fromId);
        const end = addDays(earliestStart.get(fromId) as string, durationOf(from));
        return diffDays(current, end) > 0 ? end : current;
      }, task.state.start);
      earliestStart.set(id, earliest);
    });

    // 项目结束 = 所有任务的最早完工的最大值
    let projectEnd = '';
    tasks.forEach((task: any) => {
      const end = addDays(earliestStart.get(task.state.id) as string, durationOf(task));
      if (!projectEnd || diffDays(projectEnd, end) > 0) {
        projectEnd = end;
      }
    });

    // 最晚开工（逆拓扑）
    const latestStart = new Map<string, string>();
    [...topo].reverse().forEach((id) => {
      const task = byId.get(id);
      const nexts = successors.get(id) || [];
      if (!nexts.length) {
        latestStart.set(id, addDays(projectEnd, -durationOf(task)));
        return;
      }
      const latestEnd = nexts.reduce((current: string | null, nextId: string) => {
        const nextStart = latestStart.get(nextId) as string;
        return !current || diffDays(nextStart, current) > 0 ? nextStart : current;
      }, null);
      latestStart.set(id, addDays(latestEnd as string, -durationOf(task)));
    });

    return tasks.filter((task: any) => {
      const lay = latestStart.get(task.state.id) as string;
      const early = earliestStart.get(task.state.id) as string;
      return diffDays(early, lay) === 0;
    });
  }

  /** 项目起点 = 最早任务的开始日；没有任务时留空 */
  public computeOrigin(): string {
    const starts = this.nodes.map((task: any) => task.state.start).filter((value: string) => !!value);
    if (!starts.length) {
      return this.originDate || '';
    }
    // diffDays(from, to) = to - from：这里要「value 比 earliest 更早」才更新
    return starts.reduce((earliest: string, value: string) => (diffDays(earliest, value) < 0 ? value : earliest));
  }

  /** 项目区间（天数）：至少 1 天，用于刻度与画布宽度 */
  public dayCount(): number {
    const tasks = this.nodes;
    if (!tasks.length) {
      return 14;
    }
    let maxEnd = this.originDate || tasks[0].state.start;
    tasks.forEach((task: any) => {
      const end = addDays(task.state.start, Math.max(1, Number(task.state.days) || 1));
      // diffDays(from, to) = to - from → end 比 maxEnd 晚才更新
      if (diffDays(maxEnd, end) > 0) {
        maxEnd = end;
      }
    });
    return Math.max(1, diffDays(this.originDate, maxEnd) + 1);
  }

  /**
   * 重建图表框架（左列任务名 + 日期刻度 + 行线）并同步所有任务的几何。
   *
   * 模型任何变化（增删任务、改日期、改每日像素）都要走这里 —— 时间轴是**派生**的，
   * 不允许任务自己维护「我在哪一天的哪一像素上」。
   */
  public syncChrome(): void {
    if (this.__syncing) {
      return;
    }
    this.__syncing = true;
    try {
      this.originDate = this.computeOrigin();
      const tasks = this.nodes;
      if (!this.ruler) {
        this.ruler = new GanttRuler();
        this.ice.addChild(this.ruler);
      }
      // 框架垫在业务图元之下
      this.ruler.setState({ zIndex: -10000 });
      tasks.forEach((task: any, index: number) => {
        const patch: any = {
          dayWidth: this.dayWidth,
          originDate: this.originDate,
          labelColumnWidth: this.labelColumnWidth,
          rowHeight: this.rowHeight,
          headerHeight: this.headerHeight,
        };
        if (task.state.row === undefined || task.state.row === null) {
          patch.row = index;
        }
        task.setState(patch);
      });
      this.ruler.sync({
        dayWidth: this.dayWidth,
        labelColumnWidth: this.labelColumnWidth,
        headerHeight: this.headerHeight,
        rowHeight: this.rowHeight,
        originDate: this.originDate,
        dayCount: this.dayCount(),
        tasks: tasks.map((task: any) => ({ title: task.state.title, row: Number(task.state.row) || 0 })),
        totalWidth: 0,
        totalHeight: 0,
      });
      this.ice.renderer && this.ice.renderer.markQueueDirty();
    } finally {
      this.__syncing = false;
    }
  }

  /**
   * 甘特语义校验：
   * - **依赖成环**（排期不成立）；
   * - 进度越界（0..1）；
   * - 持续天数非法（<1）；
   * - 任务早于项目起点（起点是自动取最早的，因此这条主要防手工改坐标）。
   */
  public validateGantt(): GanttIssue[] {
    const issues: GanttIssue[] = [];
    const tasks = this.nodes;

    // 资源冲突：同一负责人 / 资源的任务时间重叠 → 提醒（warning，不阻断）
    const byResource = new Map<string, any[]>();
    tasks.forEach((task: any) => {
      const resource = String(task.state.resource || '').trim();
      if (!resource) {
        return;
      }
      if (!byResource.has(resource)) {
        byResource.set(resource, []);
      }
      byResource.get(resource)!.push(task);
    });
    byResource.forEach((list, resource) => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const aEnd = addDays(a.state.start, Math.max(1, Number(a.state.days) || 1));
          const bEnd = addDays(b.state.start, Math.max(1, Number(b.state.days) || 1));
          // 半开区间重叠判定：a.start < b.end 且 b.start < a.end（diffDays(from,to) = to - from）
          const overlap = diffDays(a.state.start, bEnd) > 0 && diffDays(b.state.start, aEnd) > 0;
          if (overlap) {
            issues.push({
              level: 'warning',
              message: `资源冲突：「${resource}」同时被「${a.state.title}」与「${b.state.title}」占用`,
              id: b.state.id,
            });
          }
        }
      }
    });

    tasks.forEach((task: any) => {
      const progress = Number(task.state.progress);
      if (!(progress >= 0 && progress <= 1)) {
        issues.push({ level: 'error', message: `任务「${task.state.title}」的进度必须在 0~1 之间`, id: task.state.id });
      }
      if (!(Number(task.state.days) >= 1)) {
        issues.push({ level: 'error', message: `任务「${task.state.title}」的持续天数必须 ≥ 1`, id: task.state.id });
      }
    });

    const taskIds = new Set(tasks.map((task: any) => task.state.id));
    const graph = new Map<string, string[]>();
    tasks.forEach((task: any) => graph.set(task.state.id, []));
    this.edges.forEach((edge: any) => {
      const links = edge.state.links || {};
      const from = links.start && links.start.id;
      const to = links.end && links.end.id;
      if (!from || !to || !taskIds.has(from) || !taskIds.has(to)) {
        issues.push({ level: 'error', message: '依赖两端必须都是已存在的任务', id: edge.state.id });
        return;
      }
      graph.get(from)!.push(to);
    });

    // DFS 染色找环
    const color = new Map<string, number>();
    const stack: string[] = [];
    const visit = (id: string): boolean => {
      color.set(id, 1);
      stack.push(id);
      for (const next of graph.get(id) || []) {
        const c = color.get(next) || 0;
        if (c === 1) {
          const from = stack.indexOf(next);
          const cycle = stack.slice(from >= 0 ? from : 0).concat(next);
          // 不用可选链：本包的 terser 版本解析不了 ?.（构建期直接报错）
          const names = cycle.map((cid) => {
            const found = tasks.find((task: any) => task.state.id === cid);
            return (found && found.state.title) || cid;
          });
          issues.push({ level: 'error', message: `依赖成环：${names.join(' → ')}`, id });
          color.set(id, 2);
          stack.pop();
          return true;
        }
        if (c === 0 && visit(next)) {
          color.set(id, 2);
          stack.pop();
          return true;
        }
      }
      color.set(id, 2);
      stack.pop();
      return false;
    };
    tasks.forEach((task: any) => {
      if ((color.get(task.state.id) || 0) === 0) {
        visit(task.state.id);
      }
    });

    return issues;
  }

  private __anchor(task: any, position: string): number[] {
    const box = task.getMinBoundingBox(true);
    switch (position) {
      case 'T':
        return [...box.tc];
      case 'R':
        return [...box.rc];
      case 'B':
        return [...box.bc];
      case 'L':
        return [...box.lc];
      default:
        return [...box.center];
    }
  }
}
