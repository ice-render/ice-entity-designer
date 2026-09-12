/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEPath } from 'ice-render';

/**
 * BPMN 2.0 记法的图形元件（全部是引擎 `ICEPath` 子类，与流程图那套共用同一套渲染机制）。
 *
 * 画法约定（与 `src/flow/flow_shapes.ts` 一致，两条铁律不要破）：
 * 1. 路径必须赋回 `this.path2D`；
 * 2. 路径坐标要扣掉 `state.localOrigin`（默认原点在组件中心）。
 *
 * 图标/标记统一用「描边」表达（`fill` 是元件底色、`stroke` 是 BPMN 边框色），
 * 需要实心效果时用「粗描边圆」这种技巧（如终止事件的实心圆），避免在同一路径里混合两种填充色。
 */
function createEmptyPath(component: any): any {
  const PathCtor = component.path2D && component.path2D.constructor;
  return PathCtor ? new PathCtor() : null;
}

/** 以组件中心为原点的局部坐标工具 */
function localBox(component: any) {
  const w = component.state.width;
  const h = component.state.height;
  return {
    w,
    h,
    x: 0 - component.state.localOrigin[0],
    y: 0 - component.state.localOrigin[1],
  };
}

/**
 * 事件（圆）：开始 / 中间 / 结束 + 触发类型图标。
 *
 * state.eventKind: 'start' | 'intermediate' | 'end'
 * state.trigger:   'none' | 'message' | 'timer' | 'error' | 'terminate'
 */
export class BpmnEventShape extends ICEPath {
  public static readonly typeId = 'BpmnEventShape';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    const kind = this.state.eventKind || 'start';

    // 外圈（所有事件都有）
    path.arc(cx, cy, r, 0, Math.PI * 2);
    if (kind === 'intermediate' || kind === 'end') {
      // 中间事件：外圈内再画一圈细线（双线）；结束事件：靠加粗描边表达（见 style.lineWidth）
      path.moveTo(cx + r * 0.84, cy);
      path.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
    }

    const trigger = this.state.trigger || 'none';
    if (trigger === 'message') {
      const bw = r * 1.1;
      const bh = r * 0.78;
      path.moveTo(cx - bw / 2, cy - bh / 2);
      path.lineTo(cx + bw / 2, cy - bh / 2);
      path.lineTo(cx + bw / 2, cy + bh / 2);
      path.lineTo(cx - bw / 2, cy + bh / 2);
      path.closePath();
      path.moveTo(cx - bw / 2, cy - bh / 2);
      path.lineTo(cx, cy + bh * 0.08);
      path.lineTo(cx + bw / 2, cy - bh / 2);
    } else if (trigger === 'timer') {
      const tr = r * 0.52;
      path.moveTo(cx + tr, cy);
      path.arc(cx, cy, tr, 0, Math.PI * 2);
      path.moveTo(cx, cy);
      path.lineTo(cx, cy - tr * 0.62);
      path.moveTo(cx, cy);
      path.lineTo(cx + tr * 0.5, cy);
    } else if (trigger === 'error') {
      path.moveTo(cx + r * 0.34, cy - r * 0.62);
      path.lineTo(cx - r * 0.42, cy + r * 0.06);
      path.lineTo(cx - r * 0.02, cy + r * 0.06);
      path.lineTo(cx - r * 0.3, cy + r * 0.66);
      path.lineTo(cx + r * 0.44, cy - r * 0.02);
      path.lineTo(cx + r * 0.04, cy - r * 0.02);
      path.closePath();
    } else if (trigger === 'terminate') {
      // 实心圆：用「粗描边的小圆」实现（描边色 = BPMN 边框色）
      path.moveTo(cx + r * 0.5, cy);
      path.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    }

    this.path2D = path;
    return this.path2D;
  }
}

/** 网关（菱形 + 内部符号）：排他 × / 并行 + / 包容 ○ / 事件网关（五边形） */
export class BpmnGatewayShape extends ICEPath {
  public static readonly typeId = 'BpmnGatewayShape';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;

    // 菱形
    path.moveTo(cx, cy - ry);
    path.lineTo(cx + rx, cy);
    path.lineTo(cx, cy + ry);
    path.lineTo(cx - rx, cy);
    path.closePath();

    const type = this.state.gatewayType || 'exclusive';
    const s = Math.min(rx, ry) * 0.42;
    if (type === 'exclusive') {
      path.moveTo(cx - s, cy - s);
      path.lineTo(cx + s, cy + s);
      path.moveTo(cx + s, cy - s);
      path.lineTo(cx - s, cy + s);
    } else if (type === 'parallel') {
      path.moveTo(cx - s, cy);
      path.lineTo(cx + s, cy);
      path.moveTo(cx, cy - s);
      path.lineTo(cx, cy + s);
    } else if (type === 'inclusive') {
      path.moveTo(cx + s, cy);
      path.arc(cx, cy, s, 0, Math.PI * 2);
    } else if (type === 'event') {
      // 事件网关：内部正五边形 + 小圆
      const pr = s * 1.15;
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = cx + Math.cos(angle) * pr;
        const py = cy + Math.sin(angle) * pr;
        if (i === 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      path.closePath();
    }

    this.path2D = path;
    return this.path2D;
  }
}

/** 任务类型角标（左上角小图标，尺寸固定 12×12，由节点定位） */
export class BpmnTaskIcon extends ICEPath {
  public static readonly typeId = 'BpmnTaskIcon';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    const type = this.state.taskType || 'none';

    if (type === 'user') {
      // 人像：头 + 肩
      path.moveTo(cx, cy - r);
      path.arc(cx, cy - r * 0.35, r * 0.34, 0, Math.PI * 2);
      path.moveTo(cx - r * 0.62, cy + r * 0.72);
      path.arc(cx, cy + r * 0.72, r * 0.62, Math.PI, 0);
    } else if (type === 'service') {
      // 齿轮：八齿 + 内圈
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth;
        const x1 = cx + Math.cos(a) * r * 0.55;
        const y1 = cy + Math.sin(a) * r * 0.55;
        const x2 = cx + Math.cos(a) * r;
        const y2 = cy + Math.sin(a) * r;
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      }
      path.moveTo(cx + r * 0.34, cy);
      path.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    } else if (type === 'script') {
      // 卷轴：矩形 + 底部波浪
      path.moveTo(cx - r * 0.7, cy - r * 0.85);
      path.lineTo(cx + r * 0.7, cy - r * 0.85);
      path.lineTo(cx + r * 0.7, cy + r * 0.5);
      path.moveTo(cx - r * 0.7, cy - r * 0.85);
      path.lineTo(cx - r * 0.7, cy + r * 0.5);
      path.moveTo(cx - r * 0.7, cy + r * 0.6);
      path.lineTo(cx - r * 0.25, cy + r * 0.85);
      path.lineTo(cx + r * 0.25, cy + r * 0.6);
      path.lineTo(cx + r * 0.7, cy + r * 0.85);
    } else if (type === 'send') {
      // 实心信封（粗描边信封）
      path.moveTo(cx - r * 0.85, cy - r * 0.55);
      path.lineTo(cx + r * 0.85, cy - r * 0.55);
      path.lineTo(cx + r * 0.85, cy + r * 0.55);
      path.lineTo(cx - r * 0.85, cy + r * 0.55);
      path.closePath();
      path.moveTo(cx - r * 0.85, cy - r * 0.55);
      path.lineTo(cx, cy + r * 0.12);
      path.lineTo(cx + r * 0.85, cy - r * 0.55);
    } else if (type === 'receive') {
      // 空心信封
      path.moveTo(cx - r * 0.85, cy - r * 0.55);
      path.lineTo(cx + r * 0.85, cy - r * 0.55);
      path.lineTo(cx + r * 0.85, cy + r * 0.55);
      path.lineTo(cx - r * 0.85, cy + r * 0.55);
      path.closePath();
    } else if (type === 'manual') {
      // 手动：一个向上开口的梯形
      path.moveTo(cx - r * 0.7, cy + r * 0.6);
      path.lineTo(cx - r * 0.45, cy - r * 0.5);
      path.lineTo(cx + r * 0.45, cy - r * 0.5);
      path.lineTo(cx + r * 0.7, cy + r * 0.6);
      path.closePath();
    }
    this.path2D = path;
    return this.path2D;
  }
}

/** 子流程折叠标记（底部居中的「+」小方块） */
export class BpmnSubprocessMarker extends ICEPath {
  public static readonly typeId = 'BpmnSubprocessMarker';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    // 小方框 + 十字
    path.moveTo(x, y);
    path.lineTo(x + w, y);
    path.lineTo(x + w, y + h);
    path.lineTo(x, y + h);
    path.closePath();
    path.moveTo(x + w / 2, y + h * 0.22);
    path.lineTo(x + w / 2, y + h * 0.78);
    path.moveTo(x + w * 0.22, y + h / 2);
    path.lineTo(x + w * 0.78, y + h / 2);
    this.path2D = path;
    return this.path2D;
  }
}

/** 数据对象：右上角折角矩形 */
export class BpmnDataObjectShape extends ICEPath {
  public static readonly typeId = 'BpmnDataObjectShape';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const fold = Math.min(14, w * 0.22, h * 0.32);
    path.moveTo(x, y);
    path.lineTo(x + w - fold, y);
    path.lineTo(x + w, y + fold);
    path.lineTo(x + w, y + h);
    path.lineTo(x, y + h);
    path.closePath();
    // 折角
    path.moveTo(x + w - fold, y);
    path.lineTo(x + w - fold, y + fold);
    path.lineTo(x + w, y + fold);
    this.path2D = path;
    return this.path2D;
  }
}

/**
 * 文本注释：**完整矩形** + 左侧内嵌的括号竖线（bpmn.io / Camunda 的标准画法）。
 *
 * 曾经画成「左括号 + 上下两条线、右侧开口」—— 那样右侧没有边框，看起来像个残缺的框；
 * BPMN 2.0 的文本注释是闭合矩形，左侧竖线只是括号装饰，四条边都要有。
 */
export class BpmnAnnotationShape extends ICEPath {
  public static readonly typeId = 'BpmnAnnotationShape';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const arm = Math.min(16, w * 0.3);
    // 外框（四条边）
    path.moveTo(x, y);
    path.lineTo(x + w, y);
    path.lineTo(x + w, y + h);
    path.lineTo(x, y + h);
    path.closePath();
    // 左侧括号：短臂 + 竖线 + 短臂
    path.moveTo(x + arm, y);
    path.lineTo(x, y);
    path.lineTo(x, y + h);
    path.lineTo(x + arm, y + h);
    this.path2D = path;
    return this.path2D;
  }
}

/**
 * 泳道 / 池：矩形 + 名称带分隔线。
 * `band` = 'left'（横向泳道，默认）| 'top'（池标题带）
 */
export class BpmnLaneShape extends ICEPath {
  public static readonly typeId = 'BpmnLaneShape';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    const bandSize = Math.min(this.state.bandSize || 30, w * 0.4, h * 0.4);
    path.moveTo(x, y);
    path.lineTo(x + w, y);
    path.lineTo(x + w, y + h);
    path.lineTo(x, y + h);
    path.closePath();
    if ((this.state.band || 'left') === 'top') {
      path.moveTo(x, y + bandSize);
      path.lineTo(x + w, y + bandSize);
    } else {
      path.moveTo(x + bandSize, y);
      path.lineTo(x + bandSize, y + h);
    }
    this.path2D = path;
    return this.path2D;
  }
}

/** 顺序流上的条件/默认标记（小菱形 / 斜杠），尺寸固定 14×14 */
export class BpmnFlowMarker extends ICEPath {
  public static readonly typeId = 'BpmnFlowMarker';

  protected createPathObject(): any {
    const { w, h, x, y } = localBox(this);
    const path = createEmptyPath(this);
    if (!path) {
      return this.path2D;
    }
    if ((this.state.markerType || 'conditional') === 'default') {
      path.moveTo(x + w * 0.2, y + h * 0.8);
      path.lineTo(x + w * 0.8, y + h * 0.2);
    } else {
      path.moveTo(x + w / 2, y);
      path.lineTo(x + w, y + h / 2);
      path.lineTo(x + w / 2, y + h);
      path.lineTo(x, y + h / 2);
      path.closePath();
    }
    this.path2D = path;
    return this.path2D;
  }
}
