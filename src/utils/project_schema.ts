export const PROJECT_SCHEMA_VERSION = 1;

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
      const prefix = `entities[${index}]`;
      if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof entity.id !== 'string') errors.push(`${prefix}.id must be a string`);
      if (typeof entity.entityName !== 'string') errors.push(`${prefix}.entityName must be a string`);
      if (entity.fields !== undefined && !Array.isArray(entity.fields)) {
        errors.push(`${prefix}.fields must be an array when present`);
      } else if (Array.isArray(entity.fields)) {
        entity.fields.forEach((field: any, fieldIndex: number) => {
          if (!field || typeof field !== 'object' || Array.isArray(field)) {
            errors.push(`${prefix}.fields[${fieldIndex}] must be an object`);
          } else if (field.name !== undefined && typeof field.name !== 'string') {
            errors.push(`${prefix}.fields[${fieldIndex}].name must be a string when present`);
          }
        });
      }
    });
  }
  if (data.relations !== undefined && !Array.isArray(data.relations)) {
    errors.push('relations must be an array when present');
  } else if (Array.isArray(data.relations)) {
    data.relations.forEach((relation: any, index: number) => {
      const prefix = `relations[${index}]`;
      if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof relation.id !== 'string') errors.push(`${prefix}.id must be a string`);
      if (relation.links === undefined) {
        return;
      }
      if (!relation.links || typeof relation.links !== 'object' || Array.isArray(relation.links)) {
        errors.push(`${prefix}.links must be an object when present`);
        return;
      }
      ['start', 'end'].forEach((terminal) => {
        const link = relation.links[terminal];
        if (link === undefined) {
          return;
        }
        if (!link || typeof link !== 'object' || Array.isArray(link)) {
          errors.push(`${prefix}.links.${terminal} must be an object when present`);
          return;
        }
        if (link.id !== undefined && typeof link.id !== 'string') {
          errors.push(`${prefix}.links.${terminal}.id must be a string when present`);
        }
        if (link.position !== undefined && typeof link.position !== 'string') {
          errors.push(`${prefix}.links.${terminal}.position must be a string when present`);
        }
      });
    });
  }
  return { valid: errors.length === 0, errors };
}
