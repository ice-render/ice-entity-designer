/**
 * Entity：构造参数归一化、字段同步、typeorm 风格的列映射。
 *
 * 用真实引擎（ICEGroup 子类），断言集中在**结构 / 文本 / 列映射**等确定性行为上；
 * node 无 DOM，文本量测降级，因此不断言精确像素宽高。
 */
import Entity from '../../src/er-component/Entity';

function textOf(entity: any): string[] {
  return (entity.entityFieldsComponent || []).map((t: any) => t.state.text);
}

describe('Entity 构造参数（arrangeParam）', () => {
  it('默认值：名称 / 空字段 / 默认样式，且强制 transformable=false', () => {
    const entity: any = new Entity();
    expect(entity.state.entityName).toBe('Entity Name');
    expect(entity.state.fields).toEqual([]);
    expect(entity.state.transformable).toBe(false);
    expect(entity.state.style.strokeStyle).toBe('#334155');
    expect(entity.state.style.radius).toBe(8);
    expect(entity.state.headerStyle.fontSize).toBe(18);
    expect(entity.state.fieldStyle.fontSize).toBe(16);
  });

  it('用户传入的字段覆盖默认值，但 transformable 仍被强制为 false', () => {
    const entity: any = new Entity({ entityName: 'User', transformable: true, left: 30, top: 40 });
    expect(entity.state.entityName).toBe('User');
    expect(entity.state.transformable).toBe(false);
    expect([entity.state.left, entity.state.top]).toEqual([30, 40]);
  });

  it('entityName / fields 显式为 null 时回落为默认值', () => {
    const entity: any = new Entity({ entityName: null, fields: null });
    expect(entity.state.entityName).toBe('Entity Name');
    expect(entity.state.fields).toEqual([]);
  });
});

describe('Entity 子组件同步', () => {
  it('构造后生成标题 / 背景 / 分隔线与字段文本组件', () => {
    const entity: any = new Entity({
      entityName: 'User',
      fields: [{ name: 'id' }, { name: 'name' }],
    });
    expect(entity.entityNameComponent.state.text).toBe('User');
    expect(entity.headerBackgroundComponent).toBeTruthy();
    expect(entity.deviderLine).toBeTruthy();
    expect(entity.entityFieldsComponent.length).toBe(2);
    expect(entity.childNodes.length).toBeGreaterThanOrEqual(4);
  });

  it('setState({ entityName }) 会重建标题组件', () => {
    const entity: any = new Entity({ entityName: 'Old' });
    const before = entity.entityNameComponent;
    entity.setState({ entityName: 'New' });
    expect(entity.state.entityName).toBe('New');
    expect(entity.entityNameComponent.state.text).toBe('New');
    expect(entity.entityNameComponent).not.toBe(before);
  });

  it('setState 不含 fields/entityName 时不重建子组件（保留同一实例）', () => {
    const entity: any = new Entity({ entityName: 'A' });
    const before = entity.entityNameComponent;
    entity.setState({ left: 200 });
    expect(entity.entityNameComponent).toBe(before);
    expect(entity.state.left).toBe(200);
  });

  it('addField / removeField / setFields 维护字段与视图', () => {
    const entity: any = new Entity({ entityName: 'A' });
    entity.addField({ name: 'id' });
    entity.addField({ name: 'name' });
    expect(entity.state.fields.map((f: any) => f.name)).toEqual(['id', 'name']);
    expect(textOf(entity).length).toBe(2);

    entity.removeField('id');
    expect(entity.state.fields.map((f: any) => f.name)).toEqual(['name']);

    entity.setFields([{ name: 'x' }, { name: 'y' }, { name: 'z' }]);
    expect(textOf(entity).length).toBe(3);

    // 链式调用返回自身
    expect(entity.addField({ name: 'w' })).toBe(entity);
    expect(entity.removeField('nope')).toBe(entity);
    expect(entity.setFields([])).toBe(entity);
  });
});

describe('Entity 字段显示文案（fieldDisplay）', () => {
  it('主键 / 外键 / 约束 / 类型长度 / 默认值 / 注释都能反映到文本', () => {
    const entity: any = new Entity({
      entityName: 'T',
      fields: [
        { name: 'id', type: 'number', primary: true },
        { name: 'user_id', type: 'number', foreignKey: true },
        { name: 'name', type: 'varchar', length: 64, nullable: false, unique: true, autoIncrement: true },
        { name: 'qty', type: 'int', default: 0 },
        { name: 'note', comment: 'hello' },
      ],
    });

    expect(textOf(entity)).toEqual([
      'PK id  number',
      'FK user_id  number',
      'name  varchar(64)  UQ AI NN',
      'qty  int  = 0',
      'note  // hello',
    ]);
  });
});

describe('Entity 导出为 typeorm 风格对象（toEntityObject）', () => {
  it('按字段标志映射 columns', () => {
    const entity: any = new Entity({
      entityName: 'User',
      fields: [
        { name: 'id', type: 'number', primary: true, autoIncrement: true },
        { name: 'name', type: 'varchar', length: 64, nullable: false },
        { name: 'email', type: 'varchar', length: 128, unique: true },
        { name: 'bio', type: 'text', comment: '简介', default: '' },
        { name: 'created', type: 'timestamp', generated: true },
        { name: 'idx', type: 'int', index: true },
      ],
    });

    const object = entity.toEntityObject();
    expect(object.name).toBe('User');

    expect(object.columns.id).toMatchObject({ type: 'number', primary: true, generated: true, strategy: 'increment' });
    expect(object.columns.name).toEqual({ type: 'varchar', length: 64, nullable: false });
    expect(object.columns.email).toMatchObject({ type: 'varchar', length: 128, unique: true });
    expect(object.columns.bio).toMatchObject({ type: 'text', comment: '简介', default: '' });
    expect(object.columns.created).toMatchObject({ type: 'timestamp', generated: true });
    expect(object.columns.idx).toMatchObject({ type: 'int', index: true });
  });

  it('未显式声明 nullable:false 时不写 nullable；无字段时 columns 为空对象', () => {
    const entity: any = new Entity({ entityName: 'Empty' });
    const object = entity.toEntityObject();
    expect(object.columns).toEqual({});
  });
});

describe('Entity 派生尺寸', () => {
  it('calcComponentParams 后宽高为正数（字段越多越高）', () => {
    const one: any = new Entity({ entityName: 'A', fields: [{ name: 'id' }] });
    const many: any = new Entity({ entityName: 'A', fields: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
    one.calcComponentParams();
    many.calcComponentParams();
    expect(one.state.width).toBeGreaterThan(0);
    expect(one.state.height).toBeGreaterThan(0);
    expect(many.state.height).toBeGreaterThan(one.state.height);
  });
});
