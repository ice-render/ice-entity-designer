/**
 * 设计器的画布外壳配色（`applyDesignerChrome` / `designerChromeFromTheme` / `DESIGNER_CHROME_ANTD`）。
 *
 * 为什么需要这条测试：chart 与 web-components 的"桥"都各有一组单测（5 / 7 条），
 * 设计器这条此前**一条都没有** —— 而它恰恰是"引擎外壳 token 被应用层真正用起来"的第一个落地。
 * 这里断言的是**真实生效的颜色**（读 `ice.getTheme()`），不是"调过 setChrome"这种弱断言。
 *
 * 默认路径现在是**从引擎主题派生**（主色 → 选中框 / 手柄 / 引导线，成功色 → 插槽 / 连线端点，
 * 警告色 → 命中高亮），所以这里不写死 hex，而是拿 `getTheme().semantic` 反查。
 */
import { ICE, EventBus } from 'ice-render';
import EntityDesigner from '../../src/designer/EntityDesigner';
import FlowDesigner from '../../src/flow/FlowDesigner';
import { DESIGNER_CHROME_ANTD, applyDesignerChrome } from '../../src/theme/designerTheme';
import { resolveThemeValue } from 'ice-render';

function makeIce(): any {
  const ice: any = new ICE();
  ice.evtBus = new EventBus();
  ice.childNodes = [];
  ice.toolNodes = [];
  return ice;
}

describe('设计器画布外壳配色', () => {
  it('外壳默认从引擎主题派生：主色 → 选中框 / 手柄 / 引导线', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    const semantic = ice.getTheme().semantic;
    const chrome = semantic.chrome;
    expect(chrome.selection.stroke).toBe(semantic.primary);
    expect(chrome.handle.fill).toBe(semantic.primary);
    expect(chrome.guide.color).toBe(semantic.primary);
    // 半透明填充由主色压出来（#0D6EFD → rgba(13,110,253,0.12)）
    expect(chrome.selection.fill).toBe('rgba(13,110,253,0.12)');
    expect(chrome.textSelection.color).toBe('rgba(13,110,253,0.28)');
  });

  it('插槽 / 连线端点用成功色、命中高亮用警告色（"能连上去"的语义）', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    const semantic = ice.getTheme().semantic;
    const chrome = semantic.chrome;
    expect(chrome.slot.fill).toBe(semantic.success);
    expect(chrome.linkHook.fill).toBe(semantic.success);
    expect(chrome.slot.hoverFill).toBe(semantic.warning);
    expect(chrome.handle.activeFill).toBe(semantic.warning);
  });

  it('宿主换品牌色 → 重新 apply 后外壳跟着变（不是写死在库里的一套）', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    ice.setTheme({ primary: '#ff6600', success: '#00aa55' });
    applyDesignerChrome(ice);
    const chrome = ice.getTheme().semantic.chrome;
    expect(chrome.selection.stroke).toBe('#ff6600');
    expect(chrome.selection.fill).toBe('rgba(255,102,0,0.12)');
    expect(chrome.slot.fill).toBe('#00aa55');
  });

  it('想要旧观感的宿主可以显式换成固定那一套', () => {
    const ice = makeIce();
    applyDesignerChrome(ice);
    ice.setChrome(DESIGNER_CHROME_ANTD);
    const chrome = ice.getTheme().semantic.chrome;
    expect(chrome.selection.stroke).toBe('#1677ff');
    expect(chrome.slot.fill).toBe('#52c41a');
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
    const semantic = ice.getTheme().semantic;
    expect(semantic.chrome.selection.stroke).toBe(semantic.primary);
    expect(semantic.chrome.handle.fill).toBe(semantic.primary);
  });

  it('FlowDesigner 构造时同样应用（BPMN / UML / 状态机 / 甘特 / 电力 / 给排水都是它的子类）', () => {
    const ice = makeIce();
    new FlowDesigner(ice);
    const semantic = ice.getTheme().semantic;
    expect(semantic.chrome.selection.stroke).toBe(semantic.primary);
    expect(semantic.chrome.slot.hoverFill).toBe(semantic.warning);
  });

  it('宿主可以覆盖：设计器只管默认值，不是"锁死"', () => {
    const ice = makeIce();
    new EntityDesigner(ice);
    // 宿主换成自己的品牌色（在应用外壳之后设置，后设的赢）
    ice.setChrome({ selection: { stroke: '#7c3aed', fill: 'rgba(124,58,237,0.12)', lineWidth: 1, lineDash: [] } });
    expect(ice.getTheme().semantic.chrome.selection.stroke).toBe('#7c3aed');
    // 没覆盖的仍然是设计器默认
    expect(ice.getTheme().semantic.chrome.slot.fill).toBe(ice.getTheme().semantic.success);
  });

  it('节点 / 连线样式可以引用主题 token —— 引擎在绘制那一刻解析（SKILL 里承诺的能力）', () => {
    const ice = makeIce();
    const designer: any = new FlowDesigner(ice);
    const node: any = designer.createNode('process', {
      left: 0,
      top: 0,
      title: 'A',
      fillColor: '$primary',
      strokeColor: '$border',
    });
    const edge: any = designer.createEdge({
      sourceId: node.state.id,
      targetId: designer.createNode('process', { left: 0, top: 200 }).state.id,
      style: { strokeStyle: '$danger' },
    });

    // 模型字段最终落到**真正绘制的那个引擎图元**的 style 上：
    // 节点是容器（自身透明），可见的方块/形状是派生出来的 shapeComponent；连线就是它自己。
    expect(node.shapeComponent.state.style.fillStyle).toBe('$primary');
    expect(node.shapeComponent.state.style.strokeStyle).toBe('$border');
    expect(edge.state.style.strokeStyle).toBe('$danger');

    // 宿主换主题 → 解析结果随之变化（不需要重建图元）
    ice.setTheme({ primary: '#ff0000', border: '#00ff00', danger: '#0000ff' });
    const theme = node.themeOf();
    expect(resolveThemeValue(node.shapeComponent.state.style.fillStyle, theme)).toBe('#ff0000');
    expect(resolveThemeValue(node.shapeComponent.state.style.strokeStyle, theme)).toBe('#00ff00');
    expect(resolveThemeValue(edge.state.style.strokeStyle, theme)).toBe('#0000ff');

    // 拼错的 token 名解析成 undefined（引擎跳过赋值；validateTheme / DSL 诊断负责提示）
    expect(resolveThemeValue('$primry', theme)).toBeUndefined();
  });
});
