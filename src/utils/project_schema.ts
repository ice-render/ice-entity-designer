import Entity from '../er-component/Entity';
import Relation from '../er-component/Relation';
import { ENTITY_DOCUMENT_FIELDS, RELATION_DOCUMENT_FIELDS, validateDocumentNode } from './project_codec';
import type { CodecField } from './project_codec';

export const PROJECT_SCHEMA_VERSION = 1;

/** 未知 / 自定义类型的最小通用检查（id 必填、typeId 出现时须为字符串） */
const GENERIC_FIELDS: CodecField[] = [
  { key: 'id', type: 'string', required: true },
  { key: 'typeId', type: 'string' },
];

export type ProjectSnapshotValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * 校验项目快照结构，供反序列化、AI Agent 生成数据和导入功能共用。
 *
 * 契约（务必保持）：**serializeProject() 的产物必须永远能通过本校验**。
 * 因此这里只校验「加载器需要的结构」，对库自身可能省略的可选值一律放行，
 * 仅在该值出现时校验类型：
 *   - 连线的端点可以只有 position 没有 id（createRelation() 允许不指定两端）；
 *   - 字段可以没有 name；
 *   - fields / relations 可以整体缺省（等价于空数组）。
 * 否则「保存 → 加载」与 undo/redo 的快照回放会自相矛盾：库自己产出的快照
 * 会被自己的加载器拒绝（并且失败的回放会连带关闭历史记录）。
 *
 * 节点的「形状」按**有效类型**判定：`typeId` 优先（载入时也按它分派），缺省时
 * 按所在数组归位（entities[] → Entity，relations[] → Relation）。因此
 * 「关系节点放在 entities[] 里」是合法的（只要它声明了 typeId），而未知 /
 * 自定义类型只做通用检查（id、typeId 类型），由载入阶段决定是否跳过。
 *
 * 这里只做结构级校验，不检查 Entity/Relation 之间的业务语义；
 * 业务语义由 validateSchema() 完成。结构契约与 project-snapshot.schema.json
 * 保持同步，方便 AI Agent 生成数据时对照。
 */
export function validateProjectSnapshot(data: any): ProjectSnapshotValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['root must be an object'] };
  }
  if (data.schemaVersion !== undefined && typeof data.schemaVersion !== 'number') {
    errors.push('schemaVersion must be a number when present');
  }
  if (!Array.isArray(data.entities)) {
    errors.push('entities must be an array');
  } else {
    data.entities.forEach((entity: any, index: number) => {
      validateNode(entity, `entities[${index}]`, Entity.typeId, errors);
    });
  }
  if (data.relations !== undefined && !Array.isArray(data.relations)) {
    errors.push('relations must be an array when present');
  } else if (Array.isArray(data.relations)) {
    data.relations.forEach((relation: any, index: number) => {
      validateNode(relation, `relations[${index}]`, Relation.typeId, errors);
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 校验单个节点。
 *
 * @param defaultTypeId 该节点没有 typeId 时，按所在数组推断出的类型
 */
function validateNode(node: any, prefix: string, defaultTypeId: string, errors: string[]): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  const effectiveTypeId: string = node.typeId === undefined ? defaultTypeId : node.typeId;
  // 字段定义与 serializeProject() 共用同一份 codec（见 utils/project_codec.ts）
  if (effectiveTypeId === Entity.typeId) {
    validateDocumentNode(node, prefix, ENTITY_DOCUMENT_FIELDS, errors);
    return;
  }
  if (effectiveTypeId === Relation.typeId) {
    validateDocumentNode(node, prefix, RELATION_DOCUMENT_FIELDS, errors);
    return;
  }
  // 其它类型（下游注册的自定义图元、未注册类型）只做通用检查，
  // 未注册的由载入阶段跳过并记入 loadProject() 的 unknownTypes。
  validateDocumentNode(node, prefix, GENERIC_FIELDS, errors);
}
