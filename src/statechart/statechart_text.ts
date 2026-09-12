/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 状态机的**文本互操作**（PlantUML 状态图语法子集）。
 *
 * 与 UML 类图同一套思路（见 `uml/uml_text.ts`）：先做文本而不是 XMI ——
 * 状态图的现实生态是「人和 AI 都在写 PlantUML」，导出能直接进 Markdown / Wiki / PR，
 * 导入能把存量图搬进来。
 *
 * 支持的语法子集：
 *
 * ```
 * @startuml
 * title 订单状态机
 * state 待支付
 * state "订单处理" as S1 {
 *   state 库存校验
 *   state 安排发货
 * }
 * [*] --> 待支付
 * 待支付 --> 已支付 : 支付成功 [金额 > 0] / 生成订单
 * 库存校验 --> 安排发货 : 库存充足
 * 安排发货 --> [*]
 * @enduml
 * ```
 *
 * 记法约定（写死并测试）：
 * - 伪状态 → `[*]`：初始状态的出边写成 `[*] --> A`，终止状态的入边写成 `A --> [*]`；
 *   模型里的初始/终止节点本身不声明（它们没有名字）；
 * - 复合状态 → `state "订单处理" as S1 { ... }`，**子状态声明在块内**：块的嵌套就是容器归属，
 *   导入时据此把子状态装回复合状态（而不是平铺）；
 * - 转移标签沿用 `事件 [守卫] / 动作`，导入时拆回三段（`splitTransitionLabel`）。
 */
import type { StatechartNodeKind } from './StateNode';

export type StatechartTextImportResult = {
  states: number;
  transitions: number;
  /** 解析不了 / 不支持的输入行（不阻断整体导入） */
  warnings: string[];
};

/** 可以直接当 PlantUML 标识符用的名字（中文、字母、数字、下划线、连字符） */
const SAFE_NAME = /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5-]*$/;

function kindOf(node: any): StatechartNodeKind {
  return (node.state.kind || 'state') as StatechartNodeKind;
}

function isPseudo(kind: StatechartNodeKind): boolean {
  return kind === 'initial' || kind === 'final';
}

/** 最近的祖先状态（派生形状/文字不算），用于判断「谁是谁的子状态」 */
function nearestStateAncestor(node: any): any {
  let current = node.parentNode;
  while (current) {
    if (current.constructor && current.constructor.typeId === 'StateNode') {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * `事件 [守卫] / 动作` → 三段（`StateTransition.composeLabel` 的逆运算）。
 *
 * 规则与拼装严格对称：只按**第一个** ` / ` 切分（动作里再出现 ` / ` 也属于动作），
 * 守卫取事件末尾那对方括号；缺哪段就是空串，不会凭空造出括号或斜杠。
 */
export function splitTransitionLabel(label: string): { event: string; guard: string; action: string } {
  const text = String(label || '').trim();
  if (!text) {
    return { event: '', guard: '', action: '' };
  }
  const slashIndex = text.indexOf(' / ');
  const head = slashIndex === -1 ? text : text.slice(0, slashIndex);
  const action = slashIndex === -1 ? '' : text.slice(slashIndex + 3).trim();
  const guardMatch = /\[([^\]]*)\]\s*$/.exec(head);
  if (!guardMatch) {
    return { event: head.trim(), guard: '', action };
  }
  return {
    event: head.slice(0, guardMatch.index).trim(),
    guard: guardMatch[1].trim(),
    action,
  };
}

/**
 * 导出为 PlantUML 状态图文本。
 *
 * 只输出**记法本身**（状态、嵌套、转移），不输出坐标 —— PlantUML 自己会排版；
 * 要保坐标的场景用引擎快照（`designer.serialize()`）或 SVG 导出。
 */
export function toPlantUmlState(designer: any, options: { title?: string } = {}): string {
  const states: any[] = designer.nodes || [];
  const lines: string[] = ['@startuml'];
  if (options.title) {
    lines.push(`title ${options.title}`);
  }

  const byId = new Map<string, any>();
  states.forEach((state) => byId.set(state.state.id, state));

  // 名字含空格、或与别的状态重名时给稳定别名：PlantUML 里裸标识符会撞名/被截断。
  const titleCount = new Map<string, number>();
  states.forEach((state) => {
    const title = String(state.state.title || '');
    if (title) {
      titleCount.set(title, (titleCount.get(title) || 0) + 1);
    }
  });
  const aliasOf = new Map<string, string>();
  let aliasIndex = 0;
  const declaration = (node: any): string => {
    const title = String(node.state.title || '');
    const needsAlias = !SAFE_NAME.test(title) || (titleCount.get(title) || 0) > 1;
    if (!needsAlias) {
      return `state ${title}`;
    }
    aliasIndex += 1;
    const alias = `S${aliasIndex}`;
    aliasOf.set(node.state.id, alias);
    return `state "${title}" as ${alias}`;
  };
  const reference = (node: any): string => aliasOf.get(node.state.id) || String(node.state.title || '');

  // 1) 状态声明：复合状态成块，直接子状态声明在块里；其余平铺
  const childIds = new Set<string>();
  states
    .filter((state) => kindOf(state) === 'composite')
    .forEach((composite) => {
      const children = states.filter((state) => !isPseudo(kindOf(state)) && nearestStateAncestor(state) === composite);
      children.forEach((child) => childIds.add(child.state.id));
      lines.push(`${declaration(composite)} {`);
      children.forEach((child) => lines.push(`  ${declaration(child)}`));
      lines.push('}');
    });
  states.forEach((state) => {
    const kind = kindOf(state);
    if (isPseudo(kind) || kind === 'composite' || childIds.has(state.state.id)) {
      return;
    }
    lines.push(declaration(state));
  });

  // 2) 转移：伪状态映射成 [*]
  (designer.edges || []).forEach((edge: any) => {
    const links = edge.state.links || {};
    const from = byId.get(links.start && links.start.id);
    const to = byId.get(links.end && links.end.id);
    if (!from || !to) {
      return;
    }
    const left = kindOf(from) === 'initial' ? '[*]' : reference(from);
    const right = kindOf(to) === 'final' ? '[*]' : reference(to);
    const label = edge.state.label ? ` : ${edge.state.label}` : '';
    lines.push(`${left} --> ${right}${label}`);
  });

  lines.push('@enduml');
  return lines.join('\n');
}

type ParsedState = {
  token: string;
  title: string;
  kind: 'state' | 'composite';
  parent: string | null;
};

/**
 * 从 PlantUML 状态图文本导入（容错：不认识的行进 `warnings`，不阻断整体导入）。
 *
 * 会先清空目标 designer 的当前模型（与 BPMN XML / UML 文本导入同一语义）。
 * 文本里没有坐标：导入后按「根级分层、子状态装在复合状态盒子里」给一套可读的初始布局，
 * 用户随后可以自己排版（或交给自动布局）。
 */
export function fromPlantUmlState(text: string, designer: any): StatechartTextImportResult {
  const warnings: string[] = [];
  const parsed: ParsedState[] = [];
  const transitions: Array<{ from: string; to: string; label: string; line: string }> = [];
  const stack: string[] = [];

  const resolveToken = (token: string): string => {
    // 块内可以直接用名字引用同级/父级状态；找不到就按原样当作 token
    return token;
  };

  String(text || '')
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith('//') || trimmed.startsWith('%%')) {
        return; // 空行与注释
      }
      if (
        /^@startuml/i.test(trimmed) ||
        /^@enduml/i.test(trimmed) ||
        /^title\b/i.test(trimmed) ||
        /^skinparam\b/i.test(trimmed) ||
        /^hide\b/i.test(trimmed) ||
        /^scale\b/i.test(trimmed) ||
        /^autoactivate\b/i.test(trimmed) ||
        /^note\b/i.test(trimmed) ||
        /^state\s+<<.*>>$/i.test(trimmed)
      ) {
        return;
      }
      if (trimmed === '}') {
        stack.pop();
        return;
      }

      // 状态（复合状态带 `{`）：state "订单处理" as S1 { / state 待支付 / state "含 空格" as S2
      const stateMatch = /^state\s+(?:"([^"]+)"|([^\s{]+))(?:\s+as\s+([^\s{]+))?\s*(\{)?$/i.exec(trimmed);
      if (stateMatch) {
        const title = stateMatch[1] !== undefined ? stateMatch[1] : stateMatch[2];
        const token = stateMatch[3] || title;
        const parent = stack.length ? stack[stack.length - 1] : null;
        parsed.push({ token, title, kind: stateMatch[4] ? 'composite' : 'state', parent });
        if (stateMatch[4]) {
          stack.push(token);
        }
        return;
      }

      // 转移：[*] --> A / A --> [*] / A --> B : 事件 [守卫] / 动作
      const transitionMatch = /^(\[\*\]|[^\s]+)\s+(?:-+[a-z]*->|->)\s+(\[\*\]|[^\s]+)\s*(?::\s*(.*))?$/i.exec(trimmed);
      if (transitionMatch) {
        transitions.push({
          from: resolveToken(transitionMatch[1]),
          to: resolveToken(transitionMatch[2]),
          label: (transitionMatch[3] || '').trim(),
          line: trimmed,
        });
        return;
      }

      warnings.push(`不认识的语法，已跳过：${trimmed}`);
    });

  designer.clear();
  const created = new Map<string, any>();

  // 复合状态先建：子状态要落在它的盒子里（引擎按几何归属装子状态）
  const composites = parsed.filter((item) => item.kind === 'composite');
  const roots = parsed.filter((item) => item.kind !== 'composite' && !item.parent);
  composites.forEach((item, index) => {
    const left = 120 + (index % 2) * 620;
    const top = 340 + Math.floor(index / 2) * 320;
    const node = designer.createState({ kind: 'composite', title: item.title, left, top, width: 560, height: 280 });
    created.set(item.token, node);
  });
  roots.forEach((item, index) => {
    const node = designer.createState({
      title: item.title,
      left: 120 + (index % 4) * 280,
      top: 100 + Math.floor(index / 4) * 140,
      width: 180,
      height: 64,
    });
    created.set(item.token, node);
  });
  parsed
    .filter((item) => item.kind !== 'composite' && item.parent)
    .forEach((item) => {
      const parent = created.get(item.parent as string);
      if (!parent) {
        warnings.push(`找不到父状态「${item.parent}」，已按根级状态导入：${item.title}`);
      }
      const siblings = parsed.filter((other) => other.parent === item.parent && other.kind !== 'composite');
      const index = siblings.findIndex((other) => other.token === item.token);
      const baseLeft = parent ? parent.state.left + 24 : 120;
      const baseTop = parent ? parent.state.top + 70 : 100;
      const node = designer.createState({
        title: item.title,
        left: baseLeft + (index % 2) * 260,
        top: baseTop + Math.floor(index / 2) * 90,
        width: 220,
        height: 60,
      });
      created.set(item.token, node);
    });

  // 伪状态按需创建：一个初始、一个终止就够（多写几条 [*] 会共用同一个伪状态）
  let initial: any = null;
  let final: any = null;
  // PlantUML 里状态可以「不声明直接用」（`A --> B` 隐含两个状态）——这里按需补建
  const ensureState = (token: string): any => {
    if (created.has(token)) {
      return created.get(token);
    }
    const index = created.size;
    const node = designer.createState({
      title: token,
      left: 120 + (index % 4) * 280,
      top: 100 + Math.floor(index / 4) * 140,
      width: 180,
      height: 64,
    });
    created.set(token, node);
    return node;
  };
  const ensureInitial = (): any => {
    if (!initial) {
      initial = designer.createState({ kind: 'initial', left: 60, top: 120 });
    }
    return initial;
  };
  const ensureFinal = (): any => {
    if (!final) {
      final = designer.createState({ kind: 'final', left: 1160, top: 120 });
    }
    return final;
  };

  let transitionCount = 0;
  transitions.forEach((item) => {
    const from = item.from === '[*]' ? ensureInitial() : ensureState(item.from);
    const to = item.to === '[*]' ? ensureFinal() : ensureState(item.to);
    const parts = splitTransitionLabel(item.label);
    designer.createTransition({
      sourceId: from.state.id,
      targetId: to.state.id,
      event: parts.event,
      guard: parts.guard,
      action: parts.action,
    });
    transitionCount += 1;
  });

  designer.select(null);
  return { states: created.size + (initial ? 1 : 0) + (final ? 1 : 0), transitions: transitionCount, warnings };
}
