/**
 * React 绑定层的类型定义。
 */
import type { EntityDesigner } from '../index';

export type EntityDesignerChangePayload = {
  /** 项目快照，等价于 designer.serializeProject() 的结果 */
  snapshot: string;
  /** 当前 TypeORM Schema（toSchemaObject 的结果） */
  schema: object;
};

export type EntityDesignerHandle = {
  /** 底层 ICE 实例（卸载后为 null） */
  ice: any;
  /** 底层 EntityDesigner 实例（卸载后为 null） */
  designer: EntityDesigner | null;
  addEntity(props?: any): any;
  connect(props: any): any;
  updateEntity(id: string, patch: any): any;
  updateRelation(id: string, patch: any): any;
  remove(id: string): void;
  loadProject(json: string): void;
  undo(): void;
  redo(): void;
  toSchemaObject(): object;
  toSchemaString(): string;
  validate(): any[];
  serializeProject(): string;
};

export type EntityDesignerCanvasProps = {
  /** 初始项目快照（非受控）：等价于 loadProject(defaultValue) */
  defaultValue?: string;
  /** 渲染模式，默认 dirty-rect */
  renderMode?: 'dirty-rect' | 'full';
  /** 模型变更回调（增删改 / 载入 / undo / redo 之后触发） */
  onChange?: (payload: EntityDesignerChangePayload) => void;
  /** 实例就绪回调 */
  onReady?: (handle: EntityDesignerHandle) => void;
  className?: string;
  /** 容器内联样式（与 width/height 合并） */
  style?: any;
  /** 画布宽高（像素），同时作为容器尺寸，默认 1200 x 800 */
  width?: number;
  height?: number;
  /** 子节点渲染在上下文内部，可直接使用 useEntityDesigner() */
  children?: any;
};
