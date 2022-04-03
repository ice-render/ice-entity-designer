/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICEPolyLine, ICEText } from 'ice-render';
import isNil from 'lodash/isNil';
import merge from 'lodash/merge';

/**
 * @class Entity 实体
 *
 * 所有参数按照 typeorm 要求的格式传入。
 *
 * @see https://typeorm.io/#/separating-entity-definition
 * @author 大漠穷秋<damoqiongqiu@126.com>
 */
export default class Entity extends ICEGroup {
  protected entityNameComponent: ICEText;
  protected deviderLine: ICEPolyLine;
  protected entityFieldsComponent: Array<ICEText> = [];

  constructor(props) {
    let param = Entity.arrangeParam(props);
    super(param);
    this.syncEntityNameAndFields();
  }

  protected static arrangeParam(props) {
    let param = merge(
      {
        entityName: 'Entity Name',
        fields: [],
        style: {
          strokeStyle: '#000',
          fillStyle: '#00eeff',
        },
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

  /**
   * @method syncEntityNameAndFields 同步实体名称和字段
   * 实体名称和字段随时可能发生变化，当变化发生时，会把原有的实体名称和字段全部删除，然后重新创建新的实例。
   * 此方法会在 constructor 和 setState 中被调用。
   * @see setState
   */
  protected syncEntityNameAndFields() {
    //Entity 名称，先删除
    if (this.entityNameComponent) {
      this.removeChild(this.entityNameComponent);
    }
    //分隔线，先删除
    if (this.deviderLine) {
      this.removeChild(this.deviderLine);
    }

    //字段，先删除
    if (this.entityFieldsComponent.length) {
      this.removeChildren(this.entityFieldsComponent);
      this.entityFieldsComponent.length = 0;
    }

    if (this.state.entityName) {
      this.entityNameComponent = new ICEText({
        left: 0,
        top: 0,
        text: this.state.entityName,
        style: {
          strokeStyle: '#222',
          fillStyle: '#222',
          fontSize: 18,
          fontWeight: 'bold',
          paddingTop: 10,
          paddingLeft: 10,
          paddingRight: 10,
          paddingBottom: 10,
        },
        interactive: false,
        stroke: false,
        showMinBoundingBox: false,
        showMaxBoundingBox: false,
      });
      this.addChild(this.entityNameComponent);

      this.deviderLine = new ICEPolyLine({
        left: 0,
        top: 0,
        points: [
          [0, 0],
          [this.state.width, 0],
        ],
        style: {
          strokeStyle: '#333',
          fillStyle: '#333',
          lineWidth: 2,
        },
        interactive: false,
      });
      this.addChild(this.deviderLine);
    }

    if (!isNil(this.state.fields)) {
      const len = this.state.fields.length;
      for (let i = 0; i < len; i++) {
        const field = this.state.fields[i];
        let text = new ICEText({
          left: 0,
          top: 0,
          text: `${field.name}  ${field.type}  ${field.length}`,
          style: {
            strokeStyle: '#222',
            fillStyle: '#222',
            fontSize: 18,
            fontWeight: 'normal',
            paddingTop: 10,
            paddingLeft: 10,
            paddingRight: 10,
            paddingBottom: i === len - 1 ? 10 : 0,
          },
          interactive: false,
          stroke: false,
          showMinBoundingBox: false,
          showMaxBoundingBox: false,
        });
        this.entityFieldsComponent.push(text);
      }
      this.addChildren(this.entityFieldsComponent);
    }
  }

  /**
   * @overwrite
   * @method calcComponentParams
   *
   * @see ICEComponent.calcComponentParams
   * @author 大漠穷秋<damoqiongqiu@126.com>
   */
  protected calcComponentParams() {
    let maxWidth = this.state.width;
    let lastY = 0;
    let deviderLineY = 0;

    //计算实体名称的位置和尺寸
    if (this.entityNameComponent) {
      lastY = this.childNodes[0].state.height;
      maxWidth = Math.max(maxWidth, this.childNodes[0].state.width);
      lastY += this.deviderLine.state.height;
      deviderLineY = lastY;
    }

    //计算每个 ICEText 实例的位置和尺寸
    for (let i = 0; i < this.entityFieldsComponent.length; i++) {
      const fieldComponent = this.entityFieldsComponent[i];
      fieldComponent.setState({
        left: 0,
        top: lastY,
      });
      lastY += fieldComponent.state.height;
      maxWidth = Math.max(maxWidth, fieldComponent.state.width);
    }

    //计算分割线的位置和尺寸
    if (this.deviderLine) {
      this.deviderLine.setState({
        points: [
          [0, deviderLineY],
          [maxWidth, deviderLineY],
        ],
      });
    }

    //根据计算出来的宽高调整容器的尺寸
    const width = maxWidth;
    const height = Math.max(lastY, this.state.height);
    this.state.width = width;
    this.state.height = height;
    return { width, height };
  }

  /**
   * 实体类的 JSON 格式描述，与 type-orm 规定的格式对应
   *
   * {
   *     name: "category",
   *     columns: {
   *         id: {
   *             type: Number,
   *             primary: true,
   *             generated: true
   *         },
   *         name: {
   *             type: String
   *         }
   *     }
   * }
   *
   * @see https://orkhan.gitbook.io/typeorm/docs/separating-entity-definition
   */
  public toEntityObject(): any {
    let result = {
      name: this.state.entityName,
      columns: {},
    };
    this.state.fields.forEach((field, index) => {
      result.columns[field.name] = { ...field };
    });
    return result;
  }

  public setState(newState: any): void {
    let needSync = false;
    if (!isNil(newState.fields)) {
      this.state.fields = newState.fields;
      needSync = true;
    }
    if (!isNil(newState.entityName)) {
      this.state.entityName = newState.entityName;
      needSync = true;
    }
    if (needSync) {
      this.syncEntityNameAndFields();
    }
    super.setState(newState);
  }
}
