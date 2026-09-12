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
