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
 * Path2D 实例按运行时构造：浏览器用原生 `Path2D`，小程序低版本 / Node 用引擎的
 * PolyfillPath2D（`this.path2D` 已由 ICEPath 构造时按平台创建好，这里 clone 它的构造函数）。
 */
function createEmptyPath(component: any): any {
  const PathCtor = component.path2D && component.path2D.constructor;
  return PathCtor ? new PathCtor() : null;
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
