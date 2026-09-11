import type { ICE } from 'ice-render';
import Entity from '../er-component/Entity';
import Relation from '../er-component/Relation';
import { isEntity, isRelation } from '../utils/component_type_util';
import { PROJECT_SCHEMA_VERSION, validateProjectSnapshot } from '../utils/project_schema';
import { validateSchema } from '../utils/schema_validator';
import { toSchemaObject, toSchemaString } from '../utils/serialization_util';

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
    this.ice.registerType(Entity.typeId, Entity);
    this.ice.registerType(Relation.typeId, Relation);
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
    const payload = {
      version: 1,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      entities: this.entities.map((entity: any) => this.__entitySnapshot(entity)),
      relations: this.relations.map((relation: any) => this.__relationSnapshot(relation)),
    };
    return JSON.stringify(payload);
  }

  public loadProject(json: string): void {
    if (!json) {
      return;
    }
    this.captureHistory();
    this.__applyProject(json);
    this.__emitChange();
  }

  private __componentBaseSnapshot(state: any): any {
    return {
      display: state.display,
      zIndex: state.zIndex,
      transform: state.transform,
      origin: state.origin,
      originX: state.originX,
      originY: state.originY,
      lineDash: state.lineDash,
      lineDashOffset: state.lineDashOffset,
      lineDashFlow: state.lineDashFlow,
      lineDashFlowSpeed: state.lineDashFlowSpeed,
      lineBorder: state.lineBorder,
      lineBorderWidth: state.lineBorderWidth,
      lineBorderColor: state.lineBorderColor,
      fill: state.fill,
      stroke: state.stroke,
      linkable: state.linkable,
      transformable: state.transformable,
      animations: state.animations,
    };
  }

  private __entitySnapshot(entity: any): any {
    const state = entity.state || {};
    return {
      id: state.id,
      typeId: Entity.typeId,
      left: state.left,
      top: state.top,
      width: state.width,
      height: state.height,
      entityName: state.entityName,
      fields: state.fields,
      style: state.style,
      headerStyle: state.headerStyle,
      fieldStyle: state.fieldStyle,
      dividerStyle: state.dividerStyle,
      draggable: state.draggable,
      interactive: state.interactive,
      showMinBoundingBox: state.showMinBoundingBox,
      showMaxBoundingBox: state.showMaxBoundingBox,
      ...this.__componentBaseSnapshot(state),
    };
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
    return {
      id: state.id,
      typeId: Relation.typeId,
      left: state.left,
      top: state.top,
      width: state.width,
      height: state.height,
      relationType: state.relationType,
      referencedColumnName: state.referencedColumnName,
      sourceField: state.sourceField,
      targetField: state.targetField,
      nullable: state.nullable,
      onDelete: state.onDelete,
      onUpdate: state.onUpdate,
      joinTableName: state.joinTableName,
      fromKey: state.fromKey,
      toKey: state.toKey,
      sourceCardinality: state.sourceCardinality,
      targetCardinality: state.targetCardinality,
      label: state.label,
      labelStyle: state.labelStyle,
      style: state.style,
      arrow: state.arrow,
      lineType: state.lineType,
      escapeDistance: state.escapeDistance,
      routeType: state.routeType,
      routeOffset: state.routeOffset,
      curveType: state.curveType,
      linkShape: state.linkShape, //连线形态（visio/bezier）；不加进来会导致保存/加载/undo/redo 丢失
      lineDash: state.lineDash,
      lineWidth: state.lineWidth,
      arrowLength: state.arrowLength,
      arrowAngel: state.arrowAngel,
      arrowStyle: state.arrowStyle,
      startPoint: state.startPoint,
      endPoint: state.endPoint,
      links: state.links,
      draggable: state.draggable,
      interactive: state.interactive,
      showMinBoundingBox: state.showMinBoundingBox,
      showMaxBoundingBox: state.showMaxBoundingBox,
      ...this.__componentBaseSnapshot(state),
    };
  }

  private __applyProject(json: string): void {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.entities)) {
      return;
    }
    if (data.schemaVersion !== undefined && data.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      throw new Error(`Unsupported project schemaVersion: ${data.schemaVersion}`);
    }
    const validation = validateProjectSnapshot(data);
    if (!validation.valid) {
      throw new Error(`Invalid project snapshot:\n${validation.errors.join('\n')}`);
    }

    const renderer = this.ice.renderer;
    if (renderer) {
      renderer.stop();
    }

    try {
      // 先清空旧项目，避免旧内容与新内容叠加。
      this.ice.clearAll();
      if (this.ice.ctx && typeof this.ice.ctx.clearRect === 'function') {
        this.ice.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ice.ctx.clearRect(0, 0, this.ice.canvasWidth || 0, this.ice.canvasHeight || 0);
      }

      const entities: any[] = [];
      const entityMap = new Map<string, any>();
      data.entities.forEach((item: any) => {
        const entity = new Entity(item);
        this.ice.addChild(entity);
        entities.push(entity);
        if (item.id) {
          entityMap.set(item.id, entity);
        }
      });

      (data.relations || []).forEach((item: any) => {
        const relation = new Relation(item);
        this.ice.addChild(relation);
      });

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
  }

  private __applyHistorySnapshot(json: string): void {
    this.__historyEnabled = false;
    this.__applyProject(json);
    this.selectedId = null;
    this.__historyEnabled = true;
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
    this.__redoStack.push(current);
    this.__applyHistorySnapshot(this.__undoStack.pop());
    this.__emitChange();
  }

  public redo(): void {
    if (!this.canRedo()) {
      return;
    }
    const current = this.serializeProject();
    this.__undoStack.push(current);
    this.__applyHistorySnapshot(this.__redoStack.pop());
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
