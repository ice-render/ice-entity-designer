export const PROJECT_SCHEMA_VERSION = 1;

export type ProjectSnapshotValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * 校验项目快照结构，供反序列化、AI Agent 生成数据和导入功能共用。
 *
 * 这里只做结构级校验，不检查 Entity/Relation 之间的业务语义；
 * 业务语义由 validateSchema() 完成。
 */
export function validateProjectSnapshot(data: any): ProjectSnapshotValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['root must be an object'] };
  }
  if (data.schemaVersion !== undefined && typeof data.schemaVersion !== 'number') {
    errors.push('schemaVersion must be a number');
  }
  if (!Array.isArray(data.entities)) {
    errors.push('entities must be an array');
  } else {
    data.entities.forEach((entity: any, index: number) => {
      const prefix = `entities[${index}]`;
      if (!entity || typeof entity !== 'object') {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof entity.id !== 'string') errors.push(`${prefix}.id must be a string`);
      if (typeof entity.entityName !== 'string') errors.push(`${prefix}.entityName must be a string`);
      if (!Array.isArray(entity.fields)) {
        errors.push(`${prefix}.fields must be an array`);
      } else {
        entity.fields.forEach((field: any, fieldIndex: number) => {
          if (!field || typeof field !== 'object') {
            errors.push(`${prefix}.fields[${fieldIndex}] must be an object`);
          } else if (typeof field.name !== 'string') {
            errors.push(`${prefix}.fields[${fieldIndex}].name must be a string`);
          }
        });
      }
    });
  }
  if (!Array.isArray(data.relations)) {
    errors.push('relations must be an array');
  } else {
    data.relations.forEach((relation: any, index: number) => {
      const prefix = `relations[${index}]`;
      if (!relation || typeof relation !== 'object') {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof relation.id !== 'string') errors.push(`${prefix}.id must be a string`);
      if (!relation.links || typeof relation.links !== 'object') {
        errors.push(`${prefix}.links must be an object`);
      } else {
        ['start', 'end'].forEach((terminal) => {
          const link = relation.links[terminal];
          if (!link || typeof link !== 'object') {
            errors.push(`${prefix}.links.${terminal} must be an object`);
          } else {
            if (typeof link.id !== 'string') errors.push(`${prefix}.links.${terminal}.id must be a string`);
            if (typeof link.position !== 'string') errors.push(`${prefix}.links.${terminal}.position must be a string`);
          }
        });
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
