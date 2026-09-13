/**
 * ice-entity-designer 的类型注册命名空间。
 *
 * typeId 统一为 `ice-entity-designer:Type`（引擎侧只认 `namespace:Type` 一种形式，
 * 不做「旧的无 namespace 类名」兼容 —— 家族仍在发布初期，改名比养一套别名简单）。
 */
export const IED_NAMESPACE = 'ice-entity-designer';

export function iedTypeId(type: string): string {
  return `${IED_NAMESPACE}:${type}`;
}

export function registerIEDType(ice: any, Clazz: { typeId: string }): void {
  ice.registerType(Clazz.typeId, Clazz as any);
}
