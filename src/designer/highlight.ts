/**
 * 设计器的「程序化高亮」原语。
 *
 * ## 为什么这是一个缺口
 *
 * 「指着讲」这类需求（agent / 教程 / 演示：高亮某个图元并讲解）在应用层一直**没有正规入口**：
 *
 * | 看起来能用的 | 实际情况 |
 * | --- | --- |
 * | `ice.setSelection([node])` | 只写 `selectionList`（a11y / 插件读），**不画** |
 * | `designer.select(id)` | 只写 `selectedId` 字段并广播变更，**没有渲染消费者** |
 * | `setInteractionState('selected')` | 图元普遍没有 `states` 表，合并进去等于空操作 |
 * | `chrome.selection` | 只被控制面板消费，而控制面板**只由 mousedown 触发**，没有程序化入口 |
 *
 * 应用层只能自己"打 style 补丁 + 手动置脏"来模拟，既依赖组件内部实现，
 * 又要在每次 `syncShape` 触发条件变化时重新对表。
 *
 * ## 这一层的语义
 *
 * - 高亮是**视图状态**：不进快照、不参与命中、不参与连线端点查找；
 * - 放在**工具层**（`ice.addTool`）—— 图元可能在容器里（BPMN 池 / 泳道 / 端子排），
 *   只有工具层能保证任何嵌套深度都画得出来；
 * - 默认**只描边不填充**（焦点环）：工具层整体画在组件层之上，填充会盖住位号与名称，
 *   而那两样正是要读的东西。确实要底色时显式给 `fill`（建议低透明度）。
 */
import { DEFAULT_THEME, ICERect } from 'ice-render';

/** 一条高亮目标：图元 id + 它的**全局**包围盒（世界坐标）。 */
export type DesignerHighlightEntry = {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DesignerHighlightOptions = {
  /** 描边色，默认取引擎主题的 `semantic.primary`。 */
  color?: string;
  /** 描边宽度，默认 3。 */
  lineWidth?: number;
  /** 相对图元包围盒的外扩量，默认 4（描边不贴着图形边）。 */
  padding?: number;
  /** 圆角半径，默认 6。 */
  radius?: number;
  /** 底色。`false`（默认）表示只描边；给了颜色则画在图元**之上**（见文件抬头）。 */
  fill?: string | false;
};

/**
 * 高亮层：持有工具层里的一个 `ICERect` 集合，按调用方给的包围盒摆放。
 *
 * 由 `FlowDesigner` 持有并对外暴露（`setHighlights` / `highlight` / `clearHighlights`），
 * 应用层不需要直接用它。
 */
export default class DesignerHighlightLayer {
  private ice: any;
  /** id → 工具层里的那块矩形。空表示当前没有高亮。 */
  private boxes = new Map<string, any>();
  private options: DesignerHighlightOptions = {
    color: '',
    lineWidth: 3,
    padding: 4,
    radius: 6,
    fill: false,
  };

  constructor(ice: any) {
    this.ice = ice;
  }

  /** 当前高亮的 id（调用顺序）。 */
  public get ids(): string[] {
    return Array.from(this.boxes.keys());
  }

  /**
   * 用一批目标替换当前高亮（先摆位置、再清理不再需要的）。
   *
   * 传空数组等价于 `clear()` —— 高亮层会整个从工具层摘掉，
   * 不给引擎留一块空图层（`toolNodes` 里本来就有一堆引擎自己的工具，
   * 多留一块看不出来的空图层只会让"数自己的层有没有泄漏"变得不可能）。
   */
  public set(entries: DesignerHighlightEntry[], options: DesignerHighlightOptions = {}): void {
    this.options = { ...this.options, ...options };
    const keep = new Set(entries.map((entry) => entry.id));
    Array.from(this.boxes.keys()).forEach((id) => {
      if (!keep.has(id)) {
        this.__remove(id);
      }
    });
    entries.forEach((entry) => this.__place(entry));
    if (!this.boxes.size) {
      this.__destroy();
    }
    if (this.ice && typeof this.ice.requestRepaint === 'function') {
      this.ice.requestRepaint();
    }
  }

  /** 清掉全部高亮。 */
  public clear(): void {
    this.boxes.forEach((box) => {
      if (this.ice && typeof this.ice.removeTool === 'function') {
        this.ice.removeTool(box);
      }
    });
    this.boxes.clear();
    if (this.ice && typeof this.ice.requestRepaint === 'function') {
      this.ice.requestRepaint();
    }
  }

  /** 新建或就地更新某个 id 的高亮框。 */
  private __place(entry: DesignerHighlightEntry): void {
    const pad = Number(this.options.padding) || 0;
    const left = entry.minX - pad;
    const top = entry.minY - pad;
    const width = Math.max(1, entry.maxX - entry.minX + pad * 2);
    const height = Math.max(1, entry.maxY - entry.minY + pad * 2);

    let box = this.boxes.get(entry.id);
    if (!box) {
      box = new ICERect({
        left,
        top,
        width,
        height,
        radius: this.options.radius,
        fill: !!this.options.fill,
        stroke: true,
        // 工具层里的 UI 覆盖层：既不进快照，也不能被点到（否则高亮会挡住图元自己的交互）
        interactive: false,
        draggable: false,
        transformable: false,
        linkable: false,
        style: {
          fillStyle: this.options.fill || 'transparent',
          strokeStyle: this.__color(),
          lineWidth: this.options.lineWidth,
        },
      });
      (box as any).__iceDesignerHighlight = true;
      this.boxes.set(entry.id, box);
      this.ice.addTool(box);
      return;
    }
    // 已存在 → 只改几何与外观：`setState` 会自己置脏，不需要外部再补一次
    box.setState({
      left,
      top,
      width,
      height,
      radius: this.options.radius,
      fill: !!this.options.fill,
      style: {
        fillStyle: this.options.fill || 'transparent',
        strokeStyle: this.__color(),
        lineWidth: this.options.lineWidth,
      },
    });
  }

  private __remove(id: string): void {
    const box = this.boxes.get(id);
    if (!box) {
      return;
    }
    this.boxes.delete(id);
    if (this.ice && typeof this.ice.removeTool === 'function') {
      this.ice.removeTool(box);
    }
  }

  /** 一块不剩时把整层摘掉（不留在 toolNodes 里）。 */
  private __destroy(): void {
    this.boxes.forEach((box) => {
      if (this.ice && typeof this.ice.removeTool === 'function') {
        this.ice.removeTool(box);
      }
    });
    this.boxes.clear();
  }

  /**
   * 描边色：显式给了就用，否则取引擎主题的主色（换主题跟着走）。
   *
   * 兜底值取自引擎的 `DEFAULT_THEME`（**不写死色值** —— 本仓有"写死色值只许减"的预算棘轮，
   * 而且引擎换品牌基线时这里要跟着动）。
   */
  private __color(): string {
    if (this.options.color) {
      return this.options.color;
    }
    try {
      const theme: any = this.ice && typeof this.ice.getTheme === 'function' ? this.ice.getTheme() : null;
      return (theme && theme.semantic && theme.semantic.primary) || DEFAULT_THEME.semantic.primary;
    } catch {
      return DEFAULT_THEME.semantic.primary;
    }
  }
}
