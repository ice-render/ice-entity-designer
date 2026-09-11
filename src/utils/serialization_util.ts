import { camelCase } from './camelcase_util';
import { pluralize } from './pluralize_util';

/**
 * 把画布上的 Entity / Relation 描述转换为符合 TypeORM EntitySchema 规范的普通对象。
 * 返回结构可直接用于 `new EntitySchema(obj)`。
 *
 * 关系字段约定：sourceField 是「源实体」上的列名，targetField 是「目标实体」上的列名；
 * 外键归属由关系类型决定——one-to-many / one-to-one 的外键在目标侧，many-to-one 的外键在源侧，
 * 因此 joinColumn 会被放到持有外键的那一端。
 *
 * @see https://typeorm.io/separating-entity-definition
 */

/** 画布上使用的类型名 -> TypeORM 列类型 */
const TYPE_MAP: Record<string, string> = {
  number: 'int',
  int: 'int',
  integer: 'int',
  smallint: 'smallint',
  bigint: 'bigint',
  float: 'float',
  double: 'double',
  real: 'real',
  decimal: 'decimal',
  numeric: 'numeric',
  string: 'varchar',
  varchar: 'varchar',
  char: 'char',
  text: 'text',
  boolean: 'boolean',
  bool: 'boolean',
  date: 'date',
  datetime: 'datetime',
  timestamp: 'timestamp',
  time: 'time',
  json: 'json',
  jsonb: 'jsonb',
  uuid: 'uuid',
  enum: 'enum',
  blob: 'blob',
  binary: 'blob',
  'simple-array': 'simple-array',
  'simple-json': 'simple-json',
};

/** 这些类型才需要（也允许）length */
const LENGTH_TYPES = ['varchar', 'char', 'nvarchar', 'nchar', 'text', 'uuid'];

function mapColumnType(raw: any): string | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const key = String(raw).toLowerCase();
  return TYPE_MAP[key] || String(raw);
}

function normalizeColumn(field: any): any {
  const column: any = {};
  const type = mapColumnType(field.type);
  if (type !== undefined) {
    column.type = type;
  }

  if (field.length !== undefined && field.length !== null && field.length !== '') {
    const raw = String(field.length).trim();
    if (type === 'decimal' || type === 'numeric') {
      // decimal(12,2) -> precision/scale
      const [precision, scale] = raw.split(',').map((part) => part.trim());
      if (precision) column.precision = Number(precision);
      if (scale) column.scale = Number(scale);
    } else if (type && LENGTH_TYPES.indexOf(type) >= 0) {
      column.length = field.length;
    }
  }

  if (field.primary) column.primary = true;
  if (field.generated) column.generated = true;
  if (field.autoIncrement) {
    column.generated = true;
    column.strategy = 'increment';
  }
  // 兼容「已归一化过的列」：Entity.toEntityObject() 产出的是**列形状**（generated + strategy，
  // 没有 autoIncrement 键），而 toSchemaObject() 会再归一化一次。若这里不认 strategy，
  // 就会把显式策略静默丢掉（表现为导出的 schema 里 PK 少了 strategy: 'increment'）。
  if (field.strategy !== undefined) {
    column.strategy = field.strategy;
  }
  if (field.nullable === false) column.nullable = false;
  if (field.unique) column.unique = true;
  if (field.default !== undefined) column.default = field.default;
  if (field.comment !== undefined) column.comment = field.comment;
  if (field.index) column.index = true;
  return column;
}

function normalizeColumns(columns: any): any {
  const result: any = {};
  Object.keys(columns || {}).forEach((name) => {
    result[name] = normalizeColumn(columns[name]);
  });
  return result;
}

/** 组一个 joinColumn：name 是持有外键的列，referencedColumnName 是被引用的列 */
function buildJoinColumn(fkColumn: any, referencedColumn: any): any {
  return {
    name: fkColumn || referencedColumn || 'id',
    referencedColumnName: referencedColumn || 'id',
  };
}

export function toSchemaObject(componentList): object {
  const _objs = [...componentList];
  const entities = [];
  const relations = [];
  const cache = {};

  for (let i = 0; i < _objs.length; i++) {
    const obj = _objs[i];
    if (obj.constructor.name === 'Relation') {
      relations.push(obj);
    } else if (obj.constructor.name === 'Entity') {
      entities.push(obj);
      const entityObject = obj.toEntityObject();
      entityObject.columns = normalizeColumns(entityObject.columns);
      cache[obj.state.id] = entityObject;
    }
  }

  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];
    const {
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
    const fromObj = cache[fromId];
    const toObj = cache[toId];

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
      // 一对一：默认外键在 target 一侧，joinColumn 放在 target，source 一侧给 inverseSide。
      toObj.relations[toKey] = {
        type: relationType,
        target: fromName,
        joinColumn: buildJoinColumn(targetField || referencedColumnName, sourceField || referencedColumnName),
        ...extra,
      };
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        inverseSide: toKey,
      };
    } else if ('one-to-many' === relationType) {
      // 一对多：外键在 target（多）一侧。
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        inverseSide: toKey,
      };
      toObj.relations[toKey] = {
        type: 'many-to-one',
        target: fromName,
        joinColumn: buildJoinColumn(targetField || referencedColumnName, sourceField || referencedColumnName),
        ...extra,
      };
    } else if ('many-to-one' === relationType) {
      // 多对一：外键在 source（多）一侧。
      fromObj.relations[fromKey] = {
        type: relationType,
        target: toName,
        joinColumn: buildJoinColumn(sourceField || referencedColumnName, targetField || referencedColumnName),
        ...extra,
      };
      toObj.relations[toKey] = {
        type: 'one-to-many',
        target: fromName,
        inverseSide: fromKey,
      };
    } else if ('many-to-many' === relationType) {
      // 多对多：owning 侧使用 joinTable，反向侧给出 inverseSide。
      fromObj.relations[`${pluralize(fromKey)}`] = {
        type: relationType,
        target: toName,
        joinTable: joinTableName ? { name: joinTableName } : true,
      };
      toObj.relations[`${pluralize(toKey)}`] = {
        type: relationType,
        target: fromName,
        inverseSide: `${pluralize(fromKey)}`,
      };
    }
  }

  const result = [];
  for (const p in cache) {
    result.push(cache[p]);
  }
  return result;
}

export function toSchemaString(componentList): string {
  return JSON.stringify(toSchemaObject(componentList));
}
