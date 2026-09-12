/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import merge from 'lodash/merge';
import isNil from 'lodash/isNil';

export type UmlClassKind = 'class' | 'interface' | 'enum';

/** 构造型（stereotype）：接口与枚举在类名上方标注 */
const STEREOTYPE_BY_KIND: Record<UmlClassKind, string> = {
  class: '',
  interface: '«interface»',
  enum: '«enumeration»',
};

/**
 * @class UmlClass UML 类图的类框（三段式：类名 / 属性 / 方法）
 *
 * 与 ER 的 `Entity` 同一套做法：**复合组件** —— 类名、属性、方法、分隔线都是按 state
 * 派生的内部子组件（`hasDerivedChildren() === true`），不写进文档、载入时重建。
 *
 * 与 Entity 的三点差异（这也是它值得单独做域包的原因）：
 * - 三段式：类名带（含构造型）+ 属性区 + 方法区，分隔线两条；
 * - 成员是**自由文本**（`- id: string`、`+ pay(): void`），可见性/静态/泛型都由文本表达 ——
 *   这是 UML 工具与文本格式（PlantUML/Mermaid）通行的做法，也让 AI 生成不必学一套结构化语法；
 * - **高度随成员自动增长**，不允许成员画出框外。
 */
export default class UmlClass extends ICEGroup {
  /** 稳定类型标识（判型/序列化都用它，不要用 constructor.name：打包会被 mangle） */
  public static readonly typeId = 'UmlClass';

  protected stereotypeComponent: ICEText | null = null;
  protected nameComponent: ICEText | null = null;
  protected headerBackgroundComponent: ICERect | null = null;
  protected memberComponents: ICEText[] = [];
  protected dividerComponents: ICEPolyLine[] = [];

  /** 内部子组件由 state 派生 → 不参与序列化 */
  public hasDerivedChildren(): boolean {
    return true;
  }

  constructor(props: any = {}) {
    const param = UmlClass.arrangeParam(props);
    super(param);
    this.syncCompartments();
  }

  protected static arrangeParam(props: any) {
    const param = merge(
      {
        kind: 'class',
        className: 'Class',
        attributes: [],
        methods: [],
        width: 220,
        height: 120,
        style: {
          strokeStyle: '#334155',
          fillStyle: '#ffffff',
          radius: 6,
          lineWidth: 1.5,
        },
        headerStyle: {
          textColor: '#0f172a',
          backgroundColor: '#eef2ff',
          fontSize: 16,
          fontWeight: 'bold',
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 12,
          paddingRight: 12,
        },
        memberStyle: {
          textColor: '#334155',
          fontSize: 13,
          paddingTop: 6,
          paddingBottom: 0,
          paddingLeft: 12,
          paddingRight: 12,
        },
        dividerStyle: {
          strokeStyle: '#cbd5e1',
          fillStyle: '#cbd5e1',
          lineWidth: 1,
        },
      },
      props,
      { transformable: false }
    );
    if (isNil(param.className)) {
      param.className = 'Class';
    }
    if (!Array.isArray(param.attributes)) {
      param.attributes = [];
    }
    if (!Array.isArray(param.methods)) {
      param.methods = [];
    }
    return param;
  }

  /** 只需要重建内部排版的 state 键（拖动位置不该触发重建） */
  private static readonly __layoutKeys = [
    'kind',
    'className',
    'attributes',
    'methods',
    'abstract',
    'width',
    'headerStyle',
    'memberStyle',
    'dividerStyle',
  ];

  public setState(patch: any): void {
    const needsRelayout =
      !!patch && UmlClass.__layoutKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    super.setState(patch);
    if (needsRelayout) {
      this.syncCompartments();
    }
  }

  /** 应用层（属性面板 / DSL）改成员走这里，语义与 FlowNode.applyPatch 一致 */
  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }

  /**
   * 按 state 重建三段式排版，并把**内容高度**写回自身（成员不会被画出框外）。
   *
   * 高度用 `this.state.height = h` 直接写：`setState()` 会再次触发重建，形成循环。
   */
  protected syncCompartments(): void {
    this.__clearDerivedChildren();

    const width = this.state.width;
    const kind: UmlClassKind = (this.state.kind || 'class') as UmlClassKind;
    const stereotype = STEREOTYPE_BY_KIND[kind] || (this.state.abstract ? '«abstract»' : '');
    const headerStyle = this.state.headerStyle;
    const memberStyle = this.state.memberStyle;

    let cursorY = 0;

    // zIndex：引擎在**构造时**给每个组件分配自增 zIndex（`ICEComponent.instanceCounter++`），
    // 所以「先 addChild 的在下」并不成立 —— 标题背景是在文字之后构造的，默认会盖住类名
    // （浏览器实测：类名整条被底色带盖掉）。派生内部子组件一律显式给 z 序：
    // 背景 < 文字/分隔线（与 ER 的 Entity 用「zIndex - 1」是同一个处理）。
    const baseZ = this.state.zIndex || 0;

    // 行高按**字号解析式**算：ICEText 的高度依赖运行时的文本度量（Node / 服务端量不出来，
    // 会退化成默认高度），而类框高度是记法的一部分（成员不能画到框外），必须稳定可预期。
    const LINE_HEIGHT_RATIO = 1.35;
    const lineHeight = (fontSize: number, paddingTop: number, paddingBottom: number): number =>
      Math.round(fontSize * LINE_HEIGHT_RATIO + paddingTop + paddingBottom);

    // ---- 类名带（构造型 + 类名）----
    const headerInset = (this.state.style.lineWidth || 1.5) / 2;
    const headerChildren: ICEText[] = [];
    if (stereotype) {
      const stereotypeFontSize = Math.max((headerStyle.fontSize || 16) - 2, 10);
      const stereotypeHeight = lineHeight(stereotypeFontSize, headerStyle.paddingTop, 0);
      // 定位口径：子组件的 left/top 是**自身盒子左上角**（父容器左上角为原点），
      // 水平居中由 style.textAlign + 满宽盒子表达；垂直居中由 textBaseline='middle' 表达
      // （引擎把文字基线放在盒子中线）。与 ER 的 Entity 同一套写法。
      const stereotypeText = new ICEText({
        zIndex: baseZ + 2,
        left: 0,
        top: cursorY,
        width,
        height: stereotypeHeight,
        text: stereotype,
        stroke: false,
        interactive: false,
        style: {
          fontSize: stereotypeFontSize,
          fillStyle: headerStyle.textColor,
          textAlign: 'center',
          textBaseline: 'middle',
        },
      });
      this.stereotypeComponent = stereotypeText;
      headerChildren.push(stereotypeText);
      cursorY += stereotypeHeight;
    }

    const nameHeight = lineHeight(
      headerStyle.fontSize || 16,
      stereotype ? 0 : headerStyle.paddingTop,
      headerStyle.paddingBottom
    );
    const nameComponent = new ICEText({
      zIndex: baseZ + 2,
      left: 0,
      top: cursorY,
      width,
      height: nameHeight,
      text: String(this.state.className || ''),
      stroke: false,
      interactive: false,
      style: {
        fontSize: headerStyle.fontSize,
        fillStyle: headerStyle.textColor,
        fontWeight: headerStyle.fontWeight,
        textAlign: 'center',
        textBaseline: 'middle',
        fontStyle: kind === 'interface' ? 'italic' : 'normal',
      },
    });
    this.nameComponent = nameComponent;
    headerChildren.push(nameComponent);
    cursorY += nameHeight;
    const headerHeight = cursorY;

    if (headerStyle.backgroundColor && headerStyle.backgroundColor !== 'none') {
      this.headerBackgroundComponent = new ICERect({
        zIndex: baseZ + 1,
        left: headerInset,
        top: headerInset,
        width: Math.max(width - headerInset * 2, 0),
        height: Math.max(headerHeight - headerInset, 0),
        origin: 'top-left',
        radius: Math.max((this.state.style.radius || 0) - headerInset, 0),
        stroke: false,
        interactive: false,
        style: { fillStyle: headerStyle.backgroundColor, lineWidth: 0 },
      });
      this.addChild(this.headerBackgroundComponent);
    }
    headerChildren.forEach((child) => this.addChild(child));

    // ---- 属性区 / 方法区 ----
    const compartments: string[][] = [this.state.attributes || [], this.state.methods || []];
    compartments.forEach((members, index) => {
      // 分隔线：属性区与方法区各有一条上边线
      const divider = new ICEPolyLine({
        zIndex: baseZ + 2,
        left: 0,
        top: 0,
        points: [
          [0, cursorY],
          [width, cursorY],
        ],
        stroke: true,
        interactive: false,
        style: {
          strokeStyle: this.state.dividerStyle.strokeStyle,
          fillStyle: this.state.dividerStyle.fillStyle,
          lineWidth: this.state.dividerStyle.lineWidth,
        },
      });
      this.dividerComponents.push(divider);
      this.addChild(divider);

      const memberHeight = lineHeight(memberStyle.fontSize || 13, memberStyle.paddingTop, memberStyle.paddingBottom);
      if (!members.length) {
        // 空 compartment 也留一行高，视觉上三段都在（UML 工具的通行做法）
        cursorY += memberHeight;
        return;
      }
      members.forEach((text) => {
        const member = new ICEText({
          zIndex: baseZ + 2,
          left: 0,
          top: cursorY,
          width,
          height: memberHeight,
          text: String(text),
          stroke: false,
          interactive: false,
          style: {
            fontSize: memberStyle.fontSize,
            fillStyle: memberStyle.textColor,
            textBaseline: 'middle',
            textAlign: 'left',
            paddingLeft: memberStyle.paddingLeft,
          },
        });
        this.memberComponents.push(member);
        this.addChild(member);
        cursorY += memberHeight;
      });
      cursorY += 6; // compartment 底部留白
    });

    this.state.height = Math.max(Math.round(cursorY), this.state.height || 0);
  }

  private __clearDerivedChildren(): void {
    if (this.headerBackgroundComponent) {
      this.removeChild(this.headerBackgroundComponent);
      this.headerBackgroundComponent = null;
    }
    if (this.stereotypeComponent) {
      this.removeChild(this.stereotypeComponent);
      this.stereotypeComponent = null;
    }
    if (this.nameComponent) {
      this.removeChild(this.nameComponent);
      this.nameComponent = null;
    }
    if (this.memberComponents.length) {
      this.removeChildren(this.memberComponents);
      this.memberComponents.length = 0;
    }
    if (this.dividerComponents.length) {
      this.removeChildren(this.dividerComponents);
      this.dividerComponents.length = 0;
    }
  }
}
