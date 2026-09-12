/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';
import { addDays, diffDays } from './gantt_date';

/**
 * @class GanttTask 甘特图的一条任务（= 时间轴上的那个条）
 *
 * 复合组件（`hasDerivedChildren`）：条、进度覆盖、文字都由 state 派生。
 *
 * **拖拽吸附**是排期语义的核心：`setPosition()` 会把 x 吸附到「整天」的格子上，
 * 并据此反推起始日期 —— 拖动不会产生「3 月 5 日的 13:47 开工」这种排期。
 */
export default class GanttTask extends ICEGroup {
  public static readonly typeId = 'GanttTask';

  protected barComponent: ICERect | null = null;
  protected progressComponent: ICERect | null = null;
  protected labelComponent: ICEText | null = null;

  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    super(GanttTask.arrangeParam(props));
    this.syncBar();
  }

  protected static arrangeParam(props: any = {}) {
    return merge(
      {
        title: '任务',
        /** 起始日期 `YYYY-MM-DD` */
        start: '2026-01-01',
        /** 持续天数（≥1） */
        days: 3,
        /** 完成度 0..1 */
        progress: 0,
        /** 行号（0 起） */
        row: 0,
        /** 每天多少像素（由设计器统一给定） */
        dayWidth: 28,
        /** 项目起点日期（由设计器统一给定；x = (start - origin) × dayWidth） */
        originDate: '2026-01-01',
        /** 左列（任务名）宽度 */
        labelColumnWidth: 140,
        /** 行高 */
        rowHeight: 36,
        /** 时间轴顶部留出的标尺高度 */
        headerHeight: 34,
        style: {
          barFill: '#3b82f6',
          progressFill: '#1d4ed8',
          strokeStyle: '#1e3a8a',
          lineWidth: 1,
        },
        labelStyle: { textColor: '#ffffff', fontSize: 12 },
        transformable: false,
      },
      props
    );
  }

  private static readonly __shapeKeys = [
    'title',
    'start',
    'days',
    'progress',
    'row',
    'dayWidth',
    'originDate',
    'labelColumnWidth',
    'rowHeight',
    'headerHeight',
    'style',
    'labelStyle',
  ];

  public setState(patch: any): void {
    const needsSync = !!patch && GanttTask.__shapeKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsSync) {
      this.syncGeometry();
      this.syncBar();
      // 日期/天宽变化也是「移动」：必须派发 AFTER_MOVE，挂在本任务上的依赖线才能重路由
      // （引擎的连线跟随就是订阅宿主的 AFTER_MOVE / AFTER_RESIZE / AFTER_ROTATE）。
      this.trigger('AFTER_MOVE', { left: this.state.left, top: this.state.top, target: this });
    }
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /**
   * @overwrite
   * 拖拽吸附：x 吸附到整天网格并反推起始日期（y 吸附到行网格）。
   */
  public setPosition(left: number, top: number, evt: any = null): void {
    const dayWidth = this.state.dayWidth || 28;
    const labelColumnWidth = this.state.labelColumnWidth || 0;
    const rowHeight = this.state.rowHeight || 36;
    const headerHeight = this.state.headerHeight || 34;
    const dayIndex = Math.max(0, Math.round((left - labelColumnWidth) / dayWidth));
    const row = Math.max(0, Math.round((top - headerHeight) / rowHeight));
    this.state.start = addDays(this.state.originDate, dayIndex);
    this.state.row = row;
    // 注意：这里改的是 state 而不是再触发一轮 setState（避免递归），随后用吸附后的坐标落位
    super.setState({ start: this.state.start, row });
    super.setPosition(labelColumnWidth + dayIndex * dayWidth, headerHeight + row * rowHeight, evt || undefined);
    this.syncBar();
  }

  /** 时间轴上的左边缘（= state.left，设计器负责由日期算出它） */
  public barLeft(): number {
    return this.state.left;
  }

  /** 进度覆盖条宽度 */
  public progressWidth(): number {
    return Math.max(0, Math.min(1, Number(this.state.progress) || 0)) * this.state.width;
  }

  /** 由 start/days 反推几何（日期改了、或设计器换了 dayWidth/origin 时调用） */
  public syncGeometry(): void {
    const dayWidth = this.state.dayWidth || 28;
    const days = Math.max(1, Number(this.state.days) || 1);
    this.state.width = days * dayWidth;
    this.state.height = Math.max(18, (this.state.rowHeight || 36) - 14);
    this.state.left = (this.state.labelColumnWidth || 0) + diffDays(this.state.originDate, this.state.start) * dayWidth;
    this.state.top = (this.state.headerHeight || 34) + (Number(this.state.row) || 0) * (this.state.rowHeight || 36) + 7;
  }

  protected syncBar(): void {
    this.__clearDerivedChildren();
    const baseZ = this.state.zIndex || 0;
    const width = this.state.width;
    const height = this.state.height;
    const style = this.state.style;

    this.barComponent = new ICERect({
      zIndex: baseZ + 1,
      left: 0,
      top: 0,
      width,
      height,
      radius: Math.min(6, height / 2),
      stroke: true,
      interactive: false,
      style: { fillStyle: style.barFill, strokeStyle: style.strokeStyle, lineWidth: style.lineWidth },
    });
    this.addChild(this.barComponent);

    const progress = Math.max(0, Math.min(1, Number(this.state.progress) || 0));
    if (progress > 0) {
      this.progressComponent = new ICERect({
        zIndex: baseZ + 2,
        left: 0,
        top: 0,
        width: this.progressWidth(),
        height,
        radius: Math.min(6, height / 2),
        stroke: false,
        interactive: false,
        style: { fillStyle: style.progressFill },
      });
      this.addChild(this.progressComponent);
    }

    const percent = Math.round(progress * 100);
    this.labelComponent = new ICEText({
      zIndex: baseZ + 3,
      left: 0,
      top: 0,
      width,
      height,
      text: `${this.state.title}（${Math.max(1, Number(this.state.days) || 1)} 天）${
        percent > 0 ? ` · ${percent}%` : ''
      }`,
      stroke: false,
      interactive: false,
      style: {
        fontSize: this.state.labelStyle.fontSize,
        fillStyle: this.state.labelStyle.textColor,
        // 左对齐 + 内缩：短条上文字会自然向右溢出（仍可读），比居中裁掉两头好
        textAlign: 'left',
        textBaseline: 'middle',
        paddingLeft: 8,
      },
    });
    this.addChild(this.labelComponent);
  }

  private __clearDerivedChildren(): void {
    [this.barComponent, this.progressComponent, this.labelComponent].forEach((component) => {
      if (component) {
        this.removeChild(component);
      }
    });
    this.barComponent = null;
    this.progressComponent = null;
    this.labelComponent = null;
  }
}
