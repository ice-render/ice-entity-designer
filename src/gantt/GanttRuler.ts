/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import { tickLabel } from './gantt_date';

export type GanttRulerOptions = {
  dayWidth: number;
  labelColumnWidth: number;
  headerHeight: number;
  rowHeight: number;
  originDate: string;
  dayCount: number;
  tasks: Array<{ title: string; row: number }>;
  totalWidth: number;
  totalHeight: number;
};

/**
 * @class GanttRuler 甘特的「图表框架」：左列任务名 + 日期刻度 + 行分隔线
 *
 * 它是**派生装饰**（由设计器按任务模型重建），不是业务图元 —— 因此：
 * - 不进 `designer.nodes`（类型过滤按 typeId 认 GanttTask）；
 * - 但仍然进文档与导出（它是画布内容的一部分，和任务条一起被截图/导出 SVG）。
 *
 * 时间轴刻度是「一次性画完」的：40 天以内每天一个刻度，超过就按周一/每月聚合，
 * 避免长排期把画布画满文字（这也是甘特工具通行做法）。
 */
export default class GanttRuler extends ICEGroup {
  public static readonly typeId = 'ice-entity-designer:GanttRuler';

  constructor() {
    super({ left: 0, top: 0, width: 0, height: 0, fill: false, stroke: false, interactive: false, draggable: false });
  }

  public hasDerivedChildren(): boolean {
    return true;
  }

  /** 按当前任务模型重建框架 */
  public sync(options: GanttRulerOptions): void {
    // 先拷贝再删：removeChildren 内部会 splice 原数组，直接传 this.childNodes 会漏删（残留旧刻度）
    this.removeChildren([...this.childNodes]);
    const { dayWidth, labelColumnWidth, headerHeight, rowHeight, originDate, dayCount, tasks } = options;
    const chartWidth = labelColumnWidth + dayCount * dayWidth;
    this.state.width = chartWidth;
    this.state.height = headerHeight + tasks.length * rowHeight;
    const baseZ = this.state.zIndex || 0;

    // 左列底色 + 表头底色
    this.addChild(
      new ICERect({
        zIndex: baseZ + 1,
        left: 0,
        top: 0,
        width: chartWidth,
        height: this.state.height,
        stroke: false,
        interactive: false,
        style: { fillStyle: '#ffffff' },
      })
    );
    this.addChild(
      new ICERect({
        zIndex: baseZ + 2,
        left: 0,
        top: 0,
        width: labelColumnWidth,
        height: this.state.height,
        stroke: false,
        interactive: false,
        style: { fillStyle: '#f8fafc' },
      })
    );
    this.addChild(
      new ICERect({
        zIndex: baseZ + 2,
        left: 0,
        top: 0,
        width: chartWidth,
        height: headerHeight,
        stroke: false,
        interactive: false,
        style: { fillStyle: '#f1f5f9' },
      })
    );

    // 表头：左列标题 + 日期刻度
    this.addChild(this.__text('任务', 0, 0, labelColumnWidth, headerHeight, '#0f172a', 13, 'center', baseZ + 3));
    // 没有任务（originDate 为空）时不画刻度，否则会算出 NaN-NaN-NaN
    if (!originDate) {
      return;
    }
    // 周末底色：排期是要按天读的，休息日必须一眼看出来（放在网格线之下、日期刻度之上）
    for (let i = 0; i < dayCount; i++) {
      const weekday = new Date(Date.parse(`${this.__addDays(originDate, i)}T00:00:00Z`)).getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        continue;
      }
      this.addChild(
        new ICERect({
          zIndex: baseZ + 1,
          left: labelColumnWidth + i * dayWidth,
          top: headerHeight,
          width: dayWidth,
          height: Math.max(this.state.height - headerHeight, 0),
          stroke: false,
          interactive: false,
          style: { fillStyle: '#f1f5f9' },
        })
      );
    }
    const dayList: string[] = [];
    for (let i = 0; i < dayCount; i++) {
      dayList.push(tickLabel(this.__addDays(originDate, i)));
    }
    const dense = dayCount <= 40;
    dayList.forEach((label, index) => {
      const iso = this.__addDays(originDate, index);
      const isWeekStart = new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay() === 1;
      const isMonthStart = iso.endsWith('-01');
      const showText = dense || isWeekStart || isMonthStart;
      const left = labelColumnWidth + index * dayWidth;
      // 每日一条细线；周/月首加粗，便于读
      this.addChild(
        new ICEPolyLine({
          zIndex: baseZ + 2,
          points: [
            [left, headerHeight],
            [left, this.state.height],
          ],
          interactive: false,
          style: {
            strokeStyle: isMonthStart ? '#cbd5e1' : isWeekStart ? '#e2e8f0' : '#f1f5f9',
            fillStyle: '#e2e8f0',
            lineWidth: 1,
          },
        })
      );
      if (showText) {
        this.addChild(this.__text(label, left, 0, dayWidth, headerHeight, '#64748b', 11, 'center', baseZ + 3));
      }
    });

    // 左列任务名 + 行分隔线
    tasks.forEach((task, row) => {
      const top = headerHeight + row * rowHeight;
      this.addChild(this.__text(task.title, 0, top, labelColumnWidth, rowHeight, '#334155', 13, 'left', baseZ + 3, 12));
      this.addChild(
        new ICEPolyLine({
          zIndex: baseZ + 2,
          points: [
            [0, top + rowHeight],
            [chartWidth, top + rowHeight],
          ],
          interactive: false,
          style: { strokeStyle: '#e2e8f0', fillStyle: '#e2e8f0', lineWidth: 1 },
        })
      );
    });

    // 表头与内容区的分隔线（横向）
    this.addChild(
      new ICEPolyLine({
        zIndex: baseZ + 3,
        points: [
          [0, headerHeight],
          [chartWidth, headerHeight],
        ],
        interactive: false,
        style: { strokeStyle: '#cbd5e1', fillStyle: '#cbd5e1', lineWidth: 1 },
      })
    );

    // 左列与时间轴的分隔线（竖）
    this.addChild(
      new ICEPolyLine({
        zIndex: baseZ + 3,
        points: [
          [labelColumnWidth, 0],
          [labelColumnWidth, this.state.height],
        ],
        interactive: false,
        style: { strokeStyle: '#cbd5e1', fillStyle: '#cbd5e1', lineWidth: 1 },
      })
    );
  }

  /** 只给日期字符串加天数（保持与 gantt_date 同一套 UTC 口径） */
  private __addDays(iso: string, days: number): string {
    const timestamp = Date.parse(`${iso}T00:00:00Z`);
    const date = new Date(timestamp + days * 24 * 60 * 60 * 1000);
    const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  private __text(
    text: string,
    left: number,
    top: number,
    width: number,
    height: number,
    color: string,
    fontSize: number,
    align: 'left' | 'center',
    zIndex: number,
    paddingLeft = 0
  ): ICEText {
    return new ICEText({
      zIndex,
      left,
      top,
      width,
      height,
      text,
      stroke: false,
      interactive: false,
      style: {
        fontSize,
        fillStyle: color,
        textAlign: align,
        textBaseline: 'middle',
        paddingLeft,
      },
    });
  }
}
