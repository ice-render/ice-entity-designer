/**
 * 组件类型的判定工具。
 *
 * **为什么不用 `constructor.name`**：消费者的打包器会压缩类名。
 * 实测 webpack 生产构建（terser 默认配置）下 `Entity` / `Relation` 会被 mangle 成 `Dr` / `Br`，
 * 于是所有 `xxx.constructor.name === 'Entity'` 的判断全部**静默失效**：
 * `designer.entities` 恒为空、`updateEntity`/`updateRelation`/`removeComponent` 变成 no-op、
 * `toSchemaObject`/`validate` 返回空、undo/redo 恢复选中失效，而页面**不报任何错**。
 * 更隐蔽的是：开发态不压缩、包自身构建（rollup 配了 `keep_classnames`）也都保留类名，
 * 所以这个缺陷在包自己的测试与示例里永远看不出来，只在被下游打包时才现形。
 *
 * 因此判型统一走 `Entity.typeId` / `Relation.typeId` 这个**稳定标识**（属性名默认不被压缩，
 * 子类亦继承）。这样既压缩安全，又保留了「纯函数吃普通对象」的接缝：
 * `toSchemaObject` / `validateSchema` 只依赖 `toEntityObject()` 与 `state`，
 * 单测可以继续喂轻量的鸭子类型对象（见 tests/serialization.test.ts）。
 *
 * 若组件来自**另一份包副本**（dual package），`typeId` 依然有效（`instanceof` 则不行）。
 */
import Entity from '../er-component/Entity';
import Relation from '../er-component/Relation';

function typeIdOf(component: any): string | undefined {
  const ctor = component && component.constructor;
  // 真实实例的 constructor 是「类」（typeof 'function'），鸭子类型对象的 constructor 是普通对象，
  // 两者都要接受 —— 统一只要求 typeId 是字符串。
  return ctor && typeof ctor.typeId === 'string' ? ctor.typeId : undefined;
}

/** 是否为实体组件（含其子类） */
export function isEntity(component: any): boolean {
  return typeIdOf(component) === Entity.typeId;
}

/** 是否为关系（连线）组件（含其子类） */
export function isRelation(component: any): boolean {
  return typeIdOf(component) === Relation.typeId;
}
