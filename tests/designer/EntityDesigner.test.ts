/**
 * EntityDesigner：应用层核心闭环（创建/更新/删除、关系连线、schema、序列化、undo/redo、订阅）。
 *
 * 这里刻意使用**真实引擎**（ice-render）而不是 mock：应用层的问题往往出在「应用逻辑 × 引擎语义」
 * 的接缝上（连线宿主的生命周期、递归查找、序列化 typeId、视口/包围盒……），mock 掉的恰恰是这些。
 * 引擎在 node 下可跑：`root.requestFrame` 有定时器兜底、Path2D 走 PolyfillPath2D。
 *
 * 注意：node 没有 DOM，文本量测走降级路径（拿不到真实字形宽度），因此断言只覆盖
 * **结构 / 标识 / 标签 / 快照** 等确定性行为，不断言像素或精确文本宽高。
 */
import { ICE, EventBus, ICERect } from 'ice-render';
import EntityDesigner from '../../src/designer/EntityDesigner';
import Entity from '../../src/er-component/Entity';
import Relation from '../../src/er-component/Relation';

function makeDesigner() {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  const designer: any = new EntityDesigner(ice);
  return { ice, designer };
}

function names(list: any[]): string[] {
  return list.map((item) => item.state.entityName);
}

describe('EntityDesigner 构造与类型注册', () => {
  it('构造时注册 Entity/Relation 并订阅 mousedown', () => {
    const { ice, designer } = makeDesigner();
    expect(designer.ice).toBe(ice);
    // 序列化依赖「构造函数 → 注册名」反查
    expect(ice.getTypeId(Entity)).toBe('Entity');
    expect(ice.getTypeId(Relation)).toBe('Relation');
    expect((ice.evtBus.listeners['mousedown'] || []).length).toBe(1);
  });

  it('entities / relations 只统计顶层对应类型（忽略其它图元）', () => {
    const { ice, designer } = makeDesigner();
    expect(designer.entities).toEqual([]);
    expect(designer.relations).toEqual([]);

    const entity = designer.createEntity();
    ice.addChild(new ICERect({ width: 10, height: 10 }));
    expect(designer.entities).toEqual([entity]);
    expect(designer.relations).toEqual([]);
  });
});

describe('EntityDesigner 创建', () => {
  it('createEntity 使用默认值、自动错开位置、自动选中并通知订阅者', () => {
    const { designer } = makeDesigner();
    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));

    const first = designer.createEntity();
    expect(first.constructor.name).toBe('Entity');
    expect(first.state.entityName).toBe('NewEntity');
    expect(first.state.fields).toEqual([]);
    expect([first.state.left, first.state.top]).toEqual([120, 120]);
    expect(designer.selectedId).toBe(first.state.id);
    expect(seen.length).toBe(1);
    expect(JSON.parse(seen[0]).entities.length).toBe(1);

    const second = designer.createEntity({
      entityName: 'User',
      fields: [{ name: 'id', type: 'number', primary: true }],
    });
    expect(second.state.entityName).toBe('User');
    expect(second.state.fields).toEqual([{ name: 'id', type: 'number', primary: true }]);
    // 位置随数量错开（4 列栅格）
    expect([second.state.left, second.state.top]).toEqual([120 + 220, 120]);
    // 第 5 个换行
    designer.createEntity();
    designer.createEntity();
    const fifth = designer.createEntity();
    expect([fifth.state.left, fifth.state.top]).toEqual([120, 120 + 260]);
  });

  it('createRelation 按插槽计算端点、生成基数标签与箭头，并选中新连线', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });

    const relation = designer.createRelation({
      relationType: 'one-to-many',
      sourceId: a.state.id,
      targetId: b.state.id,
    });

    expect(relation.constructor.name).toBe('Relation');
    expect(relation.state.relationType).toBe('one-to-many');
    expect(relation.state.arrow).toBe('end');
    expect(relation.state.label).toBe('1 : N');
    expect(relation.state.links.start).toEqual({ id: a.state.id, position: 'R' });
    expect(relation.state.links.end).toEqual({ id: b.state.id, position: 'L' });
    // 端点由宿主包围盒推导（node 下文本量测降级，但仍是合法的两点坐标）
    expect(relation.state.startPoint.length).toBe(2);
    expect(relation.state.endPoint.length).toBe(2);
    expect(designer.selectedId).toBe(relation.state.id);
    expect(designer.relations.length).toBe(1);
  });

  it('createRelation 接受语义化插槽名（top/right/...）并归一化为单字母', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });

    const relation = designer.createRelation({
      sourceId: a.state.id,
      targetId: b.state.id,
      startPosition: 'right',
      endPosition: 'bottom',
    });

    expect(relation.state.links.start.position).toBe('R');
    expect(relation.state.links.end.position).toBe('B');
  });

  it('createRelation 缺少端点 id 时不抛错（端点回落到默认值）', () => {
    const { designer } = makeDesigner();
    const relation = designer.createRelation({ relationType: 'many-to-many' });
    expect(relation.state.relationType).toBe('many-to-many');
    expect(relation.state.label).toBe('N : N');
    expect(relation.state.startPoint).toEqual([0, 0]);
    expect(relation.state.endPoint).toEqual([10, 10]);
  });

  it('createRelation 把 onDelete/onUpdate 写进标签', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation({
      relationType: 'one-to-many',
      sourceId: a.state.id,
      targetId: b.state.id,
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT',
    });
    expect(relation.state.label).toBe('1 : N  (ON DELETE CASCADE, ON UPDATE RESTRICT)');
  });
});

describe('EntityDesigner 更新与删除', () => {
  it('updateEntity 改名后内部标题组件同步，并通知订阅者', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'Old' });
    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));

    const updated = designer.updateEntity(entity.state.id, { entityName: 'Renamed' });

    expect(updated).toBe(entity);
    expect(entity.state.entityName).toBe('Renamed');
    expect((entity as any).entityNameComponent.state.text).toBe('Renamed');
    expect(seen.length).toBe(1);
  });

  it('updateEntity 对非 Entity 的 id 不改动、不通知', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });
    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));

    const result = designer.updateEntity(relation.state.id, { entityName: 'Nope' });

    expect(result).toBe(relation);
    expect(seen.length).toBe(0);
  });

  it('updateRelation 依据合并后的 state 重算标签', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation({
      relationType: 'one-to-many',
      sourceId: a.state.id,
      targetId: b.state.id,
    });

    designer.updateRelation(relation.state.id, { relationType: 'many-to-many' });
    expect(relation.state.label).toBe('N : N');

    designer.updateRelation(relation.state.id, { onDelete: 'CASCADE' });
    expect(relation.state.label).toBe('N : N  (ON DELETE CASCADE)');
  });

  it('删除实体时级联删除其连线（不留悬空关系）', () => {
    const { ice, designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });

    designer.removeComponent(a.state.id);

    expect(names(designer.entities)).toEqual(['B']);
    expect(designer.relations.length).toBe(0);
    expect(ice.findComponent(relation.state.id)).toBeUndefined();
    expect(ice.findComponent(a.state.id)).toBeUndefined();
  });

  it('单独删除连线只影响连线本身', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    const relation = designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });

    designer.removeComponent(relation.state.id);

    expect(names(designer.entities).sort()).toEqual(['A', 'B']);
    expect(designer.relations.length).toBe(0);
  });

  it('删除选中组件后清空 selectedId；未知 id 为无操作', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'A' });
    expect(designer.selectedId).toBe(entity.state.id);

    designer.removeComponent(entity.state.id);
    expect(designer.selectedId).toBeNull();

    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));
    designer.removeComponent('not-exist');
    expect(seen.length).toBe(0);
  });
});

describe('EntityDesigner schema 与序列化', () => {
  it('toSchemaObject/String 反映实体与关系，validate 可运行', () => {
    const { designer } = makeDesigner();
    const user = designer.createEntity({
      entityName: 'User',
      fields: [
        { name: 'id', type: 'number', primary: true, autoIncrement: true },
        { name: 'name', type: 'varchar', length: 64, nullable: false },
      ],
    });
    const order = designer.createEntity({
      entityName: 'Order',
      fields: [{ name: 'id', type: 'number', primary: true }],
    });
    designer.createRelation({ relationType: 'one-to-many', sourceId: user.state.id, targetId: order.state.id });

    // 契约：toSchemaObject 返回**数组**（每个实体一项），不是以 id 为键的字典
    const schema: any = designer.toSchemaObject();
    expect(Array.isArray(schema)).toBe(true);
    expect(schema.map((table: any) => table.name).sort()).toEqual(['Order', 'User']);

    const userTable = schema.find((table: any) => table.name === 'User');
    expect(userTable.columns.id.primary).toBe(true);
    expect(userTable.columns.id.strategy).toBe('increment');
    expect(userTable.columns.name.nullable).toBe(false);
    // 关系被挂到 source 一侧
    expect(userTable.relations).toBeTruthy();
    expect(Object.keys(userTable.relations).length).toBeGreaterThan(0);

    const issues = designer.validate();
    expect(Array.isArray(issues)).toBe(true);
    expect(designer.toSchemaString()).toBe(JSON.stringify(schema));
  });

  it('serializeProject 产出可解析的版本化快照', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A', left: 10, top: 20 });
    const b = designer.createEntity({ entityName: 'B' });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });

    const payload = JSON.parse(designer.serializeProject());

    expect(payload.version).toBe(1);
    expect(payload.entities.map((e: any) => e.entityName)).toEqual(['A', 'B']);
    expect(payload.entities[0]).toMatchObject({ id: a.state.id, left: 10, top: 20 });
    expect(payload.relations.length).toBe(1);
    expect(payload.relations[0].links.start.id).toBe(a.state.id);
  });

  it('loadProject 替换现有内容并保持 round-trip 稳定', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });
    const json = designer.serializeProject();

    designer.loadProject(json);
    const afterFirst = designer.serializeProject();
    designer.loadProject(afterFirst);
    const afterSecond = designer.serializeProject();

    expect(names(designer.entities)).toEqual(['A', 'B']);
    expect(designer.relations.length).toBe(1);
    expect(designer.selectedId).toBeNull();
    // 二次 round-trip 结果稳定（id / 类型 / 连线关系都不漂移）
    expect(afterSecond).toBe(afterFirst);
  });

  it('loadProject 空值 / 非法内容为无操作', () => {
    const { designer } = makeDesigner();
    designer.createEntity({ entityName: 'Keep' });
    designer.loadProject('');
    designer.loadProject('{"nope":true}');
    expect(names(designer.entities)).toEqual(['Keep']);
  });
});

describe('EntityDesigner 历史（undo / redo）', () => {
  it('undo 回到上一个状态，redo 再前进，且栈状态正确', () => {
    const { designer } = makeDesigner();
    designer.createEntity({ entityName: 'A' });
    designer.createEntity({ entityName: 'B' });

    expect(designer.canUndo()).toBe(true);
    expect(designer.canRedo()).toBe(false);

    designer.undo();
    expect(names(designer.entities)).toEqual(['A']);
    expect(designer.canRedo()).toBe(true);

    designer.redo();
    expect(names(designer.entities)).toEqual(['A', 'B']);
    expect(designer.canRedo()).toBe(false);
  });

  it('undo/redo 也能还原删除与关系', () => {
    const { designer } = makeDesigner();
    const a = designer.createEntity({ entityName: 'A' });
    const b = designer.createEntity({ entityName: 'B' });
    designer.createRelation({ sourceId: a.state.id, targetId: b.state.id });

    designer.removeComponent(a.state.id);
    expect(designer.entities.length).toBe(1);
    expect(designer.relations.length).toBe(0);

    designer.undo();
    expect(designer.entities.length).toBe(2);
    expect(designer.relations.length).toBe(1);
  });

  it('新的操作会清空 redo 栈', () => {
    const { designer } = makeDesigner();
    designer.createEntity({ entityName: 'A' });
    designer.createEntity({ entityName: 'B' });
    designer.undo();
    expect(designer.canRedo()).toBe(true);

    designer.createEntity({ entityName: 'C' });
    expect(designer.canRedo()).toBe(false);
  });

  it('undo 栈受 __maxHistory 限制', () => {
    const { designer } = makeDesigner();
    designer.__maxHistory = 3;
    for (let i = 0; i < 5; i++) {
      designer.createEntity({ entityName: 'E' + i });
    }
    expect(designer.__undoStack.length).toBe(3);
    // 连续 undo 只回溯到栈内深度
    designer.undo();
    designer.undo();
    designer.undo();
    expect(designer.canUndo()).toBe(false);
  });

  it('无历史时 undo/redo 为无操作（不抛错、不通知）', () => {
    const { designer } = makeDesigner();
    const seen: string[] = [];
    designer.subscribe((snapshot: string) => seen.push(snapshot));
    expect(() => designer.undo()).not.toThrow();
    expect(() => designer.redo()).not.toThrow();
    expect(seen.length).toBe(0);
  });
});

describe('EntityDesigner 订阅与事件', () => {
  it('subscribe 返回取消订阅函数；取消后不再收到通知', () => {
    const { designer } = makeDesigner();
    const seen: string[] = [];
    const unsubscribe = designer.subscribe((snapshot: string) => seen.push(snapshot));
    designer.createEntity();
    expect(seen.length).toBe(1);

    unsubscribe();
    designer.createEntity();
    expect(seen.length).toBe(1);
  });

  it('subscribe 传入非函数时返回空函数且不抛错', () => {
    const { designer } = makeDesigner();
    const unsubscribe = designer.subscribe(null as any);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('订阅者抛错不影响模型状态（其余订阅者仍被通知）', () => {
    const { designer } = makeDesigner();
    const seen: string[] = [];
    designer.subscribe(() => {
      throw new Error('listener boom');
    });
    designer.subscribe((snapshot: string) => seen.push(snapshot));
    expect(() => designer.createEntity()).toThrow('listener boom');
    expect(designer.entities.length).toBe(1);
  });

  it('mousedown 命中嵌套子组件时选中最外层实体；dispose 后不再响应', () => {
    const { ice, designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'A' });
    designer.select(null);
    const child = entity.childNodes[0];
    expect(child).toBeTruthy();

    ice.evtBus.trigger('mousedown', null, { component: child });
    expect(designer.selectedId).toBe(entity.state.id);

    designer.dispose();
    designer.select(null);
    ice.evtBus.trigger('mousedown', null, { component: child });
    expect(designer.selectedId).toBeNull();
  });

  it('select / selected 依据 id 取回组件', () => {
    const { designer } = makeDesigner();
    const entity = designer.createEntity({ entityName: 'A' });
    designer.select(entity.state.id);
    expect(designer.selected).toBe(entity);
    designer.select(null);
    expect(designer.selected).toBeNull();
    designer.select('missing');
    expect(designer.selected).toBeUndefined();
  });
});
