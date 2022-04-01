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

  protected doRender(): void {
    if (this.dirty) {
      this.syncEntityNameAndFields();
    }
    this.doLayout();
    super.doRender();
  }

  protected syncEntityNameAndFields() {
    if (this.state.entityName) {
      if (!this.entityNameComponent) {
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
      }

      //分隔线
      if (!this.deviderLine) {
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
    }

    if (!isNil(this.state.fields) && !this.entityFieldsComponent.length) {
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
   * @method doLayout 布局
   *
   * 重新计算位置和尺寸
   *
   * @author 大漠穷秋<damoqiongqiu@126.com>
   */
  protected doLayout() {
    let maxWidth = this.state.width;
    let lastY = 0;
    let deviderLineY = 0;

    //调整实体名称的位置和尺寸
    if (this.entityNameComponent) {
      lastY = this.childNodes[0].state.height;
      maxWidth = Math.max(maxWidth, this.childNodes[0].state.width);
      lastY += this.deviderLine.state.height;
      deviderLineY = lastY;
    }

    //调整每个 ICEText 实例的位置和尺寸
    for (let i = 0; i < this.entityFieldsComponent.length; i++) {
      const fieldComponent = this.entityFieldsComponent[i];
      fieldComponent.setState({
        left: 0,
        top: lastY,
      });
      lastY += fieldComponent.state.height;
      maxWidth = Math.max(maxWidth, fieldComponent.state.width);
    }

    //调整分割线的位置和尺寸
    if (this.deviderLine) {
      this.deviderLine.setState({
        points: [
          [0, deviderLineY],
          [maxWidth, deviderLineY],
        ],
      });
    }

    this.setState({
      height: Math.max(lastY, this.state.height),
      width: maxWidth,
    });
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
}
