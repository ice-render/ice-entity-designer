/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEPath } from 'ice-render';

/**
 * 流程图自定义形状（判定菱形 / 输入输出平行四边形）。
 *
 * 两个约束缺一不可，否则会「文字画出来了、轮廓不见了」或整体偏移半个身位：
 * 1. 路径必须赋回 `this.path2D` —— 基类渲染读的是这个字段，不是 createPathObject() 的返回值；
 * 2. 路径坐标要扣掉 `state.localOrigin`（默认原点在组件中心），与 ICERect 的写法一致。
 *
 * Path2D 实例按运行时构造：`this.path2D` 已由 ICEPath 构造时按平台创建好
 * （`root.createPath2D()`），这里 clone 它的构造函数与**原生 Path2D 的类型**——
 * 这样自定义形状在浏览器与 headless / 测试桩下都走同一条命令流，SVG 导出与形状断言才能复用。
 *
 * ⚠️ **必须把原生 Path2D 一起造出来**（2026-09-21 真机复现的事故）：`Path2DRecorder` 的原生对象
 * 是**构造参数**，`new Path2DRecorder()` 得到的是"纯记录器"（`native === null`）；而引擎 3.0.0 起
 * **不再把命令重放到 ctx**（"没有原生 `Path2D` 就不上屏"）。于是只 clone 构造函数的写法会表现为
 * 「命令流有、屏幕上没有」：池 / 泳道的框、事件圆、网关菱形、子流程标记全部不画，
 * 只剩节点的标题文字 —— 而单测（断言 `_commands`）与 SVG 导出看起来一切正常。
 * headless / 测试桩下 `native` 本来就是 `null`，因此这里行为与从前完全一致（只记命令）。
 */
function createEmptyPath(component: any): any {
  const current = component.path2D;
  const PathCtor = current && current.constructor;
  if (!PathCtor) {
    return null;
  }
  const native = current.native ? new current.native.constructor() : null;
  return new PathCtor(native);
}

/** 判定节点：菱形 */
export class FlowDiamond extends ICEPath {
  public static readonly typeId = 'ice-entity-designer:FlowDiamond';

  protected createPathObject(): any {
    const w = this.state.width;
    const h = this.state.height;
    const x = 0 - this.state.localOrigin[0];
    const y = 0 - this.state.localOrigin[1];
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    path.moveTo(x + w / 2, y);
    path.lineTo(x + w, y + h / 2);
    path.lineTo(x + w / 2, y + h);
    path.lineTo(x, y + h / 2);
    path.closePath();
    this.path2D = path;
    return this.path2D;
  }
}

/** 输入 / 输出节点：平行四边形 */
export class FlowParallelogram extends ICEPath {
  public static readonly typeId = 'ice-entity-designer:FlowParallelogram';

  protected createPathObject(): any {
    const w = this.state.width;
    const h = this.state.height;
    const slant = Math.min(28, w * 0.18);
    const x = 0 - this.state.localOrigin[0];
    const y = 0 - this.state.localOrigin[1];
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    path.moveTo(x + slant, y);
    path.lineTo(x + w, y);
    path.lineTo(x + w - slant, y + h);
    path.lineTo(x, y + h);
    path.closePath();
    this.path2D = path;
    return this.path2D;
  }
}
