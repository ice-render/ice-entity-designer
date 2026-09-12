/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 电力**二次回路**元件库（简化版第一刀：保护电流回路 + 端子排）。
 *
 * 记法依据见 `docs/power-secondary-spec.md`：
 * - 元件的通用图形符号按 GB/T 4728.7（等同 IEC 60617-7，开关 / 控制 / 保护器件）；
 * - 文字符号用二次侧主流的 **IEEE C37.2 功能编号**（52 断路器、43 切换开关、88 辅助继电器、
 *   49 过流继电器、33 位置开关、63 压力…），与一次侧的 QF/QS 体系分开；
 * - 回路编号（A411/B411/C411/N411）、端子号（201…）、电缆编号（1D1…）是数据字段，画成标注。
 */
import { ICECircle, ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';

export const SECONDARY_SYMBOL_KINDS = [
  'contactNO',
  'contactNC',
  'pushButton',
  'switchRemoteLocal',
  'linkPlate',
  'indicatorLamp',
  'relayDevice',
  'ctWinding',
  'terminal',
  'earth',
] as const;

export type SecondarySymbolKind = (typeof SECONDARY_SYMBOL_KINDS)[number];

/** 二次侧文字符号（IEEE C37.2 功能编号），与一次侧的 QF/QS 体系分开 */
export const SECONDARY_SYMBOL_PRESETS: Record<
  SecondarySymbolKind,
  { label: string; tag: string; width: number; height: number }
> = {
  contactNO: { label: '常开接点', tag: '52a', width: 48, height: 24 },
  contactNC: { label: '常闭接点', tag: '52b', width: 48, height: 24 },
  pushButton: { label: '按钮', tag: '11', width: 48, height: 40 },
  switchRemoteLocal: { label: '切换开关（远方/就地）', tag: '43', width: 64, height: 32 },
  linkPlate: { label: '压板（连接片）', tag: 'XB', width: 56, height: 24 },
  indicatorLamp: { label: '信号灯', tag: 'HL', width: 36, height: 36 },
  relayDevice: { label: '保护 / 自动装置', tag: '', width: 220, height: 90 },
  ctWinding: { label: '互感器二次绕组', tag: 'LH', width: 48, height: 44 },
  terminal: { label: '端子', tag: '', width: 28, height: 28 },
  earth: { label: '接地', tag: 'E', width: 40, height: 34 },
};

/** 二次回路的外观基准：统一线宽与描边色（与一次侧同一套视觉语言） */
export const SECONDARY_STYLE = {
  strokeStyle: '#1f2937',
  lineWidth: 1.4,
  heavyLineWidth: 2.6,
  labelFontSize: 10,
  labelColor: '#475569',
  tagFontSize: 10,
  tagColor: '#64748b',
};

/**
 * @class SecondarySymbol 二次回路元件（复合组件）
 *
 * 与其它域包同一套做法：内部形状按 `kind` 派生（`hasDerivedChildren() === true` 不进文档），
 * 每个派生部件带稳定 `role`，测试按 role 认记法。
 */
export default class SecondarySymbol extends ICEGroup {
  public static readonly typeId = 'SecondarySymbol';

  public parts: Array<{ role: string; component: any }> = [];

  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    super(SecondarySymbol.arrangeParam(props));
    this.syncShape();
  }

  protected static arrangeParam(props: any = {}) {
    const kind: SecondarySymbolKind = (props.kind || 'contactNO') as SecondarySymbolKind;
    const preset = SECONDARY_SYMBOL_PRESETS[kind] || SECONDARY_SYMBOL_PRESETS.contactNO;
    return merge(
      {
        kind,
        tag: preset.tag,
        fill: false,
        stroke: false,
        width: preset.width,
        height: preset.height,
        style: { strokeStyle: SECONDARY_STYLE.strokeStyle, lineWidth: SECONDARY_STYLE.lineWidth },
        // 二次元件同样只允许拖动，不允许缩放 / 旋转（尺寸与朝向是记法的一部分）
        transformable: false,
        /** 回路编号（A411…）/ 端子号（201…）/ 电缆编号（1D1…） */
        name: '',
        /** 功能编号（52a / 43 / 49…），可在属性面板改 */
        tagStyle: { fontSize: SECONDARY_STYLE.tagFontSize, textColor: SECONDARY_STYLE.tagColor },
        /** 压板 / 接点的位置状态：`open`（断开，标准画法）/ `closed`（接通） */
        switchState: 'open',
      },
      props
    );
  }

  private static readonly __shapeKeys = ['kind', 'tag', 'width', 'height', 'style', 'tagStyle', 'name', 'switchState'];

  public setState(patch: any): void {
    const needsSync =
      !!patch && SecondarySymbol.__shapeKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsSync) {
      this.syncShape();
    }
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  public part(role: string): any {
    const hit = this.parts.find((item) => item.role === role);
    return hit ? hit.component : null;
  }

  protected syncShape(): void {
    this.__clearParts();
    const kind: SecondarySymbolKind = (this.state.kind || 'contactNO') as SecondarySymbolKind;
    const preset = SECONDARY_SYMBOL_PRESETS[kind] || SECONDARY_SYMBOL_PRESETS.contactNO;
    const w = this.state.width || preset.width;
    const h = this.state.height || preset.height;
    const strokeStyle = (this.state.style && this.state.style.strokeStyle) || SECONDARY_STYLE.strokeStyle;
    const lw = (this.state.style && this.state.style.lineWidth) || SECONDARY_STYLE.lineWidth;
    const baseZ = this.state.zIndex || 0;
    const closed = this.state.switchState === 'closed';
    const cy = h / 2;

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
    const rect = (role: string, left: number, top: number, width: number, height: number, radius = 0): any =>
      this.__add(
        role,
        new ICERect({
          zIndex: baseZ + 2,
          left,
          top,
          width,
          height,
          radius,
          stroke: true,
          interactive: false,
          style: { fillStyle: '#ffffff', strokeStyle, lineWidth: lw },
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
      size: number,
      color = strokeStyle
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
          style: { fontSize: size, fillStyle: color, textAlign: 'center', textBaseline: 'middle' },
        })
      );

    switch (kind) {
      case 'contactNO': {
        // 常开接点：两条引线 + 固定触点竖线 + 斜的动触点（**不接触** → 一眼看出断开）
        line('leadLeft', [
          [0, cy],
          [w * 0.36, cy],
        ]);
        line('fixedContact', [
          [w * 0.36, cy - 8],
          [w * 0.36, cy + 8],
        ]);
        line('movingContact', [
          [w * 0.4, cy - 9],
          [w * 0.68, cy + 5],
        ]);
        line('leadRight', [
          [w * 0.72, cy],
          [w, cy],
        ]);
        break;
      }
      case 'contactNC': {
        // 常闭接点：引线**连通** + 固定触点竖线 + 动触点斜线搭在引线上（接触）
        line('leadLeft', [
          [0, cy],
          [w * 0.36, cy],
        ]);
        line('leadRight', [
          [w * 0.36, cy],
          [w, cy],
        ]);
        line('fixedContact', [
          [w * 0.36, cy - 8],
          [w * 0.36, cy + 8],
        ]);
        line('movingContact', [
          [w * 0.4, cy - 9],
          [w * 0.62, cy + 5],
        ]);
        break;
      }
      case 'pushButton': {
        // 按钮（常开 + 操作件）：接点记法 + 上方一小段操作杆
        line('leadLeft', [
          [0, cy + 4],
          [w * 0.36, cy + 4],
        ]);
        line('fixedContact', [
          [w * 0.36, cy - 4],
          [w * 0.36, cy + 12],
        ]);
        line('movingContact', [
          [w * 0.4, cy - 5],
          [w * 0.68, cy + 9],
        ]);
        line('leadRight', [
          [w * 0.72, cy + 4],
          [w, cy + 4],
        ]);
        line('actuator', [
          [w * 0.5, 2],
          [w * 0.5, cy - 6],
        ]);
        line('actuatorCap', [
          [w * 0.36, 2],
          [w * 0.64, 2],
        ]);
        break;
      }
      case 'switchRemoteLocal': {
        // 切换开关：方框符号（只表示元件，不画内部）+ 手柄位置
        rect('switchBody', 0, 0, w, h, 4);
        line('lever', [
          [w * 0.5, cy + 6],
          [w * 0.5 + (closed ? 10 : -10), cy - 6],
        ]);
        text('positionText', closed ? '就地' : '远方', 0, cy + 6, w, 14, 9, SECONDARY_STYLE.labelColor);
        break;
      }
      case 'linkPlate': {
        // 压板（连接片）：接通 = 直连；断开 = 斜置的连接片
        line('leadLeft', [
          [0, cy],
          [w * 0.3, cy],
        ]);
        line('leadRight', [
          [w * 0.7, cy],
          [w, cy],
        ]);
        line(
          'plate',
          closed
            ? [
                [w * 0.3, cy],
                [w * 0.7, cy],
              ]
            : [
                [w * 0.3, cy - 8],
                [w * 0.7, cy + 6],
              ],
          lw * 1.6
        );
        break;
      }
      case 'indicatorLamp': {
        // 信号灯：圆 + 圆内「×」+ 上下引线
        line('leadTop', [
          [w / 2, 0],
          [w / 2, h * 0.16],
        ]);
        circle('lamp', 4, h * 0.16, Math.min(w, h) / 2 - 4);
        line('lampCrossA', [
          [w * 0.34, h * 0.32],
          [w * 0.66, h * 0.64],
        ]);
        line('lampCrossB', [
          [w * 0.66, h * 0.32],
          [w * 0.34, h * 0.64],
        ]);
        line('leadBottom', [
          [w / 2, h * 0.84],
          [w / 2, h],
        ]);
        break;
      }
      case 'relayDevice': {
        // 保护 / 自动装置：方框符号 + 型号（装置内部不画，只画端子）
        rect('deviceBody', 0, 0, w, h, 4);
        text('deviceTitle', this.state.name || '装置', 0, cy - 10, w, 20, 12, strokeStyle);
        text('deviceModel', this.state.tag || '', 0, cy + 10, w, 16, 10, SECONDARY_STYLE.labelColor);
        break;
      }
      case 'ctWinding': {
        // 互感器二次绕组：线圈 + 两端引线（回路编号由导线标注，绕组号写在元件名上）
        // 线圈：三段半圆串成绕组（与一次侧的消弧线圈/电抗器同一套记法）
        line('leadTop', [
          [w / 2, 0],
          [w / 2, h * 0.24],
        ]);
        [0, 1, 2].forEach((index) => {
          const cy2 = h * 0.24 + 10 + index * 14;
          const points: number[][] = [];
          for (let step = 0; step <= 12; step += 1) {
            const angle = ((180 + (180 * step) / 12) * Math.PI) / 180;
            points.push([w / 2 + 10 * Math.cos(angle), cy2 + 10 * Math.sin(angle)]);
          }
          line('winding', points);
        });
        line('leadBottom', [
          [w / 2, h * 0.24 + 52],
          [w / 2, h],
        ]);
        break;
      }
      case 'terminal': {
        // 端子：小圆 + 端子号
        line('leadTop', [
          [w / 2, 0],
          [w / 2, h * 0.3],
        ]);
        circle('terminalCircle', 4, h * 0.3, Math.min(w, h) / 2 - 4);
        line('leadBottom', [
          [w / 2, h * 0.7],
          [w / 2, h],
        ]);
        break;
      }
      case 'earth': {
        line('leadTop', [
          [w / 2, 0],
          [w / 2, h * 0.45],
        ]);
        const widths = [16, 10, 4];
        widths.forEach((half, index) => {
          line('earth', [
            [w / 2 - half, h * 0.45 + index * 6],
            [w / 2 + half, h * 0.45 + index * 6],
          ]);
        });
        break;
      }
      default:
        break;
    }

    // 元件名：端子号写在端子**左侧**（端子排一行一个，写上方会压住上一个端子），其余写在元件上方
    if (this.state.name && kind !== 'relayDevice') {
      if (kind === 'terminal') {
        this.__add(
          'nameLabel',
          new ICEText({
            zIndex: baseZ + 4,
            left: -46,
            top: cy - 9,
            width: 40,
            height: 18,
            text: String(this.state.name),
            stroke: false,
            interactive: false,
            style: {
              fontSize: SECONDARY_STYLE.labelFontSize,
              fillStyle: SECONDARY_STYLE.labelColor,
              textAlign: 'right',
              textBaseline: 'middle',
            },
          })
        );
      } else {
        text(
          'nameLabel',
          String(this.state.name),
          0,
          -18,
          Math.max(w, 56),
          16,
          SECONDARY_STYLE.labelFontSize,
          SECONDARY_STYLE.labelColor
        );
      }
    }
    // 功能编号（C37.2）统一写在元件右下角
    if (this.state.tag && kind !== 'relayDevice') {
      this.__add(
        'tag',
        new ICEText({
          zIndex: baseZ + 4,
          left: w + 2,
          top: h / 2 - 8,
          width: 40,
          height: 16,
          text: String(this.state.tag),
          stroke: false,
          interactive: false,
          style: {
            fontSize: SECONDARY_STYLE.tagFontSize,
            fillStyle: (this.state.tagStyle && this.state.tagStyle.textColor) || SECONDARY_STYLE.tagColor,
            textAlign: 'left',
            textBaseline: 'middle',
          },
        })
      );
    }
  }

  private __add(role: string, component: any): any {
    this.parts.push({ role, component });
    this.addChild(component);
    return component;
  }

  /** 只清派生部件，不动真实子节点（端子排那种容器不受影响） */
  private __clearParts(): void {
    const derived = this.parts
      .map((item) => item.component)
      .filter((component: any) => this.childNodes.indexOf(component) !== -1);
    if (derived.length) {
      this.removeChildren(derived);
    }
    this.parts = [];
  }
}

/**
 * @class TerminalStrip 端子排（容器）
 *
 * 端子排本质是**一列端子**（真实图纸里还会分「现场侧 / 屏柜侧」两列）。这里做成引擎的普通容器：
 * 端子是它的**真实子节点** —— 拖动端子排时端子跟着走（容器语义），每个端子又有自己的上下插槽可以接线。
 *
 * 注意：**不要**给它加 `hasDerivedChildren()`。复合组件声明「子节点都是派生的」会让序列化
 * 跳过全部子节点，端子排的端子在快照往返时会整套丢掉（BPMN 池/泳道目前就踩了这个坑）。
 */
export class TerminalStrip extends ICEGroup {
  public static readonly typeId = 'TerminalStrip';

  constructor(props: any = {}) {
    super(
      merge(
        {
          title: '端子排',
          width: 96,
          height: 240,
          fill: '#f8fafc',
          stroke: '#cbd5e1',
          lineWidth: 1,
          style: { fillStyle: '#f8fafc', strokeStyle: '#cbd5e1', lineWidth: 1 },
          transformable: false,
        },
        props
      )
    );
    this.addChild(
      new ICEText({
        left: 0,
        top: -20,
        width: Math.max(this.state.width, 60),
        height: 16,
        text: String(this.state.title || '端子排'),
        stroke: false,
        interactive: false,
        style: {
          fontSize: SECONDARY_STYLE.labelFontSize,
          fillStyle: SECONDARY_STYLE.labelColor,
          textAlign: 'center',
          textBaseline: 'middle',
        },
      })
    );
  }
}
