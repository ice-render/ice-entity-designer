import { camelCase } from './camelcase_util';
import { pluralize } from './pluralize_util';

export default function toJSONObject(componentList): any {
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
    let { fromId, fromName, toId, toName, relationType, referencedColumnName } = relation.toEntityObject();
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

    //TODO:这里的实现做了简化，没有支持 type-orm 完整的 schema 规则。
    //TODO:这里需要重构，需要完整支持 type-orm 中的4种关联关系，one-to-one, one-to-many, many-to-one, many-to-many ，type-orm 中定义了更详细的 schema 配置参数。
    if ('one-to-one' === relationType) {
      fromObj.relations[`${camelCase(toName)}`] = {
        type: relationType,
        target: toName,
        joinColumn: {
          target: toName,
          referencedColumnName: referencedColumnName,
        },
      };
      toObj.relations[`${camelCase(fromName)}`] = {
        type: relationType,
        target: fromName,
      };
    } else if ('one-to-many' === relationType) {
      fromObj.relations[`${camelCase(toName)}`] = {
        type: relationType,
        target: toName,
      };
    } else if ('many-to-one' === relationType) {
      toObj.relations[`${camelCase(fromName)}`] = {
        type: 'one-to-many', //反向设置为 one-to-many
        target: fromName,
      };
    } else if ('many-to-many' === relationType) {
      //这里默认双向设置，方便 QueryBuilder 进行操作
      fromObj.relations[`${pluralize(camelCase(toName))}`] = {
        type: relationType,
        target: toName,
        joinTable: {
          target: toName,
        },
      };
      toObj.relations[`${pluralize(camelCase(fromName))}`] = {
        type: relationType,
        target: fromName,
      };
    }
  }

  let result = [];
  for (let p in cache) {
    result.push(cache[p]);
  }
  return result;
}
