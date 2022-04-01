/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { ICEVisioLink } from 'ice-render';
import Entity from './Entity';

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
  constructor(props) {
    super({
      title: 'Relation',
      relationType: 'one-to-one',
      referencedColumnName: 'id',
      ...props,
    });
  }

  /**
   * 实体类的 JSON 格式描述，与 type-orm 规定的格式对应
   */
  public toEntityObject(): any {
    let { title, relationType, referencedColumnName } = this.state;
    let fromComponent = this.links.start.component as Entity;
    let toComponent = this.links.end.component as Entity;
    let fromId = fromComponent.state.id;
    let fromName = fromComponent.state.entityName;
    let toId = toComponent.state.id;
    let toName = toComponent.state.entityName;
    let result = {
      title,
      fromId,
      fromName,
      toId,
      toName,
      relationType,
      referencedColumnName,
    };
    return result;
  }
}
