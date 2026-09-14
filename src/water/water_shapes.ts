/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 给水排水工艺流程图（水厂 / 污水厂）符号库。
 *
 * **记法依据**：
 * - GB/T 50106《建筑给水排水制图标准》—— 管道、阀门、仪表等通用图例（第 3 章「图例」）；
 * - 工艺单元（格栅、沉砂池、初沉池、生物池、二沉池、浓缩池、脱水机…）按工艺专业通行画法自绘，
 *   本包只用**构成要素**表达可辨识特征（例如格栅＝矩形＋斜栅条、曝气池＝矩形＋曝气盘排列）。
 * - 文字：给排水图纸以「设备名称 + 位号」为主，不像电力有 QF/QS 那样的强制性文字符号体系。
 *   本包给每个 kind 一个**行业习惯代号**（P/B/V/FIT/AIT…）作默认值，可自由覆盖。
 *
 * **外观统一**（与其它域包同一条铁律）：全部符号共用一套描边色、线宽、字号与基准尺寸，
 * 并且**不可变换**（只能拖动）—— 符号的比例与朝向是记法的一部分。
 * 配色约定：**蓝色系＝水线单元，黄色系＝污泥线单元**，全图一眼能分清水与泥。
 */
import { ICECircle, ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';

export const WATER_SYMBOL_KINDS = [
  // ---- 处理单元（水线）----
  'barScreen',
  'gritChamber',
  'primaryClarifier',
  'anaerobicTank',
  'anoxicTank',
  'aerobicTank',
  'secondaryClarifier',
  'coagulationTank',
  'filterBed',
  'disinfectionTank',
  // ---- 处理单元（污泥线）----
  'sludgeThickener',
  'dewateringMachine',
  // ---- 设备与仪表 ----
  'pump',
  'blower',
  'dosingUnit',
  'valve',
  'flowMeter',
  'analyzer',
  // ---- 边界 ----
  'inlet',
  'outlet',
  'sludgeOut',
] as const;

export type WaterSymbolKind = (typeof WATER_SYMBOL_KINDS)[number];

/** 处理单元：参与工艺链、需要进出管线 */
export const WATER_UNIT_KINDS: WaterSymbolKind[] = [
  'barScreen',
  'gritChamber',
  'primaryClarifier',
  'anaerobicTank',
  'anoxicTank',
  'aerobicTank',
  'secondaryClarifier',
  'coagulationTank',
  'filterBed',
  'disinfectionTank',
  'sludgeThickener',
  'dewateringMachine',
];

/** 设备与仪表：只参与连接，不要求"进出各一条" */
export const WATER_EQUIPMENT_KINDS: WaterSymbolKind[] = [
  'pump',
  'blower',
  'dosingUnit',
  'valve',
  'flowMeter',
  'analyzer',
];

/** 边界符号：进水 / 出水 / 污泥外运 */
export const WATER_BOUNDARY_KINDS: WaterSymbolKind[] = ['inlet', 'outlet', 'sludgeOut'];

/** 会产出剩余污泥的单元（校验「污泥有没有出路」用） */
export const WATER_SLUDGE_SOURCE_KINDS: WaterSymbolKind[] = ['primaryClarifier', 'secondaryClarifier'];

export type WaterMedium = 'sewage' | 'sludge' | 'returnSludge' | 'recycle' | 'air' | 'chemical' | 'effluent';

/**
 * 介质样式：**颜色与线型区分介质**，是给排水图纸的通行做法（具体色值各院略有差异，可覆盖）。
 * - 污水 / 出水 / 回流：实线，颜色区分；
 * - 剩余污泥 / 回流污泥：两个色阶的棕黄（一条是排泥、一条是回流，专业上是两回事）；
 * - 空气 / 药剂：虚线（不是水流）。
 */
export const WATER_MEDIUM_STYLES: Record<WaterMedium, { label: string; color: string; lineType: 'solid' | 'dashed' }> =
  {
    sewage: { label: '污水', color: '#475569', lineType: 'solid' },
    effluent: { label: '出水', color: '#0d9488', lineType: 'solid' },
    recycle: { label: '混合液回流', color: '#0369a1', lineType: 'solid' },
    returnSludge: { label: '回流污泥', color: '#a16207', lineType: 'solid' },
    sludge: { label: '剩余污泥', color: '#92400e', lineType: 'solid' },
    air: { label: '空气', color: '#0891b2', lineType: 'dashed' },
    chemical: { label: '药剂', color: '#7c3aed', lineType: 'dashed' },
  };

export type WaterSymbolPreset = {
  label: string;
  /** 行业习惯代号（可覆盖；给排水不像电力有强制文字符号体系） */
  tag: string;
  width: number;
  height: number;
  /** 画法分组：矩形单元 / 圆形单元 / 小设备 / 边界 */
  shape: 'tank' | 'round' | 'device' | 'boundary';
  /** 是否串联在管线上（阀门、流量计这类） */
  inline: boolean;
};

export const WATER_SYMBOL_PRESETS: Record<WaterSymbolKind, WaterSymbolPreset> = {
  barScreen: { label: '格栅', tag: 'GR', width: 90, height: 50, shape: 'tank', inline: false },
  gritChamber: { label: '曝气沉砂池', tag: 'GC', width: 120, height: 60, shape: 'tank', inline: false },
  primaryClarifier: { label: '初沉池', tag: 'PC', width: 110, height: 110, shape: 'round', inline: false },
  anaerobicTank: { label: '厌氧池', tag: 'AT', width: 120, height: 70, shape: 'tank', inline: false },
  anoxicTank: { label: '缺氧池', tag: 'AX', width: 120, height: 70, shape: 'tank', inline: false },
  aerobicTank: { label: '好氧池', tag: 'AE', width: 140, height: 70, shape: 'tank', inline: false },
  secondaryClarifier: { label: '二沉池', tag: 'SC', width: 120, height: 120, shape: 'round', inline: false },
  coagulationTank: { label: '混凝沉淀池', tag: 'CO', width: 110, height: 70, shape: 'tank', inline: false },
  filterBed: { label: '滤池', tag: 'FL', width: 120, height: 60, shape: 'tank', inline: false },
  disinfectionTank: { label: '消毒接触池', tag: 'DT', width: 130, height: 60, shape: 'tank', inline: false },
  sludgeThickener: { label: '污泥浓缩池', tag: 'ST', width: 100, height: 100, shape: 'round', inline: false },
  dewateringMachine: { label: '污泥脱水机', tag: 'DW', width: 110, height: 60, shape: 'tank', inline: false },
  pump: { label: '水泵', tag: 'P', width: 44, height: 44, shape: 'device', inline: false },
  blower: { label: '鼓风机', tag: 'B', width: 48, height: 48, shape: 'device', inline: false },
  dosingUnit: { label: '加药装置', tag: 'DU', width: 60, height: 70, shape: 'device', inline: false },
  valve: { label: '阀门', tag: 'V', width: 32, height: 32, shape: 'device', inline: true },
  flowMeter: { label: '流量计', tag: 'FIT', width: 36, height: 36, shape: 'device', inline: true },
  analyzer: { label: '在线水质分析仪', tag: 'AIT', width: 36, height: 36, shape: 'device', inline: false },
  inlet: { label: '进水', tag: 'IN', width: 80, height: 36, shape: 'boundary', inline: false },
  outlet: { label: '出水 / 排放', tag: 'OUT', width: 80, height: 36, shape: 'boundary', inline: false },
  sludgeOut: { label: '污泥外运', tag: 'SO', width: 80, height: 44, shape: 'boundary', inline: false },
};

/** 全局外观基准：所有符号共用，保证「一张图上不花」 */
export const WATER_STYLE = {
  strokeStyle: '#1f2937',
  lineWidth: 1.4,
  /** 栅条、折流板、搅拌器这类内部线更细 */
  detailLineWidth: 1,
  /** 水线单元的填充（浅蓝） */
  waterFill: '#eff6ff',
  /** 污泥线单元的填充（浅黄） */
  sludgeFill: '#fef3c7',
  tagFontSize: 9.5,
  tagColor: '#64748b',
  nameFontSize: 12,
  nameColor: '#1e293b',
  /** 圆形单元里的罗马数字/字母（G/M 那类） */
  letterFontSize: 14,
  /** 空心符号的填充（必须是合法色值：fillStyle=false/'none' 会退化成实色） */
  hollowFill: '#ffffff',
  /** 明确停用/旁通时的颜色 */
  idleColor: '#94a3b8',
};

/** 污泥线单元（配色与校验都要用） */
export const WATER_SLUDGE_KINDS: WaterSymbolKind[] = ['sludgeThickener', 'dewateringMachine', 'sludgeOut'];

export type WaterValveState = 'open' | 'closed';

/**
 * @class WaterSymbol 给水排水工艺流程图图元（复合组件）
 *
 * 与其它域包同一套做法：内部形状按 `kind` 派生（`hasDerivedChildren() === true`），
 * 不进文档、载入时按 state 重建；`getSerializableChildren()` 声明真实子节点（本包目前没有，
 * 但保留钩子，后续做「单元里嵌设备」时不用改序列化契约）。
 */
export default class WaterSymbol extends ICEGroup {
  /** 稳定的类型标识（判型与序列化都用它，不要用类名） */
  public static readonly typeId = 'ice-entity-designer:WaterSymbol';

  /** 派生部件（形状 / 文字），测试与属性面板可以按角色取用 */
  public parts: Array<{ role: string; component: any }> = [];

  /**
   * 本次绘制的原点（= 符号中心在组内坐标系里的位置）。
   *
   * 组内坐标系原点在**左上角**（`ICERect` 的 left/top 是盒子左上角），而所有形状都是围绕中心
   * 画的，所以绘图辅助统一按「中心相对坐标」收参、在这里加一次原点偏移。
   */
  private __originX = 0;
  private __originY = 0;

  public hasDerivedChildren(): boolean {
    return true;
  }

  public getSerializableChildren(): any[] {
    const derived = this.parts.map((item) => item.component);
    return this.childNodes.filter((child: any) => derived.indexOf(child) === -1);
  }

  constructor(props: any = {}) {
    super(WaterSymbol.arrangeParam(props));
    this.syncShape();
  }

  protected static arrangeParam(props: any = {}) {
    const kind: WaterSymbolKind = (props.kind || 'pump') as WaterSymbolKind;
    const preset = WATER_SYMBOL_PRESETS[kind] || WATER_SYMBOL_PRESETS.pump;
    return merge(
      {
        kind,
        tag: preset.tag,
        /** 设备 / 单元名称 */
        name: '',
        // 自身不画：轮廓一律由派生形状绘制
        fill: false,
        stroke: false,
        width: preset.width,
        height: preset.height,
        style: { strokeStyle: WATER_STYLE.strokeStyle, lineWidth: WATER_STYLE.lineWidth },
        tagStyle: { fontSize: WATER_STYLE.tagFontSize, textColor: WATER_STYLE.tagColor },
        /** 阀门开 / 闭（运行工况：关阀 → 流径断开） */
        valveState: 'open' as WaterValveState,
        /** 停用 / 旁通：整符号画成灰色 */
        idle: false,
        /**
         * **不可变换**（只能拖动）：符号的比例与朝向是记法的一部分。
         * 图纸整体缩放走视图缩放（滚轮 / ICE.zoomAt）；需要变尺寸的元素走属性面板数值入口。
         */
        transformable: false,
      },
      props
    );
  }

  private static readonly __shapeKeys = ['kind', 'tag', 'name', 'width', 'height', 'style', 'idle', 'valveState'];

  public setState(patch: any): void {
    const needsSync =
      !!patch && WaterSymbol.__shapeKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsSync) {
      this.syncShape();
    }
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /** 取某个角色的派生部件（测试 / 属性面板用） */
  public part(role: string): any {
    const hit = this.parts.find((item) => item.role === role);
    return hit ? hit.component : null;
  }

  /** 按 `kind` 重建内部形状与文字 */
  protected syncShape(): void {
    this.__clearParts();
    const kind: WaterSymbolKind = (this.state.kind || 'pump') as WaterSymbolKind;
    const preset = WATER_SYMBOL_PRESETS[kind] || WATER_SYMBOL_PRESETS.pump;
    const w = this.state.width || preset.width;
    const h = this.state.height || preset.height;
    const baseStroke = (this.state.style && this.state.style.strokeStyle) || WATER_STYLE.strokeStyle;
    const strokeStyle = this.state.idle ? WATER_STYLE.idleColor : baseStroke;
    const lw = (this.state.style && this.state.style.lineWidth) || WATER_STYLE.lineWidth;
    const isSludge = WATER_SLUDGE_KINDS.indexOf(kind) !== -1;
    const fillStyle = isSludge ? WATER_STYLE.sludgeFill : WATER_STYLE.waterFill;
    const cx = w / 2;
    const cy = h / 2;
    const baseZ = this.state.zIndex || 0;
    this.__originX = cx;
    this.__originY = cy;

    switch (kind) {
      case 'barScreen':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 斜栅条
        for (let i = 1; i <= 4; i++) {
          const x = (w / 5) * i - w / 2;
          this.__poly([x, h / 2, x + 8, -h / 2], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      case 'gritChamber':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 底部集砂斗
        this.__poly([-w / 2 + 10, h / 2, 0, h / 2 + 14, w / 2 - 10, h / 2], strokeStyle, lw, baseZ);
        // 曝气气泡
        this.__circle(-w / 4, -h / 6, 4, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__circle(0, h / 8, 3, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__circle(w / 5, -h / 8, 3.5, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      case 'primaryClarifier':
      case 'secondaryClarifier': {
        const r = Math.min(w, h) / 2;
        this.__circle(0, 0, r, fillStyle, strokeStyle, lw, baseZ);
        // 中心导流筒 + 刮泥桥
        this.__circle(0, 0, r / 6, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-r, 0, r, 0], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        if (kind === 'secondaryClarifier') {
          this.__poly([-r * 0.6, -r * 0.6, r * 0.6, r * 0.6], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      }
      case 'anaerobicTank':
      case 'anoxicTank':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 搅拌器：立轴 + 叶轮
        this.__poly([0, -h / 2, 0, h / 2 - 10], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-10, h / 2 - 10, 10, h / 2 - 10], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      case 'aerobicTank':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 曝气盘一排
        for (let i = 0; i < 4; i++) {
          this.__circle(-w / 4 + (i * w) / 6, h / 4, 3.5, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      case 'coagulationTank':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        this.__poly([0, -h / 2, 0, h / 2 - 10], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-10, h / 2 - 10, 10, h / 2 - 10], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        // 加药点
        this.__circle(-w / 4, -h / 4, 3, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__circle(-w / 4, -h / 4 + 9, 2, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      case 'filterBed':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 滤料层：两排小圆点
        for (let i = 0; i < 6; i++) {
          const x = -w / 2 + 12 + (i * (w - 24)) / 5;
          this.__circle(x, h / 6, 2.5, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
          this.__circle(x, -h / 6, 2.5, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      case 'disinfectionTank':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 折流板
        for (let i = 1; i <= 3; i++) {
          const x = -w / 2 + (i * w) / 4;
          this.__poly([x, h / 2, x, -h / 2 + 6], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      case 'sludgeThickener': {
        const r = Math.min(w, h) / 2;
        this.__circle(0, 0, r, fillStyle, strokeStyle, lw, baseZ);
        this.__circle(0, 0, r / 5, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-r, 0, -r / 5, 0], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([r / 5, 0, r, 0], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      }
      case 'dewateringMachine':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 螺旋挤压：三段折线
        this.__poly([-w / 4, -h / 6, w / 4, -h / 6], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-w / 4, 0, w / 4, 0], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__poly([-w / 4, h / 6, w / 4, h / 6], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      case 'pump': {
        const r = Math.min(w, h) / 2;
        this.__circle(0, 0, r, 'none', strokeStyle, lw, baseZ);
        // 泵符号：圆内一个指向上方的三角
        this.__closedPoly([0, -r * 0.6, r * 0.6, r * 0.5, -r * 0.6, r * 0.5], strokeStyle, lw, baseZ);
        break;
      }
      case 'blower': {
        const r = Math.min(w, h) / 2;
        this.__circle(0, 0, r, 'none', strokeStyle, lw, baseZ);
        // 叶轮：三条半径
        for (let i = 0; i < 3; i++) {
          const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
          this.__poly(
            [0, 0, r * 0.85 * Math.cos(angle), r * 0.85 * Math.sin(angle)],
            strokeStyle,
            WATER_STYLE.detailLineWidth,
            baseZ
          );
        }
        break;
      }
      case 'dosingUnit':
        // 药罐
        this.__box(0, -8, w, h - 20, fillStyle, strokeStyle, lw, baseZ);
        // 计量泵（小三角）+ 出口滴点
        this.__closedPoly([0, h / 2 - 16, 8, h / 2, -8, h / 2], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        this.__circle(0, h / 2 - 4, 2, 'none', strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        break;
      case 'valve':
        // 阀门图例：两个相对的三角（蝶形）
        this.__closedPoly([-9, -8, -9, 8, 0, 0], strokeStyle, lw, baseZ);
        this.__closedPoly([9, -8, 9, 8, 0, 0], strokeStyle, lw, baseZ);
        if (this.state.valveState === 'closed') {
          // 关位：加一条竖杠，一眼看出关断
          this.__poly([0, -10, 0, 10], '#dc2626', 2, baseZ);
        }
        break;
      case 'flowMeter':
        this.__circle(0, 0, Math.min(w, h) / 2, 'none', strokeStyle, lw, baseZ);
        this.__text(
          cx - 7,
          cy - WATER_STYLE.letterFontSize * 0.7,
          14,
          'F',
          WATER_STYLE.letterFontSize,
          strokeStyle,
          'center'
        );
        break;
      case 'analyzer':
        this.__circle(0, 0, Math.min(w, h) / 2, 'none', strokeStyle, lw, baseZ);
        this.__text(
          cx - 7,
          cy - WATER_STYLE.letterFontSize * 0.7,
          14,
          'A',
          WATER_STYLE.letterFontSize,
          strokeStyle,
          'center'
        );
        break;
      case 'inlet':
        // 箭头指向下游
        this.__box(10, 0, w - 20, h - 12, fillStyle, strokeStyle, lw, baseZ);
        this.__closedPoly([-w / 2 + 2, 0, -w / 2 + 18, -8, -w / 2 + 18, 8], strokeStyle, lw, baseZ);
        break;
      case 'outlet':
        this.__box(-10, 0, w - 20, h - 12, fillStyle, strokeStyle, lw, baseZ);
        this.__closedPoly([w / 2 - 2, 0, w / 2 - 18, -8, w / 2 - 18, 8], strokeStyle, lw, baseZ);
        break;
      case 'sludgeOut':
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        // 三条斜线表示"外运"
        for (let i = -1; i <= 1; i++) {
          this.__poly([i * 10 - 5, h / 4, i * 10 + 5, -h / 4], strokeStyle, WATER_STYLE.detailLineWidth, baseZ);
        }
        break;
      default:
        this.__box(0, 0, w, h, fillStyle, strokeStyle, lw, baseZ);
        break;
    }

    /**
     * 文字排版（全库统一，保证不与图形内部元素打架）：
     * - **位号在上**：符号顶边外侧居中；
     * - **名称在下**：符号底边外侧居中。
     * 图形内部只保留符号自身的构成要素（流量计的 F、在线仪表的 A 之类）。
     */
    const labelWidth = Math.max(w + 24, 90);
    const labelLeft = cx - labelWidth / 2;
    if (this.state.tag) {
      this.__text(
        labelLeft,
        -18,
        labelWidth,
        String(this.state.tag),
        WATER_STYLE.tagFontSize,
        WATER_STYLE.tagColor,
        'center'
      );
    }
    const name = String(this.state.name || '');
    if (name) {
      this.__text(labelLeft, h + 14, labelWidth, name, WATER_STYLE.nameFontSize, WATER_STYLE.nameColor, 'center');
    }
  }

  // ---------------- 绘图辅助 ----------------

  private __box(
    cx: number,
    cy: number,
    w: number,
    h: number,
    fillStyle: string,
    strokeStyle: string,
    lineWidth: number,
    zIndex: number
  ): any {
    return this.__add(
      'box',
      new ICERect({
        left: this.__originX + cx - w / 2,
        top: this.__originY + cy - h / 2,
        width: w,
        height: h,
        radius: 3,
        zIndex,
        interactive: false,
        style: { fillStyle, strokeStyle, lineWidth },
      })
    );
  }

  private __circle(
    cx: number,
    cy: number,
    radius: number,
    fillStyle: string,
    strokeStyle: string,
    lineWidth: number,
    zIndex: number
  ): any {
    return this.__add(
      'circle:' + cx + ',' + cy,
      new ICECircle({
        left: this.__originX + cx - radius,
        top: this.__originY + cy - radius,
        radius,
        zIndex,
        interactive: false,
        style: { fillStyle: fillStyle === 'none' ? WATER_STYLE.hollowFill : fillStyle, strokeStyle, lineWidth },
      })
    );
  }

  /**
   * 闭合图形：**先画开放折线，再单独补一条闭合边**。
   *
   * 不用 `closePath` / 首尾重复点：那种写法会让首帧的包围盒退化，离屏缓存拿 0 尺寸画布去
   * `drawImage` 而报错（引擎侧已记录此坑，见 13-gap-analysis）。拆成两段开放折线后，
   * 每条边都走 `__poly`（含轴对齐直线兜底），盒子永远不退化，渲染结果完全一致。
   */
  private __closedPoly(points: number[], strokeStyle: string, lineWidth: number, zIndex: number): any {
    const first = this.__poly(points, strokeStyle, lineWidth, zIndex);
    const lastX = points[points.length - 2];
    const lastY = points[points.length - 1];
    this.__poly([lastX, lastY, points[0], points[1]], strokeStyle, lineWidth, zIndex);
    return first;
  }

  private __poly(points: number[], strokeStyle: string, lineWidth: number, zIndex: number): any {
    const dots: number[][] = [];
    for (let i = 0; i < points.length; i += 2) {
      dots.push([points[i] + this.__originX, points[i + 1] + this.__originY]);
    }
    /**
     * **轴对齐直线必须用细矩形画**：折线的包围盒由点集算出来，水平线高度为 0、垂直线宽度为 0，
     * 组件级离屏缓存会拿 0 尺寸画布去 `drawImage`，控制台报
     * `The image argument is a canvas element with a width or height of 0`（引擎侧已记录，见
     * 13-gap-analysis：修法方向是缓存前对盒做尺寸兜底）。
     * 这里在域包侧规避：两点且某一维退化的，直接画一条 `lineWidth` 粗的细矩形 —— 渲染结果一致，
     * 盒子不再退化。（电力域包的母线用的是同一招：画的是 3px 的线，state.height 给到 20。）
     */
    const degenerate =
      dots.length === 2 && (Math.abs(dots[1][0] - dots[0][0]) < 0.01 || Math.abs(dots[1][1] - dots[0][1]) < 0.01);
    if (degenerate) {
      const [ax, ay] = dots[0];
      const [bx, by] = dots[1];
      const horizontal = Math.abs(ay - by) < 0.01;
      const left = horizontal ? Math.min(ax, bx) : Math.min(ax, bx) - lineWidth / 2;
      const top = horizontal ? Math.min(ay, by) - lineWidth / 2 : Math.min(ay, by);
      const width = horizontal ? Math.abs(bx - ax) : lineWidth;
      const height = horizontal ? lineWidth : Math.abs(by - ay);
      return this.__add(
        'line:' + zIndex + ':' + left + ',' + top,
        new ICERect({
          left,
          top,
          width,
          height,
          zIndex,
          interactive: false,
          style: { fillStyle: strokeStyle, strokeStyle, lineWidth: 0 },
        })
      );
    }
    return this.__add(
      'poly:' + zIndex + ':' + dots.length,
      new ICEPolyLine({
        points: dots,
        zIndex,
        interactive: false,
        arrow: 'none',
        lineType: 'solid',
        style: { strokeStyle, lineWidth },
      } as any)
    );
  }

  /**
   * 文本部件：**显式给文字盒（width/height）+ textAlign/textBaseline 居中**。
   *
   * 这是电力域包验证过的写法：不给盒、靠自己估算宽度去挪 left，实测会又偏又挤。
   */
  private __text(
    boxLeft: number,
    boxTop: number,
    boxWidth: number,
    text: string,
    fontSize: number,
    color: string,
    textAlign: 'left' | 'center' = 'center'
  ): any {
    const boxHeight = Math.round(fontSize * 1.4);
    return this.__add(
      'text:' + text,
      new ICEText({
        left: boxLeft,
        top: boxTop,
        width: boxWidth,
        height: boxHeight,
        text,
        stroke: false,
        interactive: false,
        zIndex: (this.state.zIndex || 0) + 4,
        style: { fontSize, fillStyle: color, textAlign, textBaseline: 'middle' },
      })
    );
  }

  private __add(role: string, component: any): any {
    this.addChild(component);
    this.parts.push({ role, component });
    return component;
  }

  private __clearParts(): void {
    this.parts.forEach((item) => {
      if (item.component && item.component.parentNode === this) {
        this.removeChild(item.component);
      }
    });
    this.parts = [];
  }
}
