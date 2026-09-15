/**
 * 按两个节点的**相对方位**挑连线的出/入端口。
 *
 * 为什么需要它：端口一旦写死（状态图默认 `R→L`、ER 关系默认 `R→L`），只要目标实际落在**另一侧**
 * （例如目标在源的左下方），线的首段就会从"背对目标的那个端口"出发、再折回来 —— 折线不仅画在节点
 * 身上（观感就是线穿过方块），还会让节点中心被线抢走点击（引擎侧另有命中语义兜底，见
 * `ICEPolyLine.containsPoint`）。按方位自动选端口后，首/末段总是朝对方那一侧离开/进入。
 *
 * 判定：在 4×4 个端口组合里挑一对 —— 优先"两边都朝着对方"（用节点中心与端口法线做点积判断，
 * 避免选出背对的端口让正交路由无解），同档再比**端口间直线距离**取近者。
 * 只按中心方位取一个主导轴是不够的：两个盒子互相重叠、或长短边差异很大时，主导轴给出的那对端口
 * 可能一个朝外一个朝内，路由就会先绕出去再折回来（极端情况下连解都找不到）。
 *
 * 显式传入 `sourcePort` / `targetPort` 的调用方优先级更高（本函数只负责"默认值"）。
 */

export type PortSide = 'T' | 'R' | 'B' | 'L';

export interface PortPair {
  sourcePort: PortSide;
  targetPort: PortSide;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const SIDES: PortSide[] = ['T', 'R', 'B', 'L'];
/** 端口法线（朝外）：T 朝上 … */
const NORMAL: Record<PortSide, [number, number]> = { T: [0, -1], R: [1, 0], B: [0, 1], L: [-1, 0] };

function boxOf(component: any): Box | null {
  if (!component || typeof component.getMaxBoundingBox !== 'function') {
    return null;
  }
  const mm = component.getMaxBoundingBox(true).getMinAndMaxPoint();
  return { minX: mm.minX, minY: mm.minY, maxX: mm.maxX, maxY: mm.maxY };
}

function centerOf(box: Box): [number, number] {
  return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
}

function portPoint(box: Box, side: PortSide): [number, number] {
  const [cx, cy] = centerOf(box);
  if (side === 'T') return [cx, box.minY];
  if (side === 'B') return [cx, box.maxY];
  if (side === 'L') return [box.minX, cy];
  return [box.maxX, cy];
}

/**
 * @param source 连线的起点组件
 * @param target 连线的终点组件
 * @param fallback 几何不可用时的兜底端口（各设计器原本的默认值）
 */
export function autoPorts(source: any, target: any, fallback: PortPair): PortPair {
  const a = boxOf(source);
  const b = boxOf(target);
  if (!a || !b) {
    return { ...fallback };
  }
  const ac = centerOf(a);
  const bc = centerOf(b);
  let best: PortPair = { ...fallback };
  let bestCost = Infinity;
  for (const sourcePort of SIDES) {
    const p = portPoint(a, sourcePort);
    const ns = NORMAL[sourcePort];
    // 源端口"朝着目标"：目标中心落在该端口法线的前方
    const sourceFacing = (bc[0] - p[0]) * ns[0] + (bc[1] - p[1]) * ns[1] >= 0;
    for (const targetPort of SIDES) {
      const q = portPoint(b, targetPort);
      const nt = NORMAL[targetPort];
      const targetFacing = (ac[0] - q[0]) * nt[0] + (ac[1] - q[1]) * nt[1] >= 0;
      // 端口到端口也必须是"朝前"的：只看中心在**两个盒子横向重叠**时会骗人
      // （甘特图里两条任务条常常只错开半个身位：源 R=252、目标 L=224，R→L 直接倒挂，
      //  正交路由只好先向右逃逸再折回来，于是线横穿源任务条自己 —— 实测 47 条依赖里有 3 条这样）
      const forward =
        (q[0] - p[0]) * ns[0] + (q[1] - p[1]) * ns[1] >= 0 && (p[0] - q[0]) * nt[0] + (p[1] - q[1]) * nt[1] >= 0;
      const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
      // 优先级：两端都朝对方 + 端口不倒退的最优；任何一项不满足都重罚（仅在找不到合格组合时才退而求其次）
      const cost = (sourceFacing ? 0 : 1e6) + (targetFacing ? 0 : 1e6) + (forward ? 0 : 1e6) + dist;
      if (cost < bestCost) {
        bestCost = cost;
        best = { sourcePort, targetPort };
      }
    }
  }
  return best;
}
