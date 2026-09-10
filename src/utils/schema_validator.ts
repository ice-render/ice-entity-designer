export type SchemaIssue = {
  level: 'error' | 'warning';
  message: string;
  componentId?: string;
};

function isEntity(component: any): boolean {
  return component && component.constructor && component.constructor.name === 'Entity';
}

function isRelation(component: any): boolean {
  return component && component.constructor && component.constructor.name === 'Relation';
}

/**
 * 对当前画布做轻量 schema 校验。
 * 当前阶段不做完整 SQL 语义校验，只覆盖最常见的 ER 设计错误。
 */
export function validateSchema(componentList: any[]): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const entities = componentList.filter(isEntity);
  const relations = componentList.filter(isRelation);
  const entityNames = new Map<string, any[]>();

  entities.forEach((entity) => {
    const name = (entity.state.entityName || '').trim();
    if (!name) {
      issues.push({ level: 'error', message: '存在未命名的 Entity', componentId: entity.state.id });
      return;
    }

    if (!entityNames.has(name)) {
      entityNames.set(name, []);
    }
    entityNames.get(name).push(entity);

    const fields = entity.state.fields || [];
    if (fields.length === 0) {
      issues.push({ level: 'warning', message: `Entity "${name}" 没有任何字段`, componentId: entity.state.id });
    }

    const fieldNames = new Set<string>();
    fields.forEach((field: any) => {
      const fieldName = (field.name || '').trim();
      if (!fieldName) {
        issues.push({ level: 'error', message: `Entity "${name}" 存在未命名字段`, componentId: entity.state.id });
      } else if (fieldNames.has(fieldName)) {
        issues.push({
          level: 'error',
          message: `Entity "${name}" 存在重复字段 "${fieldName}"`,
          componentId: entity.state.id,
        });
      } else {
        fieldNames.add(fieldName);
      }

      if (!field.type) {
        issues.push({
          level: 'warning',
          message: `Entity "${name}" 的字段 "${fieldName || '(未命名)'}" 未设置类型`,
          componentId: entity.state.id,
        });
      }
    });
  });

  entityNames.forEach((list, name) => {
    if (list.length > 1) {
      issues.push({ level: 'error', message: `存在重复的 Entity 名称 "${name}"` });
    }
  });

  relations.forEach((relation) => {
    const links = relation.state.links || {};
    const startId = links.start && links.start.id;
    const endId = links.end && links.end.id;
    const relationType = relation.state.relationType;

    if (!startId || !endId) {
      issues.push({ level: 'error', message: '存在没有完整起点/终点的 Relation', componentId: relation.state.id });
      return;
    }

    const startExists = entities.some((entity: any) => entity.state.id === startId);
    const endExists = entities.some((entity: any) => entity.state.id === endId);
    if (!startExists || !endExists) {
      issues.push({ level: 'error', message: 'Relation 连接到了不存在的 Entity', componentId: relation.state.id });
    }

    if (!relationType) {
      issues.push({ level: 'error', message: 'Relation 未设置关系类型', componentId: relation.state.id });
    } else if (relationType === 'many-to-many' && !relation.state.joinTableName) {
      issues.push({
        level: 'warning',
        message: 'many-to-many 关系建议设置 joinTableName',
        componentId: relation.state.id,
      });
    }
  });

  return issues;
}
