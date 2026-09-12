/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 电压等级与色标。
 *
 * 电力行业习惯用颜色区分电压等级，但**各电网公司/各设计院的规范并不统一**，
 * 所以这里给的是**可覆盖的默认值**（按公开资料里流传较广的一套命名：
 * 500kV 淡黄、220kV 紫、110kV 朱红、35kV 鲜黄、10kV 绛红、6kV 深蓝），
 * 颜色名对应的是行业称呼，hex 是近似值 —— 需要贴合某家公司规范时，
 * 用 `PowerDesigner.setVoltageColors({ '110kV': '#xxxxxx' })` 覆盖即可。
 */

export type PowerVoltageLevel = {
  /** 等级标识：'500kV' / '220kV' / '110kV' / '35kV' / '10kV' / '6kV' */
  level: string;
  /** 行业里的颜色称呼 */
  colorName: string;
  /** 近似的 hex 值（可被覆盖） */
  color: string;
  /** 标称电压（kV），用于排序与展示 */
  kv: number;
};

export const POWER_VOLTAGE_LEVELS: PowerVoltageLevel[] = [
  { level: '500kV', colorName: '淡黄', color: '#f2e394', kv: 500 },
  { level: '220kV', colorName: '紫', color: '#8b5cf6', kv: 220 },
  { level: '110kV', colorName: '朱红', color: '#e05252', kv: 110 },
  { level: '35kV', colorName: '鲜黄', color: '#f5c518', kv: 35 },
  { level: '10kV', colorName: '绛红', color: '#9b1c31', kv: 10 },
  { level: '6kV', colorName: '深蓝', color: '#1d4ed8', kv: 6 },
];

/** 未标注电压等级时用的中性色（不参与色标语义） */
export const POWER_NEUTRAL_COLOR = '#1f2937';

/** 默认色标表（level → color） */
export function defaultVoltageColors(): Record<string, string> {
  const table: Record<string, string> = {};
  POWER_VOLTAGE_LEVELS.forEach((item) => {
    table[item.level] = item.color;
  });
  return table;
}

/** 按等级取颜色；没标等级或等级不认识时回落到中性色 */
export function voltageColorOf(level: string, table?: Record<string, string>): string {
  if (!level) {
    return POWER_NEUTRAL_COLOR;
  }
  const colors = table || defaultVoltageColors();
  return colors[level] || POWER_NEUTRAL_COLOR;
}
