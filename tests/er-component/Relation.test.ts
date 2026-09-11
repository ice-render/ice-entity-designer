/**
 * Relation：关系类型 → 箭头 / 基数标签，插槽语义名归一化，typeorm 风格的关系导出。
 *
 * 标签与箭头是「schema 评审」时最直观的信息，也是 undo/redo 后必须稳定的部分，
 * 因此这里逐一固定它们的默认值与覆盖规则。
 */
import { ICE, EventBus } from 'ice-render';
import Relation from '../../src/er-component/Relation';
import Entity from '../../src/er-component/Entity';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('Relation 关系类型 → 箭头 / 基数', () => {
  it('defaultArrow：多端指向外键所在的一端', () => {
    expect(Relation.defaultArrow('one-to-many')).toBe('end');
    expect(Relation.defaultArrow('many-to-one')).toBe('start');
    expect(Relation.defaultArrow('many-to-many')).toBe('none');
    expect(Relation.defaultArrow('one-to-one')).toBe('none');
    // 未知类型按一对一处理
    expect(Relation.defaultArrow('???')).toBe('none');
  });

  it('cardinalityLabel：四种关系类型的默认基数，且可被显式覆盖', () => {
    expect(Relation.cardinalityLabel('one-to-many')).toBe('1 : N');
    expect(Relation.cardinalityLabel('many-to-one')).toBe('N : 1');
    expect(Relation.cardinalityLabel('many-to-many')).toBe('N : N');
    expect(Relation.cardinalityLabel('one-to-one')).toBe('1 : 1');
    expect(Relation.cardinalityLabel('one-to-one', { sourceCardinality: '0..1', targetCardinality: '1' })).toBe(
      '0..1 : 1'
    );
    // 未知类型回落一对一
    expect(Relation.cardinalityLabel('???')).toBe('1 : 1');
  });

  it('buildLabel 在基数后追加 onDelete / onUpdate 约束', () => {
    expect(Relation.buildLabel({}, 'one-to-many')).toBe('1 : N');
    expect(Relation.buildLabel({ onDelete: 'CASCADE' }, 'one-to-many')).toBe('1 : N  (ON DELETE CASCADE)');
    expect(Relation.buildLabel({ onDelete: 'CASCADE', onUpdate: 'RESTRICT' }, 'many-to-many')).toBe(
      'N : N  (ON DELETE CASCADE, ON UPDATE RESTRICT)'
    );
  });

  it('composeLabel 优先使用显式 label', () => {
    expect(Relation.composeLabel({ label: '自定义' }, 'one-to-many')).toBe('自定义');
    expect(Relation.composeLabel({}, 'many-to-one')).toBe('N : 1');
  });
});

describe('Relation 构造', () => {
  it('默认值：标题 / 类型 / 引用列 / 两端字段 / 标签样式', () => {
    const relation: any = new Relation();
    expect(relation.state.title).toBe('Relation');
    expect(relation.state.relationType).toBe('one-to-one');
    expect(relation.state.referencedColumnName).toBe('id');
    expect(relation.state.sourceField).toBe('id');
    expect(relation.state.targetField).toBe('id');
    expect(relation.state.arrow).toBe('none');
    expect(relation.state.label).toBe('1 : 1');
    expect(relation.state.labelStyle.fontSize).toBe(14);
    expect(relation.state.labelStyle.fillStyle).toBe('#334155');
  });

  it('用户传入的 labelStyle 与显式 label 优先', () => {
    const relation: any = new Relation({ relationType: 'one-to-many', label: 'FK', labelStyle: { fontSize: 20 } });
    expect(relation.state.label).toBe('FK');
    expect(relation.state.labelStyle.fontSize).toBe(20);
    expect(relation.state.labelStyle.fillStyle).toBe('#334155');
    expect(relation.state.arrow).toBe('end');
  });

  it('插槽语义名（top/right/bottom/left/center）归一化为单字母', () => {
    const relation: any = new Relation({
      links: {
        start: { id: 'a', position: 'right' },
        end: { id: 'b', position: 'bottom' },
      },
    });
    expect(relation.state.links.start.position).toBe('R');
    expect(relation.state.links.end.position).toBe('B');
  });

  it('单字母插槽名保持原样（不会被二次改写）', () => {
    const relation: any = new Relation({
      links: {
        start: { id: 'a', position: 'T' },
        end: { id: 'b', position: 'C' },
      },
    });
    expect(relation.state.links.start.position).toBe('T');
    expect(relation.state.links.end.position).toBe('C');
  });
});

describe('Relation 导出为 typeorm 风格对象（toEntityObject）', () => {
  it('由两端 id 反查实体名，并透传关系参数', () => {
    const ice = makeIce();
    const user: any = new Entity({ entityName: 'User' });
    const order: any = new Entity({ entityName: 'Order' });
    ice.addChild(user);
    ice.addChild(order);

    const relation: any = new Relation({
      relationType: 'one-to-many',
      links: { start: { id: user.state.id, position: 'R' }, end: { id: order.state.id, position: 'L' } },
      sourceField: 'user_id',
      targetField: 'id',
      onDelete: 'CASCADE',
    });
    ice.addChild(relation);

    const object = relation.toEntityObject();
    expect(object).toMatchObject({
      title: 'Relation',
      fromId: user.state.id,
      fromName: 'User',
      toId: order.state.id,
      toName: 'Order',
      relationType: 'one-to-many',
      referencedColumnName: 'id',
      sourceField: 'user_id',
      targetField: 'id',
      onDelete: 'CASCADE',
    });
  });

  it('nullable 只有显式为 false 才输出（否则不写该字段）', () => {
    const ice = makeIce();
    const a: any = new Entity({ entityName: 'A' });
    const b: any = new Entity({ entityName: 'B' });
    ice.addChild(a);
    ice.addChild(b);

    const strict: any = new Relation({
      links: { start: { id: a.state.id, position: 'R' }, end: { id: b.state.id, position: 'L' } },
      nullable: false,
    });
    const loose: any = new Relation({
      relationType: 'one-to-many',
      links: { start: { id: a.state.id, position: 'R' }, end: { id: b.state.id, position: 'L' } },
    });
    ice.addChild(strict);
    ice.addChild(loose);

    expect(strict.toEntityObject().nullable).toBe(false);
    expect(loose.toEntityObject().nullable).toBeUndefined();
  });

  it('未建立连接时 fromId/fromName 为空（不抛错）', () => {
    const ice = makeIce();
    const relation: any = new Relation({ relationType: 'one-to-many' });
    ice.addChild(relation);

    const object = relation.toEntityObject();
    expect(object.fromId).toBeUndefined();
    expect(object.fromName).toBeUndefined();
    expect(object.toId).toBeUndefined();
    expect(object.toName).toBeUndefined();
  });
});

/**
 * 连线形态（linkShape）：默认保持 Visio，可显式切贝塞尔。
 * 这里钉两条：① 默认值与覆盖规则；② `toEntityObject()` **不能**带上它 ——
 * 它是纯 UI/几何配置，混进 typeorm 输出会污染 `toSchemaObject()`。
 */
describe('Relation 连线形态（linkShape）', () => {
  it('默认 visio，显式传入可覆盖为 bezier', () => {
    expect((new Relation() as any).state.linkShape).toBe('visio');
    expect((new Relation({ linkShape: 'bezier' }) as any).state.linkShape).toBe('bezier');
  });

  it('toEntityObject 不包含 linkShape（不污染 TypeORM schema 输出）', () => {
    const relation: any = new Relation({ relationType: 'one-to-many', linkShape: 'bezier' });
    const obj = relation.toEntityObject();
    expect(obj).not.toHaveProperty('linkShape');
    // 顺带确认该输出仍是 typeorm 需要的那几个键
    expect(obj.relationType).toBe('one-to-many');
  });
});
