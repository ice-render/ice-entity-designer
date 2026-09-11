import { toSchemaObject, toSchemaString } from '../src/utils/serialization_util';
import Relation from '../src/er-component/Relation';

function fakeEntity(id: string, name: string, columns: any = { id: { type: 'number', primary: true } }) {
  return {
    constructor: { name: 'Entity' },
    state: { id },
    toEntityObject() {
      return { name, columns };
    },
  };
}

function fakeRelation(
  fromId: string,
  toId: string,
  fromName: string,
  toName: string,
  relationType: string,
  options: any = {}
) {
  return {
    constructor: { name: 'Relation' },
    toEntityObject() {
      return {
        title: 'Relation',
        fromId,
        toId,
        fromName,
        toName,
        relationType,
        referencedColumnName: options.referencedColumnName !== undefined ? options.referencedColumnName : 'id',
        sourceField: options.sourceField !== undefined ? options.sourceField : 'id',
        targetField: options.targetField !== undefined ? options.targetField : 'id',
        nullable: options.nullable,
        onDelete: options.onDelete,
        onUpdate: options.onUpdate,
        joinTableName: options.joinTableName,
        fromKey: options.fromKey,
        toKey: options.toKey,
      };
    },
  };
}

describe('ice-entity-designer schema 序列化', () => {
  it('生成 one-to-many 双向关系', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'User'),
      fakeEntity('e2', 'Role'),
      fakeRelation('e1', 'e2', 'User', 'Role', 'one-to-many'),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    const role = result.find((item: any) => item.name === 'Role');
    expect(user.relations.role).toMatchObject({ type: 'one-to-many', target: 'Role' });
    expect(role.relations.user).toMatchObject({ type: 'many-to-one', target: 'User' });
  });

  it('生成 many-to-many 关系并补全反向 inverseSide', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'User'),
      fakeEntity('e2', 'Role'),
      fakeRelation('e1', 'e2', 'User', 'Role', 'many-to-many'),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    const role = result.find((item: any) => item.name === 'Role');
    expect(user.relations.roles).toMatchObject({ type: 'many-to-many', target: 'Role' });
    expect(role.relations.users).toMatchObject({ type: 'many-to-many', target: 'User' });
  });

  it('toSchemaString 输出合法 JSON', () => {
    const text = toSchemaString([fakeEntity('e1', 'User')]);
    expect(JSON.parse(text)).toHaveLength(1);
  });

  it('生成 one-to-one 双向关系，joinColumn 落在拥有外键的一侧', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'User'),
      fakeEntity('e2', 'UserProfile', { userId: { type: 'number' } }),
      fakeRelation('e1', 'e2', 'User', 'UserProfile', 'one-to-one', {
        sourceField: 'id',
        targetField: 'userId',
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    const profile = result.find((item: any) => item.name === 'UserProfile');
    // 外键在 target（UserProfile）一侧：joinColumn 与 onDelete/onUpdate 都应在这里
    expect(profile.relations.user).toMatchObject({
      type: 'one-to-one',
      target: 'User',
      joinColumn: { name: 'userId', referencedColumnName: 'id' },
      nullable: false,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    // source 一侧只给 inverseSide，不带 joinColumn
    expect(user.relations.userProfile).toMatchObject({
      type: 'one-to-one',
      target: 'UserProfile',
      inverseSide: 'user',
    });
    expect(user.relations.userProfile.joinColumn).toBeUndefined();
  });

  it('生成 many-to-one 关系并补全反向 one-to-many', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'Order'),
      fakeEntity('e2', 'Customer'),
      fakeRelation('e1', 'e2', 'Order', 'Customer', 'many-to-one'),
    ]);

    const order = result.find((item: any) => item.name === 'Order');
    const customer = result.find((item: any) => item.name === 'Customer');
    expect(order.relations.customer).toMatchObject({ type: 'many-to-one', target: 'Customer' });
    expect(customer.relations.order).toMatchObject({ type: 'one-to-many', target: 'Order' });
  });

  it('支持带 joinTableName 的 many-to-many 关系', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'User'),
      fakeEntity('e2', 'Role'),
      fakeRelation('e1', 'e2', 'User', 'Role', 'many-to-many', {
        joinTableName: 'user_roles',
      }),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    expect(user.relations.roles.joinTable).toMatchObject({ name: 'user_roles' });
  });

  it('支持多个实体组成的关系图', () => {
    const result: any = toSchemaObject([
      fakeEntity('user', 'User'),
      fakeEntity('role', 'Role'),
      fakeEntity('permission', 'Permission'),
      fakeEntity('order', 'Order'),
      fakeEntity('customer', 'Customer'),
      fakeRelation('user', 'role', 'User', 'Role', 'many-to-many'),
      fakeRelation('user', 'order', 'User', 'Order', 'one-to-many'),
      fakeRelation('order', 'customer', 'Order', 'Customer', 'many-to-one'),
    ]);

    expect(result).toHaveLength(5);
    const user = result.find((item: any) => item.name === 'User');
    const role = result.find((item: any) => item.name === 'Role');
    const order = result.find((item: any) => item.name === 'Order');
    const customer = result.find((item: any) => item.name === 'Customer');
    expect(Object.keys(user.relations)).toHaveLength(2);
    expect(role.relations.users).toBeDefined();
    expect(order.relations.customer.type).toBe('many-to-one');
    expect(customer.relations.order.type).toBe('one-to-many');
  });

  it('支持自引用关系并生成独立的 parent/children 属性', () => {
    const result: any = toSchemaObject([
      fakeEntity('category', 'Category'),
      fakeRelation('category', 'category', 'Category', 'Category', 'one-to-many', {
        sourceField: 'id',
        targetField: 'parentId',
        fromKey: 'children',
        toKey: 'parent',
      }),
    ]);

    const category = result.find((item: any) => item.name === 'Category');
    expect(category.relations.children).toMatchObject({ type: 'one-to-many', target: 'Category' });
    expect(category.relations.parent).toMatchObject({ type: 'many-to-one', target: 'Category' });
  });
});

describe('joinColumn 语义（TypeORM）', () => {
  it('one-to-many：外键在 target，joinColumn 应写在 target 上', () => {
    const result: any = toSchemaObject([
      fakeEntity('c', 'Customer'),
      fakeEntity('o', 'Order', { customerId: { type: 'number', index: true } }),
      fakeRelation('c', 'o', 'Customer', 'Order', 'one-to-many', {
        sourceField: 'id',
        targetField: 'customerId',
        onDelete: 'CASCADE',
      }),
    ]);

    const customer = result.find((item: any) => item.name === 'Customer');
    const order = result.find((item: any) => item.name === 'Order');
    expect(order.relations.customer).toEqual({
      type: 'many-to-one',
      target: 'Customer',
      joinColumn: { name: 'customerId', referencedColumnName: 'id' },
      onDelete: 'CASCADE',
    });
    expect(customer.relations.order).toEqual({
      type: 'one-to-many',
      target: 'Order',
      inverseSide: 'customer',
    });
  });

  it('many-to-one：外键在 source，joinColumn 应写在 source 上', () => {
    const result: any = toSchemaObject([
      fakeEntity('o', 'Order', { membershipLevelId: { type: 'number' } }),
      fakeEntity('m', 'MembershipLevel'),
      fakeRelation('o', 'm', 'Order', 'MembershipLevel', 'many-to-one', {
        sourceField: 'membershipLevelId',
        targetField: 'id',
      }),
    ]);

    const order = result.find((item: any) => item.name === 'Order');
    expect(order.relations.membershipLevel).toEqual({
      type: 'many-to-one',
      target: 'MembershipLevel',
      joinColumn: { name: 'membershipLevelId', referencedColumnName: 'id' },
    });
  });

  it('自引用 one-to-many：joinColumn 使用 parentId 指向 id', () => {
    const result: any = toSchemaObject([
      fakeEntity('c', 'Category', { parentId: { type: 'number' } }),
      fakeRelation('c', 'c', 'Category', 'Category', 'one-to-many', {
        sourceField: 'id',
        targetField: 'parentId',
        fromKey: 'children',
        toKey: 'parent',
      }),
    ]);

    const category = result.find((item: any) => item.name === 'Category');
    expect(category.relations.parent.joinColumn).toEqual({ name: 'parentId', referencedColumnName: 'id' });
    expect(category.relations.children.inverseSide).toBe('parent');
  });

  it('many-to-many：joinTable 不应包含非标准的 target 键', () => {
    const result: any = toSchemaObject([
      fakeEntity('u', 'User'),
      fakeEntity('r', 'Role'),
      fakeRelation('u', 'r', 'User', 'Role', 'many-to-many', { joinTableName: 'user_roles' }),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    const role = result.find((item: any) => item.name === 'Role');
    expect(user.relations.roles.joinTable).toEqual({ name: 'user_roles' });
    expect(user.relations.roles.joinTable.target).toBeUndefined();
    expect(role.relations.users.inverseSide).toBe('roles');
  });
});

describe('列类型规范化（TypeORM）', () => {
  const result: any = toSchemaObject([
    fakeEntity('e1', 'Sample', {
      id: { type: 'number', length: 64, primary: true, autoIncrement: true, nullable: false },
      name: { type: 'string', length: 128, nullable: false },
      price: { type: 'decimal', length: '12,2', nullable: false, default: '0.00' },
      quantity: { type: 'number', length: 11 },
      active: { type: 'boolean', nullable: false, default: true },
      note: { type: 'string', length: 255, comment: '备注' },
    }),
  ]);

  it('把画布类型名映射为 TypeORM 列类型', () => {
    const sample = result.find((item: any) => item.name === 'Sample');
    expect(sample.columns.id).toEqual({
      type: 'int',
      primary: true,
      generated: true,
      strategy: 'increment',
      nullable: false,
    });
    expect(sample.columns.name).toEqual({ type: 'varchar', length: 128, nullable: false });
    expect(sample.columns.active).toEqual({ type: 'boolean', nullable: false, default: true });
  });

  it('decimal 的 length 转为 precision/scale', () => {
    const sample = result.find((item: any) => item.name === 'Sample');
    expect(sample.columns.price).toEqual({
      type: 'decimal',
      precision: 12,
      scale: 2,
      nullable: false,
      default: '0.00',
    });
  });

  it('非字符串类型不保留 length', () => {
    const sample = result.find((item: any) => item.name === 'Sample');
    expect(sample.columns.quantity).toEqual({ type: 'int' });
  });
});

describe('Relation.cardinalityLabel', () => {
  it('返回常用基数标签', () => {
    expect(Relation.cardinalityLabel('one-to-one')).toBe('1 : 1');
    expect(Relation.cardinalityLabel('one-to-many')).toBe('1 : N');
    expect(Relation.cardinalityLabel('many-to-one')).toBe('N : 1');
    expect(Relation.cardinalityLabel('many-to-many')).toBe('N : N');
  });

  it('支持自定义两端基数标签', () => {
    expect(Relation.cardinalityLabel('one-to-many', { sourceCardinality: '1', targetCardinality: '0..N' })).toBe(
      '1 : 0..N'
    );
  });

  it('buildLabel 会忽略旧 label 并按当前参数重新计算', () => {
    expect(Relation.buildLabel({ label: '1 : N', onDelete: 'CASCADE' }, 'many-to-one')).toBe(
      'N : 1  (ON DELETE CASCADE)'
    );
  });

  it('根据关系类型推断默认箭头方向', () => {
    expect(Relation.defaultArrow('one-to-many')).toBe('end');
    expect(Relation.defaultArrow('many-to-one')).toBe('start');
    expect(Relation.defaultArrow('one-to-one')).toBe('none');
    expect(Relation.defaultArrow('many-to-many')).toBe('none');
  });
});
