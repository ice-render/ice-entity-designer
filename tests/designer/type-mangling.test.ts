/**
 * 「类型判定的压缩改名」回归。
 *
 * 背景：EntityDesigner / schema_validator / serialization_util 曾用
 * `component.constructor.name === 'Entity'` 判类型。消费者打包时会 mangle 类名
 * （实测 webpack 生产构建下 Entity / Relation 变成 Dr / Br），于是这些判断**全部静默失效**：
 * `designer.entities` 恒为空、`updateEntity` / `updateRelation` / `removeComponent` 变成 no-op、
 * `toSchemaObject` / `validate` 返回空、undo/redo 恢复选中失效，而页面不报任何错。
 *
 * 为什么包内测试以前发现不了：开发态不压缩，包自身的 rollup 构建又配了
 * `keep_classnames: true`，两处都保留类名；只有**下游的打包器**才会改名。
 * 因此这里显式把类名改成 mangle 后的样子来锁住这个契约。
 */
import { ICE, EventBus, ICEGroup } from 'ice-render';
import EntityDesigner from '../../src/designer/EntityDesigner';
import Entity from '../../src/er-component/Entity';
import Relation from '../../src/er-component/Relation';

const entityNameDesc = Object.getOwnPropertyDescriptor(Entity, 'name') as PropertyDescriptor;
const relationNameDesc = Object.getOwnPropertyDescriptor(Relation, 'name') as PropertyDescriptor;

/** 模拟 terser mangle：改掉类的 name，但构造函数的身份（同一引用）不变 */
function mangleClassNames(): void {
  Object.defineProperty(Entity, 'name', { value: 'Dr', configurable: true });
  Object.defineProperty(Relation, 'name', { value: 'Br', configurable: true });
}

function restoreClassNames(): void {
  Object.defineProperty(Entity, 'name', entityNameDesc);
  Object.defineProperty(Relation, 'name', relationNameDesc);
}

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer: any = new EntityDesigner(ice);
  return { ice, designer };
}

beforeAll(mangleClassNames);
afterAll(restoreClassNames);

describe('类名被 mangle 后（模拟下游生产构建）', () => {
  it('前置：改名确实生效（否则本文件的其他断言都是空转）', () => {
    expect(Entity.name).toBe('Dr');
    expect(Relation.name).toBe('Br');
    // 改的只是 name，构造身份没变
    expect(new Entity({ entityName: 'X' })).toBeInstanceOf(Entity);
  });

  it('entities / relations 仍能识别出实体与关系', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'User' });
    // 只比较 id：组件对象内部有循环引用（parentNode / ice 等），toEqual 深比较会拖垮 jest
    expect(designer.entities.map((c: any) => c.state.id)).toEqual([entity.state.id]);
    expect(designer.relations).toHaveLength(0);

    const second = designer.createEntity({ entityName: 'Role', left: 300 });
    const relation = designer.createRelation({
      sourceId: entity.state.id,
      targetId: second.state.id,
      relationType: 'one-to-many',
    });
    expect(designer.entities).toHaveLength(2);
    expect(designer.relations.map((c: any) => c.state.id)).toEqual([relation.state.id]);
  });

  it('updateEntity / updateRelation 仍然生效（旧写法会静默 no-op）', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'User' });
    const second = designer.createEntity({ entityName: 'Role', left: 300 });
    const relation = designer.createRelation({
      sourceId: entity.state.id,
      targetId: second.state.id,
      relationType: 'one-to-many',
      title: 'has',
    });

    designer.updateEntity(entity.state.id, { entityName: 'Customer' });
    expect(entity.state.entityName).toBe('Customer');

    // 标签是按关系类型推导出来的（基数写法），换类型后必须随之改变
    const before = relation.state.label;
    designer.updateRelation(relation.state.id, { relationType: 'many-to-many' });
    expect(relation.state.relationType).toBe('many-to-many');
    expect(relation.state.label).not.toBe(before);
    expect(relation.state.label).toBe(Relation.buildLabel(relation.state, 'many-to-many'));
  });

  it('removeComponent 删除实体时仍级联删除其连线（旧写法会留下悬空关系）', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B', left: 300 });
    const relation = designer.createRelation({
      sourceId: a.state.id,
      targetId: b.state.id,
      relationType: 'one-to-many',
    });

    designer.removeComponent(a.state.id);
    expect(designer.entities).toHaveLength(1);
    expect(designer.relations).toHaveLength(0);
    expect(designer.ice.findComponent(relation.state.id)).toBeFalsy();
  });

  it('toSchemaObject / validate 仍按类型分拣', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'User', fields: [{ name: 'id', type: 'number' }] });
    const b = designer.createEntity({ entityName: 'Role', left: 300, fields: [{ name: 'id', type: 'number' }] });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id, relationType: 'one-to-many' });

    const schema: any = designer.toSchemaObject();
    expect(schema.map((item: any) => item.name).sort()).toEqual(['Role', 'User']);

    // 校验能识别「重复实体名」这类只有分拣成功才可能报出的问题
    designer.updateEntity(b.state.id, { entityName: 'User' });
    expect(designer.validate().some((issue: any) => issue.message.includes('重复的 Entity 名称'))).toBe(true);
  });

  it('serializeProject / loadProject 往返仍然完整', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'User' });
    const b = designer.createEntity({ entityName: 'Role', left: 300 });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id, relationType: 'one-to-many' });

    const snapshot = designer.serializeProject();
    const parsed = JSON.parse(snapshot);
    expect(parsed.entities).toHaveLength(2);
    expect(parsed.relations).toHaveLength(1);

    const { designer: fresh } = makeDesigner();
    fresh.loadProject(snapshot);
    expect(fresh.entities).toHaveLength(2);
    expect(fresh.relations).toHaveLength(1);
  });

  it('画布内子组件被点击时仍能回溯到根组件并选中', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'User' });
    // 模拟点到实体内部的子图元（例如字段文本）
    const inner = new ICEGroup({});
    entity.addChild(inner);
    designer.ice.addChild(entity);

    designer.select(null);
    (designer as any).__handleMouseDown({ param: { component: inner } });
    expect(designer.selectedId).toBe(entity.state.id);
  });
});

describe('类型判定的语义', () => {
  it('子类仍算作 Entity（typeId 可继承，按类名判断做不到）', () => {
    class CustomEntity extends Entity {}
    const { designer } = makeDesigner();
    const custom = new CustomEntity({ entityName: 'Custom' });
    designer.ice.addChild(custom);
    expect(designer.entities.map((c: any) => c.state.id)).toEqual([custom.state.id]);
  });
});
