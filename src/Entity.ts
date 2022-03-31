/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICEText } from 'ice-render';
import isNil from 'lodash/isNil';
import merge from 'lodash/merge';

/**
 * @class Entity 实体
 * @author 大漠穷秋<damoqiongqiu@126.com>
 */
export default class Entity extends ICEGroup {
  protected entityNameComponent: ICEText;
  protected entityFieldsComponent: Array<ICEText> = [];

  constructor(props) {
    let param = Entity.arrangeParam(props);
    super(param);
  }

  protected static arrangeParam(props) {
    let param = merge(
      {
        entityName: 'Entity Name',
        fields: [],
      },
      props,
      {
        transformable: false,
      }
    );
    if (isNil(param.entityName)) {
      param.entityName = 'Entity Name';
    }
    if (isNil(param.fields)) {
      param.fields = [];
    }
    return param;
  }

  protected doRender(): void {
    if (this.dirty) {
      this.syncEntityNameAndFields();
    }
    this.doLayout();
    super.doRender();
  }

  protected syncEntityNameAndFields() {
    if (this.state.entityName && !this.entityNameComponent) {
      this.entityNameComponent = new ICEText({
        left: 0,
        top: 0,
        text: this.state.entityName,
        style: {
          strokeStyle: '#333',
          fillStyle: '#333',
          // lineWidth: 5,
          fontSize: 18,
          fontWeight: 'bold',
        },
        interactive: false,
        stroke: false,
        // fill: false,
        showMinBoundingBox: true,
        showMaxBoundingBox: true,
      });
      this.addChild(this.entityNameComponent);

      //分割线
    }
    if (!isNil(this.state.fields) && !this.entityFieldsComponent.length) {
      for (let i = 0; i < this.state.fields.length; i++) {
        const field = this.state.fields[i];
        let text = new ICEText({
          left: 0,
          top: 0,
          text: `${field.name}  ${field.type}  ${field.length}`,
          style: {
            strokeStyle: '#333',
            fillStyle: '#333',
            // lineWidth: 5,
            fontSize: 18,
            fontWeight: 'normal',
          },
          interactive: false,
          stroke: false,
          // fill: false,
          showMinBoundingBox: true,
          showMaxBoundingBox: true,
        });
        this.entityFieldsComponent.push(text);
      }
      this.addChildren(this.entityFieldsComponent);
    }
  }

  protected doLayout() {
    let maxWidth = this.state.width;
    let lastY = 0;
    if (this.entityNameComponent) {
      lastY = this.childNodes[0].state.height;
      maxWidth = Math.max(maxWidth, this.childNodes[0].state.width);
    }
    for (let i = 0; i < this.entityFieldsComponent.length; i++) {
      const fieldComponent = this.entityFieldsComponent[i];
      fieldComponent.setState({
        left: 0,
        top: lastY,
      });
      lastY += fieldComponent.state.height;
      maxWidth = Math.max(maxWidth, fieldComponent.state.width);
    }
    this.setState({
      height: Math.max(lastY, this.state.height),
      width: maxWidth,
    });
  }
}
