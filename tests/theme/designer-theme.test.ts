/**
 * 设计器的画布外壳配色（`DESIGNER_CHROME` / `applyDesignerChrome`）。
 *
 * 为什么需要这条测试：chart 与 web-components 的"桥"都各有一组单测（5 / 7 条），
 * 设计器这条此前**一条都没有** —— 而它恰恰是"引擎外壳 token 被应用层真正用起来"的第一个落地。
 * 这里断言的是**真实生效的颜色**（读 `ice.getTheme()`），不是"调过 setChrome"这种弱断言。
 */
import { ICE, EventBus } from 'ice-render';
import EntityDesigner from '../../src/designer/EntityDesigner';
import FlowDesigner from '../../src/flow/FlowDesigner';
import { DESIGNER_CHROME, applyDesignerChrome } from '../../src/theme/designerTheme';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('设计器画布外壳配色', () => {
  it('外壳对齐到 antd 主色系（与 DOM 面板同一套语言）', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    const chrome = ice.getTheme().semantic.chrome;
    expect(chrome.selection.stroke).toBe('#1677ff');
    expect(chrome.handle.fill).toBe('#1677ff');
    expect(chrome.guide.color).toBe('#1677ff');
    expect(chrome.textSelection.color).toBe('rgba(22,119,255,0.28)');
  });

  it('插槽 / 连线端点用成功色系、命中高亮用警告色（"能连上去"的语义）', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    const chrome = ice.getTheme().semantic.chrome;
    expect(chrome.slot.fill).toBe('#52c41a');
    expect(chrome.linkHook.fill).toBe('#52c41a');
    expect(chrome.slot.hoverFill).toBe('#faad14');
    expect(chrome.handle.activeFill).toBe('#faad14');
  });

  it('只碰外壳：引擎的语义色与调色板不受影响', () => {
    const ice = makeIce();
    const before = ice.getTheme().semantic;
    applyDesignerChrome(ice);
    const after = ice.getTheme().semantic;
    expect(after.primary).toBe(before.primary);
    expect(after.palette).toEqual(before.palette);
    expect(after.motion).toEqual(before.motion);
  });

  it('EntityDesigner 构造时自动应用（示例页与 React 会话两条路都覆盖）', () => {
    const ice = makeIce();
    new EntityDesigner(ice);
    expect(ice.getTheme().semantic.chrome.selection.stroke).toBe(DESIGNER_CHROME.selection!.stroke);
    expect(ice.getTheme().semantic.chrome.handle.fill).toBe('#1677ff');
  });

  it('FlowDesigner 构造时同样应用（BPMN / UML / 状态机 / 甘特 / 电力 / 给排水都是它的子类）', () => {
    const ice = makeIce();
    new FlowDesigner(ice);
    expect(ice.getTheme().semantic.chrome.selection.stroke).toBe('#1677ff');
    expect(ice.getTheme().semantic.chrome.slot.hoverFill).toBe('#faad14');
  });

  it('宿主可以覆盖：设计器只管默认值，不是"锁死"', () => {
    const ice = makeIce();
    new EntityDesigner(ice);
    // 宿主换成自己的品牌色（在应用外壳之后设置，后设的赢）
    ice.setChrome({ selection: { stroke: '#7c3aed', fill: 'rgba(124,58,237,0.12)', lineWidth: 1, lineDash: [] } });
    expect(ice.getTheme().semantic.chrome.selection.stroke).toBe('#7c3aed');
    // 没覆盖的仍然是设计器默认
    expect(ice.getTheme().semantic.chrome.slot.fill).toBe('#52c41a');
  });
});
