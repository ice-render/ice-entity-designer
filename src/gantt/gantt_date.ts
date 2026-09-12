/**
 * 甘特包的日期小工具（UTC 计算，避免时区导致的「差一天」）。
 *
 * 日期在文档里就是字符串 `YYYY-MM-DD`（人类与 AI 都直接可读），内部换算成「距起点的天数」
 * 再做像素映射 —— 不用 Date 对象做业务状态，序列化时也不会引入时区问题。
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` → UTC 时间戳（非法输入返回 NaN） */
export function parseDate(iso: string): number {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!matched) {
    return Number.NaN;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  return Date.UTC(year, month - 1, day);
}

/** UTC 时间戳 → `YYYY-MM-DD` */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 加天数 */
export function addDays(iso: string, days: number): string {
  const timestamp = parseDate(iso);
  return isNaN(timestamp) ? iso : formatDate(timestamp + days * MS_PER_DAY);
}

/** 相差天数（to - from） */
export function diffDays(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return isNaN(a) || isNaN(b) ? 0 : Math.round((b - a) / MS_PER_DAY);
}

/** 两个日期之间（含）的每一天，用于渲染刻度 */
export function eachDay(from: string, to: string, limit = 400): string[] {
  const start = parseDate(from);
  const end = parseDate(to);
  if (isNaN(start) || isNaN(end) || end < start) {
    return [];
  }
  const out: string[] = [];
  for (let t = start; t <= end && out.length < limit; t += MS_PER_DAY) {
    out.push(formatDate(t));
  }
  return out;
}

/** 刻度文案：`03-02`（月-日）；月初额外给出月份，便于阅读 */
export function tickLabel(iso: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!matched) {
    return iso;
  }
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  return day === 1 ? `${month}月` : String(day);
}
