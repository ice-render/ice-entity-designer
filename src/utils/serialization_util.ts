import { camelCase } from './camelcase_util';
import { pluralize } from './pluralize_util';

export function toSchemaObject(componentList): object {
  let _objs = [...componentList];
  let entities = [];
  let relations = [];
  let cache = {};

  for (let i = 0; i < _objs.length; i++) {
    let obj = _objs[i];
    if (obj.constructor.name === 'Relation') {
      relations.push(obj);
    } else if (obj.constructor.name === 'Entity') {
      entities.push(obj);
      cache[obj.state.id] = obj.toEntityObject();
    }
  }

  for (let i = 0; i < relations.length; i++) {
    let relation = relations[i];
    let {
      fromId,
      fromName,
      toId,
      toName,
      relationType,
      referencedColumnName,
      sourceField,
      targetField,
      nullable,
      onDelete,
      onUpdate,
      joinTableName,
      fromKey: relationFromKey,
      toKey: relationToKey,
    } = relation.toEntityObject();
    let fromObj = cache[fromId];
    let toObj = cache[toId];

    if (!fromObj || !toObj) {
      continue;
    }
    if (!fromObj.relations) {
      fromObj.relations = {};
    }
    if (!toObj.relations) {
      toObj.relations = {};
    }

    const fromKey = relationFromKey || camelCase(toName);
    const toKey = relationToKey || camelCase(fromName);
    const extra: any = {};
    if (nullable === false) extra.nullable = false;
    if (onDelete) extra.onDelete = onDelete;
    if (onUpdate) extra.onUpdate = onUpdate;

    if ('one-to-one' === relationType) {
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        joinColumn: {
          name: sourceField || referencedColumnName,
          referencedColumnName: targetField || referencedColumnName,
        },
        ...extra,
      };
      toObj.relations[toKey] = {
        type: relationType,
        target: fromName,
        inverseSide: fromKey,
      };
    } else if ('one-to-many' === relationType) {
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        inverseSide: toKey,
      };
      toObj.relations[toKey] = {
        type: 'many-to-one',
        target: fromName,
        joinColumn: {
          name: sourceField || referencedColumnName,
          referencedColumnName: targetField || referencedColumnName,
        },
        ...extra,
      };
    } else if ('many-to-one' === relationType) {
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        joinColumn: {
          name: sourceField || referencedColumnName,
          referencedColumnName: targetField || referencedColumnName,
        },
        ...extra,
      };
      toObj.relations[toKey] = {
        type: 'one-to-many',
        target: fromName,
        inverseSide: fromKey,
      };
    } else if ('many-to-many' === relationType) {
      //这里默认双向设置，方便 QueryBuilder 进行操作
      fromObj.relations[`${pluralize(fromKey)}`] = {
        type: relationType,
        target: toName,
        joinTable: {
          target: toName,
          ...(joinTableName ? { name: joinTableName } : {}),
        },
      };
      toObj.relations[`${pluralize(toKey)}`] = {
        type: relationType,
        target: fromName,
        inverseSide: `${pluralize(fromKey)}`,
      };
    }
  }

  let result = [];
  for (let p in cache) {
    result.push(cache[p]);
  }
  return result;
}

export function toSchemaString(componentList): string {
  return JSON.stringify(toSchemaObject(componentList));
}
