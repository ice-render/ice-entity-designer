/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export { default as Entity } from './er-component/Entity';
export { default as Relation } from './er-component/Relation';
export { default as EntityDesigner } from './designer/EntityDesigner';
export { toSchemaObject, toSchemaString } from './utils/serialization_util';
export { validateSchema } from './utils/schema_validator';

/**
 * 引擎内核（ice-render）在构建时已被打包进本包，这里一并导出。
 *
 * 调用方只需安装 ice-entity-designer 一个包即可：
 *
 * ```js
 * import { ICE, EntityDesigner } from 'ice-entity-designer';
 * const ice = new ICE().init(canvas);
 * const designer = new EntityDesigner(ice);
 * ```
 *
 * 之所以在这里再导出一次（而不是让调用方各自安装 ice-render），是为了保证
 * ICE 实例与 Entity / Relation 组件来自**同一份内核实例**，避免两份内核导致的类型不匹配。
 */
export * from 'ice-render';
