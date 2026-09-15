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
 * **阈值取 2（比引擎默认的 3 更紧）**（2026-09-15 实测）：阈值就是吸附半径，它必须明显小于
 * "候选线沿拖动路径的间距"。本仓的领域图都是**密集版面**（水务工艺图 34 个单元，候选线沿路径
 * 间距约 14 世界 px），而此前示例里用的 `threshold: 6` 在 0.5× 缩放下是 12 世界 px ——
 * 等于指针处处都在吸附带里：拖动时图元被一颗颗"钉子"挨个吸住（实测 24 步里 19 步在吸附、
 * 相邻步位移变化最大 18px，肉眼就是"引导线和图元乱跳"）。收到 2 之后：11/24 步吸附、
 * 单步位移变化 ≤6 世界 px（≈3 屏幕 px），且命中期间锁在同一条线不再改主意。
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
  // 阈值 2：比引擎默认（3）更紧，理由见上面的实测。刻意不写 `{ threshold: 6 }`——
  // 那个值对"几十个图元的密集版面"太大（把吸附概率从 11/24 抬到 19/24，单步位移变化从 6px 抬到 18px）。
  ice.alignmentGuide.enable({ threshold: 2 });
  return ice;
}
