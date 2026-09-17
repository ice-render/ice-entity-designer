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
 * 引擎 2.14 起写的是**命名补丁**（`ice.setThemePatch('ice-designer', …)`），并且本函数会订阅
 * `ice.onThemeChange`：宿主换主题（基座变了）之后**自动重算**一次外壳，不需要调用方再调一遍。
 * 老引擎（<2.14）退回 `ice.setChrome()`，行为与之前一致。
 */
export function applyDesignerChrome(ice: any): any {
  if (!ice) return ice;
  if (typeof ice.setThemePatch !== 'function' && typeof ice.setChrome !== 'function') return ice;
  const theme = typeof ice.getTheme === 'function' ? ice.getTheme() : null;
  const chrome = designerChromeFromTheme(theme);
  if (typeof ice.setThemePatch === 'function') {
    /**
     * 引擎 ≥ 2.14：走**命名补丁层**，不要走 `setChrome`。
     *
     * 设计器的外壳是**从基座派生**的（primary → 选中框 / 手柄 / 引导线…）。以前用 `setChrome` 写基座，
     * 于是它和 UI 主题互相覆盖、胜负取决于调用顺序；现在写成补丁，两层互不干扰。
     * 派生值会在基座变化时由下面的订阅**重新算一遍**（补丁本身不会自己变）。
     */
    ice.setThemePatch('ice-designer', { semantic: { chrome } });
    subscribeDesignerChrome(ice);
  } else {
    // 老引擎兜底：没有补丁层，只能写基座（语义与 2.14 之前一致）
    ice.setChrome(chrome);
  }
  return ice;
}

/**
 * 订阅实例主题变更：**基座**换了就按新主题重算一遍设计器外壳补丁。
 *
 * 为什么必须订阅：外壳是**派生值**（不是用户直接指定的），基座一变它就过期了 ——
 * 不重算的表现是"换了 UI 主题，设计器的选中框 / 手柄还是旧主色"。
 * 只认 `kind === 'theme'`：`'patch'` 是自己写的，`'chrome'` 是应用直接改外壳（尊重调用方）。
 * 每个实例只订阅一次（挂在实例上做标记），重复 `applyDesignerChrome` 不会叠加监听。
 */
function subscribeDesignerChrome(ice: any): void {
  if (ice.__designerChromeSubscribed || typeof ice.onThemeChange !== 'function') return;
  ice.__designerChromeSubscribed = true;
  ice.onThemeChange((info: any) => {
    if (info && info.kind !== 'theme') return;
    const theme = typeof ice.getTheme === 'function' ? ice.getTheme() : null;
    ice.setThemePatch('ice-designer', { semantic: { chrome: designerChromeFromTheme(theme) } });
  });
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
