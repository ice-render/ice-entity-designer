/**
 * 设计器的「拖拽对齐引导线」默认开关。
 *
 * 为什么由**设计器**打开、而不是各页面自己记着调：
 * 设计器里的图元位置**就是数据**，没有布局可以约束它（用户想拖到哪就拖到哪）。
 * 没有对齐引导时，"看着对齐了、实际差 3px"的卡片与"端点差 5px"的连线会越拖越多，
 * 一张图很快就乱了 —— 所以这不是可选装饰，而是编辑器的基础能力。
 *
 * 边界：**引擎**把 `alignmentGuide` 默认关掉是对的（引擎不知道宿主是不是编辑器，
 * 也不知道宿主有没有自己的对齐方案）；设计器是应用层，正是该打开它的那一层。
 * 之前每个示例各写一行 `ice.alignmentGuide.enable(...)`，于是新页面很容易漏掉
 * （流程图与水务示例就漏了），现在统一收在这里。
 *
 * 宿主想改阈值或关掉：
 * ```ts
 * const designer = new EntityDesigner(ice);
 * ice.alignmentGuide.setOptions({ threshold: 10 }); // 更"黏"一点
 * ice.alignmentGuide.disable();                    // 或完全关掉
 * ```
 */
export function enableDesignerAlignmentGuides(ice: any): any {
  if (!ice || !ice.alignmentGuide || typeof ice.alignmentGuide.enable !== 'function') {
    return ice;
  }
  ice.alignmentGuide.enable({ threshold: 6 });
  return ice;
}
