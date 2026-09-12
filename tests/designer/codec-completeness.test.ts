/**
 * 项目快照 codec 的**完整性约束**。
 *
 * 目的：消灭「新增了 state 字段，却忘了写进快照」这类静默丢数据 bug
 * （历史上已经发生过两次：连线 style/labelStyle、FlowNode 文字颜色）。
 *
 * 两条约束：
 * 1. 每个 state 键必须被 codec 覆盖，或明确登记为「运行时派生 / 构造默认」；
 * 2. 往返（serializeProject → loadProject）后，state 逐键一致（派生字段除外）。
 */
import { ICE, EventBus } from 'ice-render';
import EntityDesigner from '../../src/designer/EntityDesigner';
import {
  CONSTRUCTOR_DEFAULT_STATE_KEYS,
  DERIVED_STATE_KEYS,
  ENTITY_DOCUMENT_FIELDS,
  RELATION_DOCUMENT_FIELDS,
  uncoveredStateKeys,
} from '../../src/utils/project_codec';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer: any = new EntityDesigner(ice);
  return { ice, designer };
}

const IGNORED = new Set([...DERIVED_STATE_KEYS, ...CONSTRUCTOR_DEFAULT_STATE_KEYS]);

/** state → 可比较的纯 JSON（剔除派生字段） */
function comparableState(state: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key in state) {
    if (!IGNORED.has(key)) {
      out[key] = state[key];
    }
  }
  return JSON.parse(JSON.stringify(out));
}

function entityProps() {
  return {
    entityName: 'Пользователь',
    fields: [
      { name: 'id', type: 'number', primary: true, autoIncrement: true, nullable: false },
      { name: 'email', type: 'string', length: 128, unique: true },
    ],
    left: 42,
    top: 24,
    width: 320,
    height: 260,
    style: { fillStyle: '#ffffff', strokeStyle: '#334155', lineWidth: 1.5, radius: 8 },
    headerStyle: { textColor: '#0f172a', backgroundColor: '#f1f5f9', fontSize: 18 },
    fieldStyle: { textColor: '#334155', fontSize: 16 },
    dividerStyle: { strokeStyle: '#cbd5e1', lineWidth: 1 },
    display: true,
    zIndex: 7,
    opacity: 0.85, // 引擎 1.3 的字段：正是完整性测试要盯住的那类新增项
    // 应用层自定义 JSON（透传键）
    data: { kind: 'aggregate', tags: ['er', 'core'], owner: { team: 'data' } },
  };
}

function relationProps(sourceId: string, targetId: string) {
  return {
    relationType: 'one-to-many',
    sourceId,
    targetId,
    sourceField: 'id',
    targetField: 'ownerId',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    joinTableName: 'user_roles',
    label: '1 : N  (ON DELETE CASCADE)',
    labelStyle: { fontSize: 14, backgroundColor: '#ffffff' },
    style: { strokeStyle: '#334155', lineWidth: 2 },
    routeType: 'orthogonal',
    routeOffset: 24,
    curveType: 'straight',
    linkShape: 'bezier',
    lineWidth: 2,
    arrowLength: 12,
    arrowAngel: 0.4,
    arrowStyle: 'hollow',
    opacity: 0.6,
    data: { semantic: 'fk', note: '自定义元数据' },
  };
}

describe('项目快照 codec 完整性', () => {
  it('每个 state 键都被 codec 覆盖，或明确登记为运行时/默认值字段', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity(entityProps());
    const relation = designer.createRelation(relationProps(entity.state.id, entity.state.id));

    // 返回非空就说明「新增了 state 字段但没登记」——请补 project_codec.ts
    expect(uncoveredStateKeys(entity.state, ENTITY_DOCUMENT_FIELDS)).toEqual([]);
    expect(uncoveredStateKeys(relation.state, RELATION_DOCUMENT_FIELDS)).toEqual([]);
  });

  it('往返后 Entity 的 state 逐键一致（派生字段除外），自定义 data 原样保留', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity(entityProps());
    const before = comparableState(entity.state);

    const json = designer.serializeProject();
    // 自定义 data 必须出现在文档里
    expect(JSON.parse(json).entities[0].data).toEqual(entityProps().data);

    designer.loadProject(json);
    const after = comparableState(designer.entities[0].state);
    expect(after).toEqual(before);
    expect(after.data).toEqual(entityProps().data);
  });

  it('往返后 Relation 的 state 逐键一致（派生字段除外），自定义 data 原样保留', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation(relationProps(a.state.id, b.state.id));
    const before = comparableState(relation.state);

    const json = designer.serializeProject();
    expect(JSON.parse(json).relations[0].data).toEqual(relationProps(a.state.id, b.state.id).data);

    designer.loadProject(json);
    const after = comparableState(designer.relations[0].state);
    expect(after).toEqual(before);
  });

  it('自定义 data 不影响校验，且非法结构仍被拒', () => {
    const { designer } = makeDesigner();
    designer.createEntity({ entityName: 'A', data: { any: ['json', 1, true, null] } });
    const json = designer.serializeProject();
    expect(() => designer.loadProject(json)).not.toThrow();
    // data 是透传键：类型随意（number/array/null 都行）
    const payload = JSON.parse(json);
    payload.entities[0].data = 42;
    expect(() => designer.loadProject(JSON.stringify(payload))).not.toThrow();
  });
});
