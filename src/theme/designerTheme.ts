import type { ICEChromeTheme } from 'ice-render';

/**
 * 设计器的画布外壳配色。
 *
 * 背景：引擎 2.4 起把「引擎自己画的那层」（选中框 / 变换手柄 / 连线端点 / 连接插槽 /
 * 对齐引导线 / 连线标签 / 文本选区）收成了主题 token（`semantic.chrome`），
 * 并提供 `ice.setChrome(patch)`。本设计器的 DOM 面板用 antd，画布外壳以前用的是引擎内置的
 * 历史配色（暗红手柄 + 亮绿插槽）—— 两套视觉并排放在一起是割裂的，所以在这里把外壳对齐到
 * antd 的主色系，一处定义、所有编辑器共享。
 *
 * 注意：这里只管**外壳**。图形自己的语义色（电力一次系统的电压等级色、给排水介质色、
 * UML / 状态机 / 甘特各自的配色）属于**领域语义**，不在这层 —— 它们是数据的一部分，
 * 换主题也不该变（例子里的「介质切换改线色」就是靠它们）。
 */
export const DESIGNER_CHROME: Partial<ICEChromeTheme> = {
  // 选中框：antd 主色 + 极淡的填充（压住图形但不遮住内容）
  selection: { stroke: '#1677ff', fill: 'rgba(22,119,255,0.12)', lineWidth: 1, lineDash: [] },
  // 变换手柄：主色实心 + 白描边（在深色图形上也看得见）
  handle: { fill: '#1677ff', stroke: '#ffffff', activeFill: '#faad14', lineWidth: 1 },
  // 连线端点手柄 / 插槽：成功色系（"可以连上去"），命中高亮用警告色
  linkHook: { fill: '#52c41a', stroke: '#ffffff', lineWidth: 1 },
  slot: { fill: '#52c41a', stroke: '#ffffff', hoverFill: '#faad14', lineWidth: 1 },
  // 对齐引导线：主色（比以前的品红更贴近工具的整体语言）
  guide: { color: '#1677ff', lineWidth: 1 },
  // 文本编辑态的选区
  textSelection: { color: 'rgba(22,119,255,0.28)' },
};

/**
 * 把设计器的外壳配色应用到引擎实例（幂等，可重复调用）。
 *
 * 调用位置：`BaseDesigner` 的构造里（所有编辑器子类都会走），所以无论应用层是直接
 * `new ICE()` 还是走 React 的 `createDesignerSession()`，外壳都是同一套。
 */
export function applyDesignerChrome(ice: any): any {
  if (!ice || typeof ice.setChrome !== 'function') return ice;
  ice.setChrome(DESIGNER_CHROME);
  return ice;
}
