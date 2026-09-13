import { validateSchema } from '../src/utils/schema_validator';

function entity(id: string, name: string, fields: any[] = []) {
  // 判型走稳定 typeId，不依赖类名（下游压缩会 mangle 类名）
  return { constructor: { typeId: 'ice-entity-designer:Entity' }, state: { id, entityName: name, fields } };
}

function relation(id: string, startId: string, endId: string, relationType = 'one-to-many', extra: any = {}) {
  return {
    constructor: { typeId: 'ice-entity-designer:Relation' },
    state: {
      id,
      relationType,
      links: { start: { id: startId }, end: { id: endId } },
      ...extra,
    },
  };
}

describe('schema 校验', () => {
  it('健康 schema 返回空问题列表', () => {
    const issues = validateSchema([
      entity('e1', 'User', [{ name: 'id', type: 'number' }]),
      entity('e2', 'Role', [{ name: 'id', type: 'number' }]),
      relation('r1', 'e1', 'e2'),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('能发现重复实体名和重复字段', () => {
    const issues = validateSchema([
      entity('e1', 'User', [
        { name: 'id', type: 'number' },
        { name: 'id', type: 'string' },
      ]),
      entity('e2', 'User', [{ name: 'id', type: 'number' }]),
    ]);
    expect(issues.some((item) => item.message.includes('重复字段'))).toBe(true);
    expect(issues.some((item) => item.message.includes('重复的 Entity 名称'))).toBe(true);
  });

  it('能发现悬空关系和 many-to-many 缺少 joinTableName', () => {
    const issues = validateSchema([
      entity('e1', 'User', [{ name: 'id', type: 'number' }]),
      entity('e2', 'Role', [{ name: 'id', type: 'number' }]),
      relation('r1', 'e1', 'missing'),
      relation('r2', 'e1', 'e2', 'many-to-many'),
    ]);
    expect(issues.some((item) => item.message.includes('不存在的 Entity'))).toBe(true);
    expect(issues.some((item) => item.message.includes('joinTableName'))).toBe(true);
  });
});
