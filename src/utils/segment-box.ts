/**
 * 线段 × 轴对齐矩形（纯几何）。
 *
 * 用途：给排水符号的"**过路折线压字**"判定 —— 别人的管线从我的位号 / 名称文字带经过。
 * 用 Liang–Barsky 的裁剪判据：把线段参数化后用四个半平面依次夹逼，夹完还有交集就算相交。
 * 不分配对象、不做开方，几十万次调用也不心疼（设计器只在增删管线 / 载入 / 松手时跑）。
 */
export interface SegmentPoint {
  x: number;
  y: number;
}
export interface SegmentBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 线段 `a→b` 与矩形 `box` 是否相交（含"贴边""端点落在矩形内"）。 */
export function segmentHitsBox(a: SegmentPoint, b: SegmentPoint, box: SegmentBox): boolean {
  if (!a || !b || !box) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // 四个半平面：左、右、下、上（p 为方向分量，q 为到该边的距离）
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - box.minX, box.maxX - a.x, a.y - box.minY, box.maxY - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // 平行于这条边：在外侧就整段不相交
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}
