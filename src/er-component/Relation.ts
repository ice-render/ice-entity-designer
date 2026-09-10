/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { ICEVisioLink } from 'ice-render';

/**
 * @class Relation
 *
 * 用来描述实体类之间的关系，外观是一条带箭头的连接线。
 * 所有参数按照 typeorm 要求的格式传入。
 *
 * @see https://typeorm.io/#/separating-entity-definition
 * @author 大漠穷秋<damoqiongqiu@126.com>
 */
export default class Relation extends ICEVisioLink {
  constructor(props: any = {}) {
    const normalizedProps = Relation.normalizeLinks(props || {});
    const relationType = normalizedProps.relationType || 'one-to-one';
    const label = Relation.composeLabel(normalizedProps, relationType);
    const arrow = normalizedProps.arrow || Relation.defaultArrow(relationType);
    super({
      title: 'Relation',
      relationType,
      referencedColumnName: 'id',
      sourceField: 'id',
      targetField: 'id',
      arrow,
      ...normalizedProps,
      label,
      labelStyle: {
        fontSize: 14,
        fillStyle: '#334155',
        backgroundColor: '#ffffff',
        ...(normalizedProps.labelStyle || {}),
      },
    });
  }

  /**
   * 根据关系类型推断箭头方向，默认指向 FK 所在的一端。
   */
  public static defaultArrow(relationType: string): string {
    switch (relationType) {
      case 'one-to-many':
        return 'end';
      case 'many-to-one':
        return 'start';
      case 'many-to-many':
      case 'one-to-one':
      default:
        return 'none';
    }
  }

  /**
   * 兼容语义化的连接点写法：top/right/bottom/left/center -> T/R/B/L/C。
   * 内核 ICELinkSlot 使用单字母标识，这里让应用层可以用更直观的单词。
   */
  private static normalizeLinks(props) {
    if (!props || !props.links) return props || {};
    const map = { top: 'T', right: 'R', bottom: 'B', left: 'L', center: 'C' };
    const links = { ...props.links };
    if (links.start && map[links.start.position]) {
      links.start = { ...links.start, position: map[links.start.position] };
    }
    if (links.end && map[links.end.position]) {
      links.end = { ...links.end, position: map[links.end.position] };
    }
    return { ...props, links };
  }

  /**
   * 允许应用层覆盖两端的基数写法，例如 sourceCardinality: '0..1'。
   */
  public static cardinalityLabel(relationType: string, props: any = {}): string {
    const defaults: Record<string, [string, string]> = {
      'one-to-many': ['1', 'N'],
      'many-to-one': ['N', '1'],
      'many-to-many': ['N', 'N'],
      'one-to-one': ['1', '1'],
    };
    const [defaultSource, defaultTarget] = defaults[relationType] || defaults['one-to-one'];
    return `${props.sourceCardinality || defaultSource} : ${props.targetCardinality || defaultTarget}`;
  }

  /**
   * 在基数之外把 onDelete / onUpdate 语义显示到连线标签上，便于评审 schema。
   */
  public static composeLabel(props: any, relationType: string): string {
    if (props.label) {
      return props.label;
    }
    return Relation.buildLabel(props, relationType);
  }

  /**
   * 根据当前关系参数重新计算标签，忽略已有的 label，供属性面板实时更新使用。
   */
  public static buildLabel(props: any, relationType: string): string {
    const constraints = [];
    if (props.onDelete) constraints.push(`ON DELETE ${props.onDelete}`);
    if (props.onUpdate) constraints.push(`ON UPDATE ${props.onUpdate}`);
    const base = Relation.cardinalityLabel(relationType, props);
    return constraints.length ? `${base}  (${constraints.join(', ')})` : base;
  }

  /**
   * 实体类的 JSON 格式描述，与 type-orm 规定的格式对应
   */
  public toEntityObject(): any {
    let {
      title,
      relationType,
      referencedColumnName,
      sourceField,
      targetField,
      nullable,
      onDelete,
      onUpdate,
      joinTableName,
      fromKey,
      toKey,
    } = this.state;
    let fromComponent, toComponent, fromId, fromName, toId, toName;
    if (this.state.links && this.state.links.start && this.state.links.start.id) {
      fromId = this.state.links.start.id;
      fromComponent = this.ice.findComponent(fromId);
      fromName = fromComponent.state.entityName;
    }
    if (this.state.links && this.state.links.end && this.state.links.end.id) {
      toId = this.state.links.end.id;
      toComponent = this.ice.findComponent(toId);
      toName = toComponent.state.entityName;
    }

    let result = {
      title,
      fromId,
      fromName,
      toId,
      toName,
      relationType,
      referencedColumnName,
      sourceField,
      targetField,
      nullable: nullable === false ? false : undefined,
      onDelete,
      onUpdate,
      joinTableName,
      fromKey,
      toKey,
    };
    return result;
  }
}
