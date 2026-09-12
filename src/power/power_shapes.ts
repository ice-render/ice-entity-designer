/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 电力一次系统图（单线图）符号库。
 *
 * **记法来源**（不凭印象画，逐个符号对着标准图例核过）：
 * - JB/T 5872-1991《高压开关设备电气图形及文字符号》—— 3kV 及以上高压开关设备的图形符号与文字符号，
 *   本文件里的 QF / QS / QL / QE / TA / TV / TM / FU / F / L / E 等记法都出自它；
 * - GB/T 4728 系列《电气简图用图形符号》（等同采用 IEC 60617）—— 通用图形符号体系，第 7 部分为
 *   开关、控制和保护器件；其中一条通用规则是：**开关电器的可动部分按「无激励、无外力」的正常状态绘制**。
 * - 调度编号（设备命名，《电力系统部分设备统一编号准则》SD 240-87、母线 #1M 之类）是**另一层**，
 *   属于设备命名而不是图形记法，本包用 `tag`（图形符号旁的文字符号）与之并存。
 *
 * **外观统一**：所有符号共用同一套描边色 / 线宽 / 文字符号字号与位置、统一端子在上下（T/B），
 * 尺寸也按同一套基准走（见 `POWER_STYLE` 与各 preset 的 width/height）。
 */
import { ICECircle, ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';
import { POWER_NEUTRAL_COLOR, voltageColorOf } from './power_voltage';

export const POWER_SYMBOL_KINDS = [
  'busbar',
  'breaker',
  'disconnector',
  'loadSwitch',
  'earthingSwitch',
  'earth',
  'currentTransformer',
  'voltageTransformer',
  'transformer',
  'fuse',
  'arrester',
  'reactor',
  'generator',
  'motor',
  'load',
] as const;

export type PowerSymbolKind = (typeof POWER_SYMBOL_KINDS)[number];

type PowerSymbolPreset = {
  /** 中文名（属性面板 / 图例用） */
  label: string;
  /** 图形符号旁的文字符号（JB/T 5872 / GB/T 7159 口径） */
  tag: string;
  width: number;
  height: number;
  /** 是否串联在导线上（母线/接地这类不串联的例外） */
  inline: boolean;
};

/** 文字符号取自 JB/T 5872-1991 的「图形符号 + 文字符号」对照表 */
export const POWER_SYMBOL_PRESETS: Record<PowerSymbolKind, PowerSymbolPreset> = {
  busbar: { label: '母线', tag: 'W', width: 260, height: 10, inline: false },
  breaker: { label: '断路器', tag: 'QF', width: 44, height: 52, inline: true },
  disconnector: { label: '隔离开关', tag: 'QS', width: 44, height: 52, inline: true },
  loadSwitch: { label: '负荷开关', tag: 'QL', width: 44, height: 52, inline: true },
  earthingSwitch: { label: '接地开关', tag: 'QE', width: 44, height: 60, inline: true },
  earth: { label: '接地', tag: 'E', width: 40, height: 34, inline: false },
  currentTransformer: { label: '电流互感器', tag: 'TA', width: 44, height: 52, inline: true },
  voltageTransformer: { label: '电压互感器', tag: 'TV', width: 48, height: 70, inline: true },
  transformer: { label: '变压器', tag: 'TM', width: 52, height: 76, inline: true },
  fuse: { label: '熔断器', tag: 'FU', width: 40, height: 56, inline: true },
  arrester: { label: '避雷器', tag: 'F', width: 40, height: 62, inline: false },
  reactor: { label: '电抗器', tag: 'L', width: 44, height: 56, inline: true },
  generator: { label: '发电机', tag: 'G', width: 52, height: 52, inline: false },
  motor: { label: '电动机', tag: 'M', width: 52, height: 52, inline: false },
  load: { label: '负荷 / 出线', tag: '-', width: 40, height: 40, inline: false },
};

/** 全局外观基准：所有符号共用，保证「一张图上不花」 */
export const POWER_STYLE = {
  /** 符号描边色（近黑的石板色，不用纯黑，缩放/打印都不刺眼） */
  strokeStyle: '#1f2937',
  /** 引线（导线）与符号本体同一线宽 */
  lineWidth: 1.6,
  /** 接地/母线这类「加粗」元素用更粗的线 */
  heavyLineWidth: 3,
  /** 文字符号（QF/QS…）的字号与颜色 */
  tagFontSize: 10,
  tagColor: '#475569',
  /** 圆内字母（G / M）的字号 */
  letterFontSize: 15,
  /** 明确不带电时的颜色（只有算过拓扑 `energized: false` 才会用到） */
  deEnergizedColor: '#94a3b8',
  /** 设备名 / 编号标注的字号与颜色 */
  nameFontSize: 11,
  nameColor: '#334155',
  /** 开关状态标签（合 / 分）的字号 */
  stateFontSize: 10,
};

/** 有分 / 合状态的开关电器（其余是静止设备） */
export const POWER_SWITCH_KINDS: PowerSymbolKind[] = ['breaker', 'disconnector', 'loadSwitch', 'earthingSwitch'];

export type PowerSwitchState = 'open' | 'closed';

/** 采样半圆弧，返回折线点（不依赖 Path2D.arc，Node / 小程序一致） */
function arcPoints(cx: number, cy: number, radius: number, startDeg: number, endDeg: number, steps = 16): number[][] {
  const points: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((startDeg + ((endDeg - startDeg) * i) / steps) * Math.PI) / 180;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/**
 * @class PowerSymbol 电力一次系统图的图元（复合组件）
 *
 * 与其它域包同一套做法：内部形状按 `kind` 派生（`hasDerivedChildren() === true`），不进文档、载入时重建。
 * 每个派生部件都带一个稳定的 `role`（`blade` / `arcMark` / `earth` …），测试与属性面板按 role 认部件，
 * **不用位置去猜**。
 */
export default class PowerSymbol extends ICEGroup {
  public static readonly typeId = 'PowerSymbol';

  /** 派生部件：`{ role, component }` 列表（按添加顺序） */
  public parts: Array<{ role: string; component: any }> = [];

  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    super(PowerSymbol.arrangeParam(props));
    this.syncShape();
  }

  protected static arrangeParam(props: any = {}) {
    const kind: PowerSymbolKind = (props.kind || 'breaker') as PowerSymbolKind;
    const preset = POWER_SYMBOL_PRESETS[kind] || POWER_SYMBOL_PRESETS.breaker;
    return merge(
      {
        kind,
        tag: preset.tag,
        // 自身不画：轮廓一律由派生形状绘制（否则每个符号外面都会多一个方框）
        fill: false,
        stroke: false,
        width: preset.width,
        height: preset.height,
        style: { strokeStyle: POWER_STYLE.strokeStyle, lineWidth: POWER_STYLE.lineWidth },
        tagStyle: { fontSize: POWER_STYLE.tagFontSize, textColor: POWER_STYLE.tagColor },
        /** 设备名 / 调度编号（画在符号上方） */
        name: '',
        /** 电压等级（'110kV' 之类）—— 决定色标 */
        voltageLevel: '',
        /** 色标表覆盖（公司规范不同） */
        voltageColors: null,
        /** 开关状态：默认按标准的「无激励」正常状态（分位） */
        switchState: 'open' as PowerSwitchState,
        /** 带电状态：undefined = 未计算（静态图纸）；false = 明确不带电 */
        energized: undefined as boolean | undefined,
        /** 电源点（发电机 / 进线 / 主变电源侧）—— 拓扑从这里开始推 */
        energizedSource: false,
      },
      props
    );
  }

  private static readonly __shapeKeys = [
    'kind',
    'tag',
    'width',
    'height',
    'style',
    'tagStyle',
    'name',
    'voltageLevel',
    'voltageColors',
    'switchState',
    'energized',
  ];

  public setState(patch: any): void {
    const needsSync =
      !!patch && PowerSymbol.__shapeKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsSync) {
      this.syncShape();
    }
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /** 取某个角色的派生部件（测试/属性面板用） */
  public part(role: string): any {
    const hit = this.parts.find((item) => item.role === role);
    return hit ? hit.component : null;
  }

  /** 按 `kind` 重建内部形状与文字符号 */
  protected syncShape(): void {
    this.__clearParts();
    const kind: PowerSymbolKind = (this.state.kind || 'breaker') as PowerSymbolKind;
    const preset = POWER_SYMBOL_PRESETS[kind] || POWER_SYMBOL_PRESETS.breaker;
    const w = this.state.width || preset.width;
    const h = this.state.height || preset.height;
    const lw = (this.state.style && this.state.style.lineWidth) || POWER_STYLE.lineWidth;
    /**
     * 颜色优先级：**明确不带电 → 灰**；否则按电压等级色标；没标等级用中性描边色。
     * 静态图纸（没算拓扑）与 SCADA 画面（算过拓扑）因此共用一套代码，差别只在 `energized` 有没有被赋值。
     */
    const baseStroke = (this.state.style && this.state.style.strokeStyle) || POWER_STYLE.strokeStyle;
    const strokeStyle =
      this.state.energized === false
        ? POWER_STYLE.deEnergizedColor
        : this.state.voltageLevel
        ? voltageColorOf(this.state.voltageLevel, this.state.voltageColors || undefined)
        : baseStroke || POWER_NEUTRAL_COLOR;
    const cx = w / 2;
    const baseZ = this.state.zIndex || 0;
    const isSwitch = POWER_SWITCH_KINDS.indexOf(kind) !== -1;
    const closed = this.state.switchState === 'closed';

    const line = (role: string, points: number[][], width = lw): any =>
      this.__add(
        role,
        new ICEPolyLine({
          zIndex: baseZ + 2,
          points,
          interactive: false,
          style: { strokeStyle, fillStyle: strokeStyle, lineWidth: width },
        })
      );
    const rect = (role: string, left: number, top: number, width: number, height: number, filled = false): any =>
      this.__add(
        role,
        new ICERect({
          zIndex: baseZ + 2,
          left,
          top,
          width,
          height,
          stroke: true,
          interactive: false,
          // 空心元件用白色填充（不能用 'none'：引擎按 canvas 颜色解析，非法值会退回上一次的填充色）
          style: { fillStyle: filled ? strokeStyle : '#ffffff', strokeStyle, lineWidth: lw },
        })
      );
    const circle = (role: string, left: number, top: number, radius: number): any =>
      this.__add(
        role,
        new ICECircle({
          zIndex: baseZ + 2,
          left,
          top,
          radius,
          stroke: true,
          interactive: false,
          style: { fillStyle: '#ffffff', strokeStyle, lineWidth: lw },
        })
      );
    const text = (
      role: string,
      value: string,
      left: number,
      top: number,
      width: number,
      height: number,
      size: number
    ): any =>
      this.__add(
        role,
        new ICEText({
          zIndex: baseZ + 3,
          left,
          top,
          width,
          height,
          text: value,
          stroke: false,
          interactive: false,
          style: {
            fontSize: size,
            fillStyle: strokeStyle,
            textAlign: 'center',
            textBaseline: 'middle',
          },
        })
      );

    // ---- 各符号的记法（对照 JB/T 5872-1991 图例逐条实现）----
    switch (kind) {
      case 'busbar': {
        // 母线：加粗实线（GB/T 4728 里「导线/母线」的通用符号，母线画粗）
        rect('busbar', 0, h / 2 - POWER_STYLE.heavyLineWidth / 2, w, POWER_STYLE.heavyLineWidth, true);
        break;
      }
      case 'breaker': {
        // 断路器 QF：上端引线 + 灭弧叉（×）+ 斜刀臂 + 下端引线
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.22],
        ]);
        line('arcMark', [
          [cx - 7, h * 0.22 - 7],
          [cx + 7, h * 0.22 + 7],
        ]);
        line('arcMark', [
          [cx + 7, h * 0.22 - 7],
          [cx - 7, h * 0.22 + 7],
        ]);
        line('blade', [
          [cx, h * 0.22],
          [cx - 9, h * 0.78],
        ]);
        line('leadBottom', [
          [cx, h * 0.78],
          [cx, h],
        ]);
        break;
      }
      case 'disconnector': {
        // 隔离开关 QS：上端引线 + 静触头横杠（T 形断口）+ 斜刀臂 + 下端引线（无灭弧叉）
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.22],
        ]);
        line('contactBar', [
          [cx - 9, h * 0.22],
          [cx + 9, h * 0.22],
        ]);
        line('blade', [
          [cx, h * 0.22],
          [cx - 9, h * 0.78],
        ]);
        line('leadBottom', [
          [cx, h * 0.78],
          [cx, h],
        ]);
        break;
      }
      case 'loadSwitch': {
        // 负荷开关 QL：隔离开关的记法 + 顶端小圆（JB/T 5872 图例里顶部是空心小圆）
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.16],
        ]);
        this.__add(
          'contactCircle',
          new ICECircle({
            zIndex: baseZ + 2,
            left: cx,
            top: h * 0.22,
            radius: 5,
            stroke: true,
            interactive: false,
            style: { fillStyle: '#ffffff', strokeStyle, lineWidth: lw },
          })
        );
        line('blade', [
          [cx, h * 0.27],
          [cx - 9, h * 0.78],
        ]);
        line('leadBottom', [
          [cx, h * 0.78],
          [cx, h],
        ]);
        break;
      }
      case 'earthingSwitch': {
        // 接地开关 QE：开关（斜刀臂 + 顶端断口）+ 接地符号
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.18],
        ]);
        line('blade', [
          [cx, h * 0.18],
          [cx - 9, h * 0.5],
        ]);
        line('leadBottom', [
          [cx, h * 0.5],
          [cx, h * 0.62],
        ]);
        this.__earth(cx, h * 0.62, 14, strokeStyle, lw);
        break;
      }
      case 'earth': {
        // 接地一般符号 E：竖线 + 三条递减横线
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.45],
        ]);
        this.__earth(cx, h * 0.45, 16, strokeStyle, lw);
        break;
      }
      case 'currentTransformer': {
        // 电流互感器 TA：导线穿过一个圆 + 圆右侧的电流方向折线（JB/T 5872 图例）
        line('leadTop', [
          [cx, 0],
          [cx, h],
        ]);
        circle('winding', cx - 11, h / 2 - 11, 11);
        line('polarityMark', [
          [cx + 9, h / 2 - 4],
          [cx + 16, h / 2 - 11],
          [cx + 16, h / 2 + 4],
        ]);
        break;
      }
      case 'voltageTransformer': {
        // 电压互感器 TV：两个上下相扣的圆（一次 / 二次绕组）
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.16],
        ]);
        circle('windingPrimary', cx - 11, h * 0.16, 11);
        circle('windingSecondary', cx - 11, h * 0.16 + 16, 11);
        line('leadBottom', [
          [cx, h * 0.16 + 32],
          [cx, h],
        ]);
        break;
      }
      case 'transformer': {
        // 变压器 TM：两个相扣圆 + 圈内绕组联结标记（上 △、下 Y，星-三角联结）
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.16],
        ]);
        circle('windingPrimary', cx - 12, h * 0.16, 12);
        circle('windingSecondary', cx - 12, h * 0.16 + 18, 12);
        line('leadBottom', [
          [cx, h * 0.16 + 36],
          [cx, h],
        ]);
        text('windingMarkHigh', '△', cx - 12, h * 0.16, 24, 24, 11);
        text('windingMarkLow', 'Y', cx - 12, h * 0.16 + 18, 24, 24, 11);
        break;
      }
      case 'fuse': {
        // 熔断器 FU：细长矩形套在导线上
        line('leadTop', [
          [cx, 0],
          [cx, h],
        ]);
        rect('fuseBody', cx - 6, h * 0.2, 12, h * 0.6);
        break;
      }
      case 'arrester': {
        // 避雷器 F：矩形 + 内部放电箭头 + 上下引线
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.2],
        ]);
        rect('arresterBody', cx - 9, h * 0.2, 18, h * 0.6);
        line('dischargeArrow', [
          [cx, h * 0.3],
          [cx, h * 0.66],
        ]);
        line('dischargeArrowHead', [
          [cx - 5, h * 0.56],
          [cx, h * 0.66],
          [cx + 5, h * 0.56],
        ]);
        line('leadBottom', [
          [cx, h * 0.8],
          [cx, h],
        ]);
        break;
      }
      case 'reactor': {
        // 电抗器 L：线圈（半圆）+ 引线
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.2],
        ]);
        line('coil', arcPoints(cx, h * 0.2 + 10, 10, 0, 180));
        line('coil', arcPoints(cx, h * 0.2 + 30, 10, 0, 180));
        line('leadBottom', [
          [cx, h * 0.2 + 40],
          [cx, h],
        ]);
        break;
      }
      case 'generator': {
        // 发电机 G：圆 + 圆内字母 G
        circle('body', cx - w / 2 + 2, h / 2 - Math.min(w, h) / 2 + 2, Math.min(w, h) / 2 - 2);
        text('letter', 'G', 0, h / 2 - 26, w, 52, POWER_STYLE.letterFontSize);
        break;
      }
      case 'motor': {
        // 电动机 M：圆 + 圆内字母 M
        circle('body', cx - w / 2 + 2, h / 2 - Math.min(w, h) / 2 + 2, Math.min(w, h) / 2 - 2);
        text('letter', 'M', 0, h / 2 - 26, w, 52, POWER_STYLE.letterFontSize);
        break;
      }
      case 'load': {
        // 负荷 / 出线：向下箭头（GB/T 4728 的「电能输出」记法）
        line('leadTop', [
          [cx, 0],
          [cx, h * 0.6],
        ]);
        line('arrowHead', [
          [cx - 7, h * 0.5],
          [cx, h * 0.66],
          [cx + 7, h * 0.5],
        ]);
        break;
      }
      default:
        break;
    }

    // 文字符号：统一放在符号右下角外沿（不遮挡记法）
    const tag = this.state.tag;
    if (tag) {
      this.__add(
        'tag',
        new ICEText({
          zIndex: baseZ + 4,
          left: w + 4,
          top: h / 2 - 8,
          width: 44,
          height: 16,
          text: String(tag),
          stroke: false,
          interactive: false,
          style: {
            fontSize: (this.state.tagStyle && this.state.tagStyle.fontSize) || POWER_STYLE.tagFontSize,
            fillStyle: (this.state.tagStyle && this.state.tagStyle.textColor) || POWER_STYLE.tagColor,
            textAlign: 'left',
            textBaseline: 'middle',
          },
        })
      );
    }
    // 设备名 / 调度编号：统一放在符号上方（居中于符号）
    if (this.state.name) {
      this.__add(
        'nameLabel',
        new ICEText({
          zIndex: baseZ + 4,
          left: 0,
          top: -20,
          width: Math.max(w, 64),
          height: 16,
          text: String(this.state.name),
          stroke: false,
          interactive: false,
          style: {
            fontSize: POWER_STYLE.nameFontSize,
            fillStyle: POWER_STYLE.nameColor,
            textAlign: 'center',
            textBaseline: 'middle',
          },
        })
      );
    }

    // 开关状态标签（合 / 分）：放在符号左侧，颜色跟符号走
    if (isSwitch) {
      this.__add(
        'stateBadge',
        new ICEText({
          zIndex: baseZ + 4,
          left: -24,
          top: h / 2 - 8,
          width: 20,
          height: 16,
          text: closed ? '合' : '分',
          stroke: false,
          interactive: false,
          style: {
            fontSize: POWER_STYLE.stateFontSize,
            fillStyle: strokeStyle,
            textAlign: 'center',
            textBaseline: 'middle',
          },
        })
      );
    }
  }

  /** 接地符号：三条递减横线 */
  private __earth(cx: number, top: number, halfWidth: number, strokeStyle: string, lineWidth: number): void {
    const gap = 6;
    const widths = [halfWidth, halfWidth * 0.62, halfWidth * 0.28];
    widths.forEach((half, index) => {
      this.__add(
        'earth',
        new ICEPolyLine({
          zIndex: (this.state.zIndex || 0) + 2,
          points: [
            [cx - half, top + index * gap],
            [cx + half, top + index * gap],
          ],
          interactive: false,
          style: { strokeStyle, fillStyle: strokeStyle, lineWidth },
        })
      );
    });
  }

  private __add(role: string, component: any): any {
    this.parts.push({ role, component });
    this.addChild(component);
    return component;
  }

  private __clearParts(): void {
    // 先拷贝再删：removeChildren 内部会 splice 原数组
    this.removeChildren([...this.childNodes]);
    this.parts = [];
  }
}
