/**
 * 标签外观的归一化：**唯一入口**。
 *
 * 规范位置是 `style.label`（引擎 2.4 起「外观只有一个容器」；子元素外观用 `style.<元素>` 嵌套）。
 * 本仓库历史上在给排水符号、状态机节点、甘特条、二次开发示例里都各自写过顶层 `labelStyle`，
 * 结果是「标签的颜色/字号算不算样式」有两种答案，序列化清单、形状重建判断也各写一遍。
 *
 * 这里把老写法**单向并入**规范位置（`style.label` 优先），调用方只在构造 props 时过一道，
 * 之后全仓库只读 `state.style.label`。
 */
export function normalizeLabelStyle<T extends Record<string, any>>(props: T): T {
  if (!props || typeof props !== 'object') return props;
  const legacy = (props as any).labelStyle;
  const style = (props as any).style || {};
  if (!legacy && style.label) return props;
  const merged: any = {
    ...props,
    style: { ...style, label: { ...(legacy || {}), ...(style.label || {}) } },
  };
  delete merged.labelStyle;
  return merged;
}
