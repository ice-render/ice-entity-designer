/**
 * 项目快照的**唯一字段定义**（codec）。
 *
 * 设计原则（与引擎的序列化机制保持一致）：
 * 1. 真相源是组件的 `state`，这里只声明「哪些键要进文档、以及它们的类型」；
 * 2. 写（serializeProject）与校验（validateProjectSnapshot）**共用这一份定义**，
 *    不允许 snapshot 与 validator 各写一套字段清单（历史上正是这样漂移出 bug 的）；
 * 3. 新增 state 字段却忘了登记时，`tests/designer/codec-completeness.test.ts`
 *    会以「未覆盖的 state 键」形态报红，逼迫补登记或明确列入运行时字段。
 *
 * 与引擎的关系：引擎的 Serializer 是「遍历 state 减黑名单」，天然不会漏字段；
 * 应用层因为要输出**扁平的领域文档**（AI/DSL/工具链消费），才需要这份显式契约，
 * 但实现方式与引擎保持同构：类型分派走 typeId、可选值缺省即合法、未知类型跳过。
 */

export type CodecFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

export type CodecField = {
  key: string;
  /** 出现时校验的类型；缺省表示 any（透传） */
  type?: CodecFieldType;
  /** 该键必须存在（缺省即合法只对非必填字段成立） */
  required?: boolean;
  /** 嵌套结构校验钩子（与字段定义同处一份，避免校验器另起一套） */
  validate?: (value: any, prefix: string, errors: string[]) => void;
  /** 文档用途说明（给人看） */
  doc?: string;
};

/**
 * 应用层自定义 JSON 的透传键。
 *
 * 应用层可以把业务元数据挂在 `component.state.data` 上（任意 JSON），
 * 它会原样写进项目快照并在载入时回填 —— 与引擎序列化对 state 的处理一致。
 */
export const PASS_THROUGH_KEY = 'data';

/** 引擎运行时派生字段：不写进项目快照，载入后由引擎重算（与 Serializer 的黑名单同源） */
export const DERIVED_STATE_KEYS = [
  'linearMatrix',
  'composedMatrix',
  'absoluteLinearMatrix',
  'localOrigin',
  'absoluteOrigin',
  'dots',
  'points', // 折线/连线由 startPoint/endPoint 等重新插值
  'textHeight',
  'lines',
];

/** 引擎默认值字段：不入文档，构造时由引擎按默认值补齐（值不变，故不算丢失） */
export const CONSTRUCTOR_DEFAULT_STATE_KEYS = ['closePath', 'clipChildren', 'title'];

/** Entity / Relation 通用字段 */
export const COMPONENT_BASE_FIELDS: CodecField[] = [
  { key: 'display', type: 'boolean' },
  { key: 'zIndex', type: 'number' },
  { key: 'opacity', type: 'number', doc: '子树不透明度（引擎 1.3 起）' },
  { key: 'transform', type: 'object' },
  { key: 'origin', type: 'string' },
  { key: 'originX', type: 'number' },
  { key: 'originY', type: 'number' },
  { key: 'lineDash', type: 'array' },
  { key: 'lineDashOffset', type: 'number' },
  { key: 'lineDashFlow', type: 'boolean' },
  { key: 'lineDashFlowSpeed', type: 'number' },
  { key: 'lineBorder', type: 'boolean' },
  { key: 'lineBorderWidth', type: 'number' },
  { key: 'lineBorderColor', type: 'string' },
  { key: 'fill', type: 'boolean' },
  { key: 'stroke', type: 'boolean' },
  { key: 'linkable', type: 'boolean' },
  { key: 'transformable', type: 'boolean' },
  { key: 'animations', type: 'object' },
];

/** Entity 专有字段 */
export const ENTITY_FIELDS: CodecField[] = [
  { key: 'id', type: 'string', required: true },
  { key: 'typeId', type: 'string' },
  { key: 'left', type: 'number' },
  { key: 'top', type: 'number' },
  { key: 'width', type: 'number' },
  { key: 'height', type: 'number' },
  { key: 'entityName', type: 'string', required: true },
  { key: 'fields', type: 'array', validate: validateFields },
  { key: 'style', type: 'object' },
  { key: 'headerStyle', type: 'object' },
  { key: 'fieldStyle', type: 'object' },
  { key: 'dividerStyle', type: 'object' },
  { key: 'draggable', type: 'boolean' },
  { key: 'interactive', type: 'boolean' },
  { key: 'showMinBoundingBox', type: 'boolean' },
  { key: 'showMaxBoundingBox', type: 'boolean' },
];

/** Relation 专有字段 */
export const RELATION_FIELDS: CodecField[] = [
  { key: 'id', type: 'string', required: true },
  { key: 'typeId', type: 'string' },
  { key: 'left', type: 'number' },
  { key: 'top', type: 'number' },
  { key: 'width', type: 'number' },
  { key: 'height', type: 'number' },
  { key: 'relationType', type: 'string' },
  { key: 'referencedColumnName', type: 'string' },
  { key: 'sourceField', type: 'string' },
  { key: 'targetField', type: 'string' },
  { key: 'nullable', type: 'boolean' },
  { key: 'onDelete', type: 'string' },
  { key: 'onUpdate', type: 'string' },
  { key: 'joinTableName', type: 'string' },
  { key: 'fromKey', type: 'string' },
  { key: 'toKey', type: 'string' },
  { key: 'sourceCardinality', type: 'string' },
  { key: 'targetCardinality', type: 'string' },
  { key: 'label', type: 'string' },
  { key: 'labelStyle', type: 'object' },
  { key: 'style', type: 'object' },
  { key: 'arrow', type: 'string' },
  { key: 'lineType', type: 'string' },
  { key: 'escapeDistance', type: 'number' },
  { key: 'routeType', type: 'string' },
  { key: 'routeOffset', type: 'number' },
  { key: 'curveType', type: 'string' },
  { key: 'linkShape', type: 'string', doc: '连线形态（visio/bezier）' },
  { key: 'lineDash', type: 'array' },
  { key: 'lineWidth', type: 'number' },
  { key: 'arrowLength', type: 'number' },
  { key: 'arrowAngel', type: 'number' },
  { key: 'arrowStyle', type: 'string' },
  { key: 'startPoint', type: 'array' },
  { key: 'endPoint', type: 'array' },
  { key: 'links', type: 'object', validate: validateLinks },
  { key: 'sourceId', type: 'string', doc: '连线起点宿主 id（与 links.start.id 同步）' },
  { key: 'targetId', type: 'string', doc: '连线终点宿主 id（与 links.end.id 同步）' },
  { key: 'draggable', type: 'boolean' },
  { key: 'interactive', type: 'boolean' },
  { key: 'showMinBoundingBox', type: 'boolean' },
  { key: 'showMaxBoundingBox', type: 'boolean' },
];

/** 组装 Entity / Relation 的字段定义（专有 + 通用 + 透传） */
export const ENTITY_DOCUMENT_FIELDS: CodecField[] = [...ENTITY_FIELDS, ...COMPONENT_BASE_FIELDS];
export const RELATION_DOCUMENT_FIELDS: CodecField[] = [...RELATION_FIELDS, ...COMPONENT_BASE_FIELDS];

/**
 * 按字段定义从 state 里取值，组装成文档节点。
 *
 * - 只写「定义里列了、且 state 里不是 undefined」的键（保持文档紧凑、可读）；
 * - `data` 透传键原样带上。
 */
export function pickDocumentNode(state: any, fields: CodecField[]): Record<string, any> {
  const doc: Record<string, any> = {};
  fields.forEach((field) => {
    const value = state ? state[field.key] : undefined;
    if (value !== undefined) {
      doc[field.key] = value;
    }
  });
  const passThrough = state ? state[PASS_THROUGH_KEY] : undefined;
  if (passThrough !== undefined) {
    doc[PASS_THROUGH_KEY] = passThrough;
  }
  return doc;
}

function typeMatches(value: any, type: CodecFieldType | undefined): boolean {
  switch (type) {
    case undefined:
    case 'any':
      return true;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
    default:
      return typeof value === 'string';
  }
}

/** Entity.fields 的嵌套校验（字段项必须是对象；name 出现时必须是字符串） */
function validateFields(fields: any, prefix: string, errors: string[]): void {
  fields.forEach((field: any, index: number) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      errors.push(`${prefix}[${index}] must be an object`);
      return;
    }
    if (field.name !== undefined && typeof field.name !== 'string') {
      errors.push(`${prefix}[${index}].name must be a string when present`);
    }
  });
}

/** Relation.links 的嵌套校验（端点可只有 position 没有 id —— createRelation 允许不指定两端） */
function validateLinks(links: any, prefix: string, errors: string[]): void {
  ['start', 'end'].forEach((terminal) => {
    const link = links[terminal];
    if (link === undefined) {
      return;
    }
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      errors.push(`${prefix}.${terminal} must be an object when present`);
      return;
    }
    if (link.id !== undefined && typeof link.id !== 'string') {
      errors.push(`${prefix}.${terminal}.id must be a string when present`);
    }
    if (link.position !== undefined && typeof link.position !== 'string') {
      errors.push(`${prefix}.${terminal}.position must be a string when present`);
    }
  });
}

/**
 * 按同一份字段定义校验文档节点。
 *
 * 约定与引擎一致：**可选值缺省即合法**，只有「出现了但类型不对」才报错 —— 这样
 * `pickDocumentNode()` 的产物永远能通过校验（读写共用一份定义带来的自洽）。
 */
export function validateDocumentNode(node: any, prefix: string, fields: CodecField[], errors: string[]): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  fields.forEach((field) => {
    const value = node[field.key];
    if (value === undefined) {
      if (field.required) {
        errors.push(`${prefix}.${field.key} is required`);
      }
      return;
    }
    if (!typeMatches(value, field.type)) {
      errors.push(`${prefix}.${field.key} must be a ${field.type} when present`);
      return;
    }
    if (field.validate) {
      field.validate(value, `${prefix}.${field.key}`, errors);
    }
  });
}

/**
 * 找出 state 里既没被字段定义覆盖、也不属于运行时/默认值的那批键。
 *
 * 供 codec 完整性测试使用：返回非空即说明「新增了 state 字段但忘了登记」。
 */
export function uncoveredStateKeys(state: any, fields: CodecField[]): string[] {
  const covered = new Set<string>([
    ...fields.map((field) => field.key),
    PASS_THROUGH_KEY,
    ...DERIVED_STATE_KEYS,
    ...CONSTRUCTOR_DEFAULT_STATE_KEYS,
  ]);
  const uncovered: string[] = [];
  for (const key in state) {
    if (!covered.has(key)) {
      uncovered.push(key);
    }
  }
  return uncovered;
}
