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
 * @class GanttDependency 甘特任务之间的依赖（完成 → 开始）
 *
 * 记法：实线 + 实心箭头，从「前置任务的右端」指向「后置任务的左端」，走正交路由（`visio`）。
 * 依赖只表达约束，不改变条的位置（自动排程是后续能力，不属于本包 v1）。
 */
export default class GanttDependency extends ICEPolyLine {
  public static readonly typeId = 'ice-entity-designer:GanttDependency';

  constructor(props: any = {}) {
    super(
      merge(
        {
          // 记法不可变换：依赖线不给缩放/旋转手柄
          transformable: false,
          arrow: 'end',
          arrowStyle: 'filled',
          fill: false,
          routeType: 'orthogonal',
          routeOffset: 14,
          arrowLength: 12,
          style: { strokeStyle: '#94a3b8', fillStyle: '#94a3b8', lineWidth: 1.3 },
        },
        props
      )
    );
  }
}
