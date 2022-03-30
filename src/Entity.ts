/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup } from 'ice-render';
import merge from 'lodash/merge';

/**
 * @class Entity 实体
 * @author 大漠穷秋<damoqiongqiu@126.com>
 */
export default class Entity extends ICEGroup {
  constructor(props) {
    let param = Entity.arrangeParam(props);
    super(param);
  }

  protected static arrangeParam(props) {
    let param = merge(
      {
        entityName: 'Entity',
        fields: [],
      },
      props
    );
    return param;
  }

  protected doRender(): void {
    super.doRender();
    //FIXME: render entityName and fields
  }
}
