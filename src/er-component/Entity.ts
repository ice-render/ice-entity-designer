/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { ICEGroup, ICEPolyLine, ICERect, ICEText } from 'ice-render';
import isNil from 'lodash/isNil';
import merge from 'lodash/merge';

export type EntityField = {
  name: string;
  type?: string;
  length?: number | string;
  primary?: boolean;
  foreignKey?: boolean;
  generated?: boolean;
  autoIncrement?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: any;
  comment?: string;
  index?: boolean;
};

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
  protected headerBackgroundComponent: ICERect;
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
          strokeStyle: '#334155',
          fillStyle: '#ffffff',
          radius: 8,
          lineWidth: 1.5,
        },
        headerStyle: {
          textColor: '#0f172a',
          backgroundColor: '#f1f5f9',
          fontSize: 18,
          fontWeight: 'bold',
          paddingTop: 12,
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 12,
        },
        fieldStyle: {
          textColor: '#334155',
          fontSize: 16,
          fontWeight: 'normal',
          paddingTop: 9,
          paddingLeft: 14,
          paddingRight: 14,
        },
        dividerStyle: {
          strokeStyle: '#cbd5e1',
          fillStyle: '#cbd5e1',
          lineWidth: 1,
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
      this.entityNameComponent = null;
    }
    //Header 背景带，先删除
    if (this.headerBackgroundComponent) {
      this.removeChild(this.headerBackgroundComponent);
      this.headerBackgroundComponent = null;
    }
    //分隔线，先删除
    if (this.deviderLine) {
      this.removeChild(this.deviderLine);
      this.deviderLine = null;
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
          strokeStyle: this.state.headerStyle.textColor,
          fillStyle: this.state.headerStyle.textColor,
          fontSize: this.state.headerStyle.fontSize,
          fontWeight: this.state.headerStyle.fontWeight,
          paddingTop: this.state.headerStyle.paddingTop,
          paddingLeft: this.state.headerStyle.paddingLeft,
          paddingRight: this.state.headerStyle.paddingRight,
          paddingBottom: this.state.headerStyle.paddingBottom,
        },
        interactive: false,
        stroke: false,
        showMinBoundingBox: false,
        showMaxBoundingBox: false,
      });

      if (this.state.headerStyle.backgroundColor && this.state.headerStyle.backgroundColor !== 'none') {
        this.headerBackgroundComponent = new ICERect({
          left: 0,
          top: 0,
          width: this.state.width,
          height: this.entityNameComponent.state.height,
          zIndex: this.entityNameComponent.state.zIndex - 1,
          origin: 'top-left',
          style: {
            fillStyle: this.state.headerStyle.backgroundColor,
            radius: this.state.style.radius || 0,
            lineWidth: 0,
          },
          interactive: false,
          stroke: false,
          showMinBoundingBox: false,
          showMaxBoundingBox: false,
        });
        this.addChild(this.headerBackgroundComponent);
      }
      this.addChild(this.entityNameComponent);

      this.deviderLine = new ICEPolyLine({
        left: 0,
        top: 0,
        points: [
          [0, 0],
          [this.state.width, 0],
        ],
        style: {
          strokeStyle: this.state.dividerStyle.strokeStyle,
          fillStyle: this.state.dividerStyle.fillStyle,
          lineWidth: this.state.dividerStyle.lineWidth,
        },
        interactive: false,
      });
      this.addChild(this.deviderLine);
    }

    if (!isNil(this.state.fields)) {
      const len = this.state.fields.length;
      for (let i = 0; i < len; i++) {
        const field = this.state.fields[i];
        const display = this.fieldDisplay(field);
        let text = new ICEText({
          left: 0,
          top: 0,
          text: display.text,
          style: {
            strokeStyle: this.state.fieldStyle.textColor,
            fillStyle: this.state.fieldStyle.textColor,
            fontSize: this.state.fieldStyle.fontSize,
            fontWeight: this.state.fieldStyle.fontWeight,
            paddingTop: this.state.fieldStyle.paddingTop,
            paddingLeft: this.state.fieldStyle.paddingLeft,
            paddingRight: this.state.fieldStyle.paddingRight,
            paddingBottom: i === len - 1 ? 12 : 0,
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
   * 把字段信息格式化成画布上的可读文本。
   * 常见 ER 工具会展示 PK/FK/UQ/AI/NN 等约束标记，这里做轻量实现。
   */
  protected fieldDisplay(field: EntityField): { text: string } {
    const keyTags = [];
    if (field.primary) keyTags.push('PK');
    if (field.foreignKey) keyTags.push('FK');

    const constraintTags = [];
    if (field.unique) constraintTags.push('UQ');
    if (field.autoIncrement) constraintTags.push('AI');
    if (field.nullable === false) constraintTags.push('NN');

    const keyText = keyTags.length ? `${keyTags.join(' ')} ` : '';
    const typeText = field.type ? `${field.type}${field.length ? `(${field.length})` : ''}` : '';
    const constraintText = constraintTags.length ? `  ${constraintTags.join(' ')}` : '';
    const defaultText = field.default !== undefined ? `  = ${field.default}` : '';
    const commentText = field.comment ? `  // ${field.comment}` : '';
    return {
      text: `${keyText}${field.name}${typeText ? `  ${typeText}` : ''}${constraintText}${defaultText}${commentText}`,
    };
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
    let headerHeight = 0;

    //计算实体名称的位置和尺寸
    if (this.entityNameComponent) {
      headerHeight = this.entityNameComponent.state.height;
      lastY = headerHeight;
      maxWidth = Math.max(maxWidth, this.entityNameComponent.state.width);
      lastY += this.deviderLine.state.height;
      deviderLineY = lastY;
    }

    //计算每个 ICEText 实例的位置和尺寸
    for (let i = 0; i < this.entityFieldsComponent.length; i++) {
      const fieldComponent = this.entityFieldsComponent[i];
      // calcComponentParams 不允许再调用 setState（会造成递归 dirty），这里直接写派生位置。
      fieldComponent.state.left = 0;
      fieldComponent.state.top = lastY;
      lastY += fieldComponent.state.height;
      maxWidth = Math.max(maxWidth, fieldComponent.state.width);
    }

    //计算分割线的位置和尺寸
    if (this.deviderLine) {
      this.deviderLine.state.points = [
        [0, deviderLineY],
        [maxWidth, deviderLineY],
      ];
    }

    //Header 背景带始终铺满实体当前最终宽度，与分隔线平齐。
    if (this.headerBackgroundComponent) {
      this.headerBackgroundComponent.state.left = 0;
      this.headerBackgroundComponent.state.top = 0;
      this.headerBackgroundComponent.state.width = maxWidth;
      this.headerBackgroundComponent.state.height = headerHeight;
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
      const column: any = {};
      if (field.type !== undefined) column.type = field.type;
      if (field.length !== undefined) column.length = field.length;
      if (field.primary) column.primary = true;
      if (field.generated) column.generated = true;
      if (field.autoIncrement) {
        column.generated = true;
        column.strategy = 'increment';
      }
      if (field.nullable === false) column.nullable = false;
      if (field.unique) column.unique = true;
      if (field.default !== undefined) column.default = field.default;
      if (field.comment !== undefined) column.comment = field.comment;
      if (field.index) column.index = true;
      result.columns[field.name] = column;
    });
    return result;
  }

  public setState(newState: any): void {
    const needSync = !isNil(newState.fields) || !isNil(newState.entityName);
    super.setState(newState);
    if (needSync) {
      this.syncEntityNameAndFields();
    }
  }

  /**
   * 追加字段，方便应用层以命令式方式维护实体结构。
   */
  public addField(field: EntityField): this {
    const fields = [...(this.state.fields || []), field];
    this.setFields(fields);
    return this;
  }

  /**
   * 按字段名删除字段。
   */
  public removeField(name: string): this {
    const fields = (this.state.fields || []).filter((field) => field.name !== name);
    this.setFields(fields);
    return this;
  }

  /**
   * 全量替换字段列表。
   */
  public setFields(fields: EntityField[]): this {
    this.setState({ fields });
    return this;
  }
}
