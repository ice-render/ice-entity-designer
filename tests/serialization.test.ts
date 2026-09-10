import { toSchemaObject, toSchemaString } from '../src/utils/serialization_util';
import Relation from '../src/er-component/Relation';

function fakeEntity(id: string, name: string) {
  return {
    constructor: { name: 'Entity' },
    state: { id },
    toEntityObject() {
      return { name, columns: { id: { type: 'number', primary: true } } };
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
        referencedColumnName: 'id',
        sourceField: 'id',
        targetField: 'id',
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

  it('生成 one-to-one 双向关系并保留 onDelete/onUpdate', () => {
    const result: any = toSchemaObject([
      fakeEntity('e1', 'User'),
      fakeEntity('e2', 'UserProfile'),
      fakeRelation('e1', 'e2', 'User', 'UserProfile', 'one-to-one', {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    const user = result.find((item: any) => item.name === 'User');
    const profile = result.find((item: any) => item.name === 'UserProfile');
    expect(user.relations.userProfile).toMatchObject({
      type: 'one-to-one',
      target: 'UserProfile',
      nullable: false,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    expect(profile.relations.user).toMatchObject({
      type: 'one-to-one',
      target: 'User',
      inverseSide: 'userProfile',
    });
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
    expect(user.relations.roles.joinTable).toMatchObject({ target: 'Role', name: 'user_roles' });
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
});
