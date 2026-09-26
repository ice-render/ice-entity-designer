/**
 * 线段 × 矩形（`src/utils/segment-box.ts`）—— 给排水符号"过路折线压字"判定的底层几何。
 *
 * 判据用 Liang–Barsky 的夹逼：把线段参数化后依次被四个半平面裁剪，夹完还有交集就算相交。
 * 边界行为要钉死（"贴边""端点落在矩形内""平行在外侧"），因为上游判定是**噪声敏感**的：
 * 差一个像素就会让标签来回跳。
 */
import { segmentHitsBox } from '../../src/utils/segment-box';

const rect = { minX: 0, minY: 0, maxX: 100, maxY: 20 };

describe('线段 × 矩形', () => {
  it('横穿 / 竖穿 → 相交', () => {
    expect(segmentHitsBox({ x: -10, y: 10 }, { x: 110, y: 10 }, rect)).toBe(true);
    expect(segmentHitsBox({ x: 50, y: -10 }, { x: 50, y: 30 }, rect)).toBe(true);
  });

  it('斜穿 → 相交', () => {
    expect(segmentHitsBox({ x: -10, y: -10 }, { x: 30, y: 30 }, rect)).toBe(true);
  });

  it('完全在外（上下左右）→ 不相交', () => {
    expect(segmentHitsBox({ x: -10, y: -5 }, { x: 110, y: -5 }, rect)).toBe(false); // 上方
    expect(segmentHitsBox({ x: -10, y: 30 }, { x: 110, y: 30 }, rect)).toBe(false); // 下方
    expect(segmentHitsBox({ x: -50, y: 10 }, { x: -1, y: 10 }, rect)).toBe(false); // 左侧
    expect(segmentHitsBox({ x: 101, y: 10 }, { x: 200, y: 10 }, rect)).toBe(false); // 右侧
  });

  it('端点落在矩形内 → 相交；线段只是"延长线"经过（端点之外）→ 不相交', () => {
    expect(segmentHitsBox({ x: 50, y: 10 }, { x: 50, y: 99 }, rect)).toBe(true);
    expect(segmentHitsBox({ x: 200, y: 30 }, { x: 300, y: 40 }, rect)).toBe(false);
  });

  it('贴边算相交（判定要保守：宁可让标签让开，也别压着）', () => {
    expect(segmentHitsBox({ x: -10, y: 0 }, { x: 110, y: 0 }, rect)).toBe(true); // 贴上边
    expect(segmentHitsBox({ x: 0, y: 0 }, { x: 0, y: 20 }, rect)).toBe(true); // 贴左边
  });

  it('零长度线段：落在矩形内算相交、在外不算', () => {
    expect(segmentHitsBox({ x: 50, y: 10 }, { x: 50, y: 10 }, rect)).toBe(true);
    expect(segmentHitsBox({ x: 50, y: 50 }, { x: 50, y: 50 }, rect)).toBe(false);
  });
});
