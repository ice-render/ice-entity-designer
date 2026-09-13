import { toIsoTime } from 'ice-render';
import type { ICE } from 'ice-render';
import Entity from '../er-component/Entity';
import Relation from '../er-component/Relation';
import { isEntity, isRelation } from '../utils/component_type_util';
import { ENTITY_DOCUMENT_FIELDS, pickDocumentNode, RELATION_DOCUMENT_FIELDS } from '../utils/project_codec';
import { PROJECT_SCHEMA_VERSION, validateProjectSnapshot } from '../utils/project_schema';
import { validateSchema } from '../utils/schema_validator';
import { toSchemaObject, toSchemaString } from '../utils/serialization_util';
import { registerIEDType } from '../utils/type-registry';

/** 载入快照时被跳过的节点明细（typeId 未注册） */
export type ProjectLoadSkippedNode = {
  /** 该节点所在的数组 */
  bucket: 'entities' | 'relations';
  /** 该节点在数组中的下标 */
  index: number;
  /** 快照里声明的类型标识 */
  typeId: string;
  /** 快照里的节点 id（若存在），便于定位数据问题 */
  id?: string;
};

/** loadProject() 的载入报告 */
export type ProjectLoadReport = {
  /** 是否真的发生了一次项目替换（空值 / 非项目快照为 false） */
  loaded: boolean;
  /** 实际创建出的实体数量 */
  entities: number;
  /** 实际创建出的关系数量 */
  relations: number;
  /** 因未注册被跳过的类型（去重），语义同引擎 `deserializer.unknownTypes` */
  unknownTypes: string[];
  /** 被跳过的节点明细 */
  skipped: ProjectLoadSkippedNode[];
};

function createEmptyLoadReport(): ProjectLoadReport {
  return { loaded: false, entities: 0, relations: 0, unknownTypes: [], skipped: [] };
}

/**
 * EntityDesigner 是 Entity / Relation 之上的轻量应用层。
 *
 * 它不替代 ICE，也不重复实现底层图元；只负责把 ER 设计器最常用的交互闭环串起来：
 * 选择、创建、更新、删除、关系连接、Schema 输出。
 */
export default class EntityDesigner {
  public ice: ICE;
  public selectedId: string | null = null;

  /** 变更订阅者：任何会改变模型的操作完成后都会被通知（React 绑定层用它驱动 onChange） */
  private __changeListeners: Array<(snapshot: string) => void> = [];

  private __mousedownHandler = (evt: any) => this.__handleMouseDown(evt);
  private __undoStack: string[] = [];
  private __redoStack: string[] = [];
  private __historyEnabled = true;
  private __maxHistory = 100;

  constructor(ice: ICE) {
    this.ice = ice;
    registerIEDType(this.ice, Entity);
    registerIEDType(this.ice, Relation);
    this.ice.evtBus.on('mousedown', this.__mousedownHandler, this);
  }

  public get entities(): any[] {
    return this.ice.childNodes.filter((item: any) => isEntity(item));
  }

  public get relations(): any[] {
    return this.ice.childNodes.filter((item: any) => isRelation(item));
  }

  public get selected(): any {
    if (!this.selectedId) {
      return null;
    }
    return this.ice.findComponent(this.selectedId);
  }

  public select(id: string | null): this {
    this.selectedId = id;
    return this;
  }

  public createEntity(props: any = {}): any {
    this.captureHistory();
    const count = this.entities.length;
    const entity = new Entity({
      left: 120 + (count % 4) * 220,
      top: 120 + Math.floor(count / 4) * 260,
      entityName: 'NewEntity',
      fields: [],
      ...props,
    });
    this.ice.addChild(entity);
    this.select(entity.state.id);
    this.__emitChange();
    return entity;
  }

  public createRelation(props: any = {}): any {
    this.captureHistory();
    const links = props.links || {
      start: { id: props.sourceId || props.fromId, position: props.startPosition || 'R' },
      end: { id: props.targetId || props.toId, position: props.endPosition || 'L' },
    };
    const sourceId = props.sourceId || props.fromId || (links.start && links.start.id);
    const targetId = props.targetId || props.toId || (links.end && links.end.id);
    const startPosition = (links.start && links.start.position) || props.startPosition || 'R';
    const endPosition = (links.end && links.end.position) || props.endPosition || 'L';
    const source = sourceId ? this.ice.findComponent(sourceId) : null;
    const target = targetId ? this.ice.findComponent(targetId) : null;
    const startPoint = source ? this.__slotPoint(source, startPosition) : null;
    const endPoint = target ? this.__slotPoint(target, endPosition) : null;

    const relation = new Relation({
      relationType: props.relationType || 'one-to-many',
      sourceField: props.sourceField || 'id',
      targetField: props.targetField || 'id',
      links,
      startPoint: startPoint || [0, 0],
      endPoint: endPoint || [10, 10],
      ...props,
    });
    this.ice.addChild(relation);
    this.select(relation.state.id);
    this.__emitChange();
    return relation;
  }

  public updateEntity(id: string, patch: any): any {
    const entity = this.ice.findComponent(id);
    if (isEntity(entity)) {
      this.captureHistory();
      entity.setState(patch);
      this.__emitChange();
    }
    return entity;
  }

  public updateRelation(id: string, patch: any): any {
    const relation = this.ice.findComponent(id);
    if (isRelation(relation)) {
      this.captureHistory();
      const next = { ...relation.state, ...patch };
      const label = Relation.buildLabel(next, next.relationType || 'one-to-one');
      relation.setState({ ...patch, label });
      this.__emitChange();
    }
    return relation;
  }

  public removeComponent(id: string): void {
    const component = this.ice.findComponent(id);
    if (!component) {
      return;
    }
    this.captureHistory();

    // 删除 Entity 时，先删除两端连接到该实体的 Relation，避免出现悬空关系。
    if (isEntity(component)) {
      const linkedRelations = this.relations.filter((relation: any) => {
        const links = relation.state.links || {};
        return (links.start && links.start.id === id) || (links.end && links.end.id === id);
      });
      linkedRelations.forEach((relation: any) => this.ice.removeChild(relation));
    }

    this.ice.removeChild(component);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.__emitChange();
  }

  public toSchemaObject(): object {
    return toSchemaObject(this.ice.childNodes);
  }

  public toSchemaString(): string {
    return toSchemaString(this.ice.childNodes);
  }

  public validate(): ReturnType<typeof validateSchema> {
    return validateSchema(this.ice.childNodes);
  }

  public serializeProject(): string {
    // `createTime` = 这份项目首次创建的时刻；第一次写出时定下来并存到实例上，
    // 于是同一会话里反复 serializeProject() 结果稳定（undo/redo 的快照回放依赖这一点），
    // 载入别人的快照时也会把它读回来（见 __applySnapshot）。
    const createTime =
      toIsoTime(this.ice && (this.ice as any).documentMeta && (this.ice as any).documentMeta.createTime) ||
      this.__rememberCreateTime(undefined);
    const payload = {
      version: 1,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createTime,
      entities: this.entities.map((entity: any) => this.__entitySnapshot(entity)),
      relations: this.relations.map((relation: any) => this.__relationSnapshot(relation)),
    };
    return JSON.stringify(payload);
  }

  /**
   * 记下（或清掉）文档的 `createTime`，返回最终采用的值。
   *
   * - 传合法值 → 归一化成 ISO 8601 UTC 后记住；
   * - 传 undefined（首次写出 / 数据里没有该字段）→ 清掉旧值并返回当前时刻。
   */
  private __rememberCreateTime(value: unknown): string {
    const ice: any = this.ice;
    if (ice && typeof ice === 'object') {
      if (!ice.documentMeta || typeof ice.documentMeta !== 'object') {
        ice.documentMeta = {};
      }
    }
    const normalized = toIsoTime(value);
    if (normalized) {
      if (ice && ice.documentMeta) {
        ice.documentMeta.createTime = normalized;
      }
      return normalized;
    }
    // 没有可用值（首次写出 / 数据里缺失或脏值）→ 用当前时刻，并**记住它**：
    // 否则同一会话里每次 serializeProject() 都会取一次 now，结果不稳定。
    const now = new Date().toISOString();
    if (ice && ice.documentMeta) {
      ice.documentMeta.createTime = now;
    }
    return now;
  }

  /**
   * 载入项目快照（整体替换当前项目）。
   *
   * 节点按 `typeId` 分派构造：typeId 已注册 → 用注册的构造函数创建（下游二次开发
   * 注册的领域图元同样适用）；未注册 → **跳过该节点并记录**，不会导致整份数据打不开，
   * 与引擎 `Deserializer` 的容错语义一致。旧快照没有 typeId 时，按所在数组
   * （entities / relations）归位。
   *
   * @throws 快照结构非法或 schemaVersion 不兼容时抛错；此时当前项目与历史栈都不会被改动。
   * @returns 载入报告（创建数量、被跳过的未知类型）
   */
  public loadProject(json: string): ProjectLoadReport {
    if (!json) {
      return createEmptyLoadReport();
    }
    // 先解析 + 校验，确认是合法快照之后再动历史栈和画布：
    // 载入失败既不该污染 undo/redo，也不该丢弃当前项目。
    const data = this.__parseProject(json);
    if (!data) {
      return createEmptyLoadReport();
    }
    this.captureHistory();
    const report = this.__applySnapshot(data);
    this.__emitChange();
    return report;
  }

  /** 节点快照由共享 codec 的字段定义驱动（写与校验同一份定义，见 utils/project_codec.ts） */
  private __entitySnapshot(entity: any): any {
    const state = entity.state || {};
    return pickDocumentNode({ ...state, typeId: Entity.typeId }, ENTITY_DOCUMENT_FIELDS);
  }

  private __slotPoint(component: any, position: string): [number, number] {
    const box = component.getMinBoundingBox(true);
    const centerX = box.center[0];
    const centerY = box.center[1];
    switch (position) {
      case 'T':
        return [centerX, box.tl[1]];
      case 'B':
        return [centerX, box.br[1]];
      case 'L':
        return [box.tl[0], centerY];
      case 'R':
        return [box.tr[0], centerY];
      case 'C':
      default:
        return [centerX, centerY];
    }
  }

  private __relationSnapshot(relation: any): any {
    const state = relation.state || {};
    return pickDocumentNode({ ...state, typeId: Relation.typeId }, RELATION_DOCUMENT_FIELDS);
  }

  /**
   * 解析并校验快照。
   *
   * @returns 合法快照对象；对于「压根不是项目快照」的输入（例如 `{"nope":true}`）返回 null，
   *          保持历史行为：静默忽略而不是抛错。结构非法时抛错，由调用方决定如何呈现。
   */
  private __parseProject(json: string): any {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.entities)) {
      return null;
    }
    if (data.schemaVersion !== undefined && data.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      throw new Error(`Unsupported project schemaVersion: ${data.schemaVersion}`);
    }
    const validation = validateProjectSnapshot(data);
    if (!validation.valid) {
      throw new Error(`Invalid project snapshot:\n${validation.errors.join('\n')}`);
    }
    return data;
  }

  private __applyProject(json: string): void {
    const data = this.__parseProject(json);
    if (!data) {
      return;
    }
    this.__applySnapshot(data);
  }

  /** typeId 优先；缺省时按所在数组归位（兼容没有 typeId 的旧快照） */
  private __resolveTypeId(item: any, bucket: 'entities' | 'relations'): string {
    if (item && typeof item.typeId === 'string' && item.typeId) {
      return item.typeId;
    }
    return bucket === 'entities' ? Entity.typeId : Relation.typeId;
  }

  /** 由 typeId 反查构造函数：优先问 ICE 的注册表（与引擎反序列化一致） */
  private __resolveComponentClass(typeId: string): any {
    const ice: any = this.ice;
    if (typeof ice.getType === 'function') {
      const Clazz = ice.getType(typeId);
      if (typeof Clazz === 'function') {
        return Clazz;
      }
    } else if (ice.typeMapping && typeof ice.typeMapping[typeId] === 'function') {
      return ice.typeMapping[typeId];
    }
    // 兜底：设计器自身的两种领域图元（精简 / mock 的 ICE 实例也能工作）
    if (typeId === Entity.typeId) {
      return Entity;
    }
    if (typeId === Relation.typeId) {
      return Relation;
    }
    return null;
  }

  private __recordUnknownType(
    report: ProjectLoadReport,
    bucket: 'entities' | 'relations',
    index: number,
    typeId: string,
    item: any
  ): void {
    if (report.unknownTypes.indexOf(typeId) === -1) {
      report.unknownTypes.push(typeId);
      console.warn(
        `[ice-entity-designer] 载入项目时跳过未注册的类型：${typeId}（如需支持请先 ice.registerType() 注册）`
      );
    }
    const id = item && typeof item.id === 'string' ? item.id : undefined;
    report.skipped.push(id === undefined ? { bucket, index, typeId } : { bucket, index, typeId, id });
  }

  private __applySnapshot(data: any): ProjectLoadReport {
    const renderer = this.ice.renderer;
    if (renderer) {
      renderer.stop();
    }

    const report: ProjectLoadReport = { loaded: true, entities: 0, relations: 0, unknownTypes: [], skipped: [] };

    try {
      // 先清空旧项目，避免旧内容与新内容叠加。
      this.ice.clearAll();
      // 文档级 createTime：快照里带了就记下来（归一化成 ISO 8601 UTC），没带/解析不了就清掉，
      // 由下一次 serializeProject() 取当前时刻（与引擎 Serializer 的语义保持一致）
      this.__rememberCreateTime(data && data.createTime);
      if (this.ice.ctx && typeof this.ice.ctx.clearRect === 'function') {
        this.ice.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ice.ctx.clearRect(0, 0, this.ice.canvasWidth || 0, this.ice.canvasHeight || 0);
      }

      const createNode = (item: any, bucket: 'entities' | 'relations', index: number): any => {
        const typeId = this.__resolveTypeId(item, bucket);
        const Clazz = this.__resolveComponentClass(typeId);
        if (typeof Clazz !== 'function') {
          // 未注册的类型：跳过并记录，不终止整份数据的加载
          this.__recordUnknownType(report, bucket, index, typeId, item);
          return null;
        }
        const component = new Clazz(item);
        // typeId 只是文档的分派元数据，不该留在组件 state/props 里（否则 round-trip 会凭空多出这个键）
        delete component.state.typeId;
        delete component.props.typeId;
        this.ice.addChild(component);
        return component;
      };

      const collect = (item: any, bucket: 'entities' | 'relations', index: number) => {
        const component = createNode(item, bucket, index);
        if (isEntity(component)) {
          report.entities += 1;
        } else if (isRelation(component)) {
          report.relations += 1;
        }
      };

      data.entities.forEach((item: any, index: number) => collect(item, 'entities', index));
      (data.relations || []).forEach((item: any, index: number) => collect(item, 'relations', index));

      this.selectedId = null;
    } finally {
      if (renderer) {
        const previousMode = renderer.getRenderMode();
        renderer.setRenderMode('full');
        renderer.start();
        this.ice.dirty = true;
        setTimeout(() => {
          renderer.setRenderMode(previousMode);
        }, 50);
      }
    }
    return report;
  }

  private __applyHistorySnapshot(json: string): void {
    this.__historyEnabled = false;
    try {
      this.__applyProject(json);
      this.selectedId = null;
    } finally {
      // 回放失败也必须恢复历史开关，否则之后所有操作都不再入栈，undo/redo 会静默失效。
      this.__historyEnabled = true;
    }
  }

  public canUndo(): boolean {
    return this.__undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.__redoStack.length > 0;
  }

  public captureHistory(): void {
    if (!this.__historyEnabled) {
      return;
    }
    this.__undoStack.push(this.serializeProject());
    if (this.__undoStack.length > this.__maxHistory) {
      this.__undoStack.shift();
    }
    this.__redoStack.length = 0;
  }

  public undo(): void {
    if (!this.canUndo()) {
      return;
    }
    const current = this.serializeProject();
    const previous = this.__undoStack.pop();
    try {
      this.__applyHistorySnapshot(previous);
    } catch (error) {
      // 回放失败：把栈恢复原状，避免 undo/redo 栈错位
      this.__undoStack.push(previous);
      throw error;
    }
    this.__redoStack.push(current);
    this.__emitChange();
  }

  public redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const current = this.serializeProject();
    const next = this.__redoStack.pop();
    try {
      this.__applyHistorySnapshot(next);
    } catch (error) {
      this.__redoStack.push(next);
      throw error;
    }
    this.__undoStack.push(current);
    this.__emitChange();
  }

  /**
   * 订阅模型变更。任何改变模型的操作（增删改 / 载入 / undo / redo）完成后会被通知，
   * 回调参数是当前项目的序列化快照（与 serializeProject() 一致）。
   * @returns 取消订阅函数
   */
  public subscribe(listener: (snapshot: string) => void): () => void {
    if (typeof listener !== 'function') {
      return () => undefined;
    }
    this.__changeListeners.push(listener);
    return () => {
      const index = this.__changeListeners.indexOf(listener);
      if (index !== -1) {
        this.__changeListeners.splice(index, 1);
      }
    };
  }

  private __emitChange(): void {
    if (!this.__changeListeners.length) {
      return;
    }
    const snapshot = this.serializeProject();
    this.__changeListeners.slice().forEach((listener) => listener(snapshot));
  }

  public dispose(): void {
    this.ice.evtBus.off('mousedown', this.__mousedownHandler, this);
  }

  private __handleMouseDown(evt: any): void {
    const component = evt && evt.param && evt.param.component;
    if (!component) {
      return;
    }

    let root = component;
    while (root.parentNode) {
      root = root.parentNode;
    }

    if (isEntity(root) || isRelation(root)) {
      this.select(root.state.id);
    }
  }
}
