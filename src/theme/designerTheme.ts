import type { ICEChromeTheme, ICETheme } from 'ice-render';

/**
 * 设计器的画布外壳配色。
 *
 * 背景：引擎 2.4 起把「引擎自己画的那层」（选中框 / 变换手柄 / 连线端点 / 连接插槽 /
 * 对齐引导线 / 文本选区）收成了主题 token（`semantic.chrome`），并提供 `ice.setChrome(patch)`。
 *
 * **默认路径不再写死一套配色，而是从引擎主题派生**：主色 → 选中框 / 手柄 / 引导线，
 * 成功色 → 插槽 / 连线端点，警告色 → 命中高亮。家族品牌基线已定为 Bootstrap 5（引擎 2.5），
 * 画布外壳跟着引擎主题走才是「一处定义」；宿主 `setTheme({ primary })` 之后重跑一次
 * `applyDesignerChrome(ice)`，外壳就跟着换，不会出现「DOM 换了品牌色、画布选框还是旧的」。
 *
 * 想要**固定旧观感**（与 antd 风格的 DOM 面板一致）的宿主显式
 * `ice.setChrome(DESIGNER_CHROME_ANTD)` 即可，不需要改设计器。
 *
 * 注意：这里只管**外壳**。图形自己的语义色（电力一次系统的电压等级色、给排水介质色、
 * UML / 状态机 / 甘特各自的配色）属于**领域语义**，不在这层 —— 它们是数据的一部分，
 * 换主题也不该变（例子里的「介质切换改线色」就是靠它们）。
 */

/**
 * 固定旧观感：与 antd 风格的 DOM 面板一致的写死配色。
 *
 * 默认路径已改为「从引擎主题派生」，这一份保留给**显式要这个观感**的宿主
 * （例如 DOM 面板确实是 antd、希望画布与面板严格同色）。
 */
export const DESIGNER_CHROME_ANTD: Partial<ICEChromeTheme> = {
  selection: { stroke: '#1677ff', fill: 'rgba(22,119,255,0.12)', lineWidth: 1, lineDash: [] },
  handle: { fill: '#1677ff', stroke: '#ffffff', activeFill: '#faad14', lineWidth: 1 },
  linkHook: { fill: '#52c41a', stroke: '#ffffff', lineWidth: 1 },
  slot: { fill: '#52c41a', stroke: '#ffffff', hoverFill: '#faad14', lineWidth: 1 },
  guide: { color: '#1677ff', lineWidth: 1 },
  textSelection: { color: 'rgba(22,119,255,0.28)' },
};

/** 兼容旧名字：指的是「固定那一套」（默认路径见 `applyDesignerChrome`）。 */
export const DESIGNER_CHROME = DESIGNER_CHROME_ANTD;

/**
 * 从引擎主题**派生**外壳配色。
 *
 * 只取语义色（primary / success / warning），不新造颜色；主题缺字段时用引擎的家族基线值兜底
 * （正常路径下 `semantic.primary` 一定有值，兜底是为了「只传了半截自定义主题」的场景）。
 */
export function designerChromeFromTheme(theme?: ICETheme | null): Partial<ICEChromeTheme> {
  const semantic: any = (theme && (theme as any).semantic) || {};
  const primary = semantic.primary || '#0D6EFD';
  const success = semantic.success || '#198754';
  const warning = semantic.warning || '#FFC107';
  return {
    // 选中框：主色描边 + 极淡填充（压住图形但不遮内容）
    selection: { stroke: primary, fill: withAlpha(primary, 0.12), lineWidth: 1, lineDash: [] },
    // 手柄：主色实心 + 白描边（深色图形上也看得见），按下/激活用警告色
    handle: { fill: primary, stroke: '#ffffff', activeFill: warning, lineWidth: 1 },
    // 连线端点 / 插槽：成功色系（"可以连上去"），命中高亮用警告色
    linkHook: { fill: success, stroke: '#ffffff', lineWidth: 1 },
    slot: { fill: success, stroke: '#ffffff', hoverFill: warning, lineWidth: 1 },
    guide: { color: primary, lineWidth: 1 },
    textSelection: { color: withAlpha(primary, 0.28) },
  };
}

/**
 * 把设计器的外壳配色应用到引擎实例（幂等，可重复调用）。
 *
 * 调用位置：`BaseDesigner` 的构造里（所有编辑器子类都会走），所以无论应用层是直接
 * `new ICE()` 还是走 React 的 `createDesignerSession()`，外壳都是同一套。
 *
 * 宿主换过主题（`ice.setTheme(...)` / `ice.setChrome(...)`）之后再调一次即可重新对齐。
 */
export function applyDesignerChrome(ice: any): any {
  if (!ice || typeof ice.setChrome !== 'function') return ice;
  const theme = typeof ice.getTheme === 'function' ? ice.getTheme() : null;
  ice.setChrome(designerChromeFromTheme(theme));
  return ice;
}

/** 给颜色压上透明度（`#rgb` / `#rrggbb` / `rgb()`；认不出来的写法原样返回）。 */
function withAlpha(color: string, alpha: number): string {
  if (typeof color !== 'string') return color;
  const value = color.trim();
  if (value.charAt(0) === '#') {
    let hex = value.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return value;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (value.indexOf('rgb(') === 0) return value.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  return value;
}
