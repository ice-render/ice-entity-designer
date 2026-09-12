/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEPolyLine } from 'ice-render';
import merge from 'lodash/merge';

/**
 * @class StateTransition 状态机的一次转移
 *
 * 记法：实线 + **实心箭头**，标签是 `事件 [守卫] / 动作`（UML 状态机与 PlantUML 状态图的通行写法）。
 * 复用引擎折线（插槽吸附 / 正交·贝塞尔路由 / 跟随宿主 / 矢量导出），只把标签的三个部分拼好。
 *
 * 之所以单独一个类而不是直接用 ICEPolyLine：给一个**稳定 typeId**，
 * 判型与序列化都靠它（应用层不要用 constructor.name，打包会 mangle）。
 */
export default class StateTransition extends ICEPolyLine {
  public static readonly typeId = 'StateTransition';

  constructor(props: any = {}) {
    super(StateTransition.arrangeParam(props));
  }

  protected static arrangeParam(props: any = {}) {
    const param = merge(
      {
        event: '',
        guard: '',
        action: '',
        arrow: 'end',
        arrowStyle: 'filled',
        fill: false,
        arrowLength: 12,
        style: { strokeStyle: '#64748b', fillStyle: '#64748b', lineWidth: 1.4 },
        labelStyle: { fontSize: 12.5, fillStyle: '#334155', backgroundColor: '#ffffff' },
      },
      props
    );
    // label 缺省时由 event/guard/action 拼；显式给了 label 就尊重显式值
    if (props.label === undefined) {
      param.label = StateTransition.composeLabel(param);
    }
    return param;
  }

  /**
   * 标签拼装：`事件 [守卫] / 动作` —— 缺哪个省哪个（不会出现空括号或光秃秃的斜杠）。
   */
  public static composeLabel(parts: { event?: string; guard?: string; action?: string }): string {
    const event = (parts.event || '').trim();
    const guard = (parts.guard || '').trim();
    const action = (parts.action || '').trim();
    let label = event;
    if (guard) {
      label += `${label ? ' ' : ''}[${guard}]`;
    }
    if (action) {
      label += `${label ? ' / ' : ''}${action}`;
    }
    return label;
  }

  public setState(patch: any): void {
    const partsChanged =
      !!patch &&
      ['event', 'guard', 'action'].some((key) => Object.prototype.hasOwnProperty.call(patch, key)) &&
      !Object.prototype.hasOwnProperty.call(patch, 'label');
    const next = partsChanged ? { ...patch, label: StateTransition.composeLabel({ ...this.state, ...patch }) } : patch;
    super.setState(next);
  }

  public applyPatch(patch: any = {}): void {
    this.setState(patch);
  }
}
