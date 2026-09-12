/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * UML 类图的**文本互操作**（PlantUML / Mermaid 类图语法子集）。
 *
 * 为什么先做文本而不是 XMI：类图的现实生态是「人和 AI 都在写 PlantUML/Mermaid」——
 * 导出成文本可以直接进 Markdown、Wiki、代码评审；导入文本则能把存量图搬进来。
 * XMI 是另一套重量级模型（UML 元模型 + 引用 id + 命名空间），留到需要与建模工具互换时再做。
 *
 * 支持的语法子集（两个方言的**共同部分**，导出统一用 PlantUML 风格）：
 *
 * ```
 * @startuml
 * class User {
 *   - email: string
 *   + placeOrder(): Order
 * }
 * interface Payable
 * enum OrderStatus {
 *   PENDING
 *   PAID
 * }
 * Entity <|-- User          // 继承（实线空心三角）
 * Payable <|.. Order        // 实现（虚线空心三角）
 * User --> Order : 1 : 0..* // 关联
 * Order o-- OrderItem       // 聚合（空心菱形在左侧）
 * Order *-- OrderItem       // 组合（实心菱形在左侧）
 * Order ..> OrderStatus     // 依赖
 * @enduml
 * ```
 *
 * **方向约定**（容易搞反，这里写死并测试）：
 * - `A <|-- B` = B 继承 A：模型里 `source = B`（子类）、`target = A`（父类）；
 * - `A o-- B` / `A *-- B` = 菱形画在 **A** 一侧：模型里 `source = A`（整体）、`target = B`（部分）；
 * - `A --> B` / `A ..> B` = 箭头指向 B：模型里 `source = A`、`target = B`。
 */
import type { UmlClassKind } from './UmlClass';
import type UmlRelation from './UmlRelation';
import type { UmlRelationKind } from './UmlRelation';

export type UmlTextImportResult = {
  classes: number;
  relations: number;
  /** 解析不了 / 不支持的输入行（不阻断整体导入） */
  warnings: string[];
};

/** 关系记法 → PlantUML 连接符（导出用） */
const ARROW_BY_KIND: Record<UmlRelationKind, string> = {
  inheritance: '<|--',
  realization: '<|..',
  association: '-->',
  aggregation: 'o--',
  composition: '*--',
  dependency: '..>',
};

/** PlantUML 连接符 → 关系记法（导入用） */
const KIND_BY_ARROW: Array<[RegExp, UmlRelationKind]> = [
  [/<\|\.\./, 'realization'],
  [/<\|--/, 'inheritance'],
  [/\*--/, 'composition'],
  [/o--/, 'aggregation'],
  [/\.\.>/, 'dependency'],
  [/-->/, 'association'],
];

/** 需要转义的标识符（PlantUML 里带空格/特殊字符的名字用引号包起来） */
function quoteIfNeeded(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name}"`;
}

function unquote(name: string): string {
  const trimmed = name.trim();
  return /^".*"$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
}

/**
 * 导出为 PlantUML 文本（`@startuml` 起）。
 *
 * 只输出**记法本身**（类、成员、关系），不输出布局坐标 —— PlantUML 自己会排；
 * 需要保坐标的场景用引擎快照（`serialize()`）或 SVG 导出。
 */
export function toPlantUml(designer: any, options: { title?: string } = {}): string {
  const lines: string[] = ['@startuml'];
  if (options.title) {
    lines.push(`title ${options.title}`);
  }
  lines.push('skinparam classAttributeIconSize 0'); // 可见性用 +/- 文本，而不是图标

  const classes: any[] = designer.nodes;
  classes.forEach((cls) => {
    const kind: UmlClassKind = cls.state.kind || 'class';
    const keyword =
      kind === 'interface' ? 'interface' : kind === 'enum' ? 'enum' : cls.state.abstract ? 'abstract class' : 'class';
    const name = quoteIfNeeded(String(cls.state.className || 'Class'));
    const members: string[] = [...(cls.state.attributes || []), ...(cls.state.methods || [])];
    if (!members.length) {
      lines.push(`${keyword} ${name}`);
      return;
    }
    lines.push(`${keyword} ${name} {`);
    (cls.state.attributes || []).forEach((text: string) => lines.push(`  ${text}`));
    if ((cls.state.methods || []).length) {
      lines.push('  --');
      (cls.state.methods || []).forEach((text: string) => lines.push(`  ${text}`));
    }
    lines.push('}');
  });

  const classesById = new Map<string, any>();
  classes.forEach((cls) => classesById.set(cls.state.id, cls));
  (designer.edges as UmlRelation[]).forEach((edge: any) => {
    const links = edge.state.links || {};
    const sourceId = links.start && links.start.id;
    const targetId = links.end && links.end.id;
    const source = classesById.get(sourceId);
    const target = classesById.get(targetId);
    if (!source || !target) {
      return;
    }
    const kind: UmlRelationKind = edge.state.relationKind || 'association';
    const arrow = ARROW_BY_KIND[kind] || '-->';
    const label = edge.state.label ? ` : ${edge.state.label}` : '';
    // 方向约定：`A <|-- B` = B 继承 A（箭头/三角在左，左=target）；`A --> B`、`A o-- B`
    // 都是「左=source、右=target」（菱形画在左侧即整体一侧）。写反了导入导出就各自打转。
    const arrowPointsLeft = arrow.indexOf('<') === 0;
    const left = quoteIfNeeded(String((arrowPointsLeft ? target : source).state.className));
    const right = quoteIfNeeded(String((arrowPointsLeft ? source : target).state.className));
    lines.push(`${left} ${arrow} ${right}${label}`);
  });

  lines.push('@enduml');
  return lines.join('\n');
}

/**
 * 从 PlantUML / Mermaid 类图文本导入（容错：不认识的行进 `warnings`，不阻断整体导入）。
 *
 * 会先清空目标 designer 的当前模型（与 BPMN XML 导入同一语义）。
 */
export function fromPlantUml(text: string, designer: any): UmlTextImportResult {
  const warnings: string[] = [];
  const classDefs = new Map<
    string,
    { kind: UmlClassKind; attributes: string[]; methods: string[]; abstract: boolean }
  >();
  const relationLines: string[] = [];

  const rawLines = String(text || '').split(/\r?\n/);
  let current: string | null = null;
  let inAttributes = false;

  rawLines.forEach((rawLine) => {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith('//') || trimmed.startsWith('%%')) {
      return; // 注释与空行
    }
    if (
      /^@startuml/i.test(trimmed) ||
      /^@enduml/i.test(trimmed) ||
      /^classDiagram/i.test(trimmed) ||
      /^skinparam/i.test(trimmed) ||
      /^title/i.test(trimmed)
    ) {
      return;
    }
    if (current) {
      if (trimmed === '}') {
        current = null;
        inAttributes = false;
        return;
      }
      if (trimmed === '--' || trimmed === '..' || trimmed === '__') {
        inAttributes = false; // 分隔线之后是方法区
        return;
      }
      const def = classDefs.get(current)!;
      // 成员整行原样保留（`- id: string` / `+ pay(): void`），可见性前缀也是记法的一部分
      (inAttributes ? def.attributes : def.methods).push(trimmed);
      return;
    }

    // 类定义：class / abstract class / interface / enum + 名字（可选 `{ 同一行`）
    // 注意 `(?:eration)?` 必须是非捕获组：捕获组会把 classMatch 的分组号顶位（实测踩过）
    const classMatch = /^(abstract\s+class|abstract|class|interface|enum(?:eration)?)\s+(.+?)\s*(\{)?$/i.exec(trimmed);
    if (classMatch) {
      const keyword = classMatch[1].toLowerCase();
      const name = unquote(classMatch[2].replace(/\{.*$/, ''));
      const kind: UmlClassKind = keyword.startsWith('interface')
        ? 'interface'
        : keyword.startsWith('enum')
        ? 'enum'
        : 'class';
      classDefs.set(name, { kind, attributes: [], methods: [], abstract: keyword.startsWith('abstract') });
      if (classMatch[3]) {
        current = name;
        inAttributes = true;
      }
      return;
    }

    // 关系：A <|-- B : label
    const relationMatch =
      /^(.+?)\s+(<\|--|<\|\.\.|<--|<\.\.|--\*|\*--|--o|o--|-->|\.\.>|--|\.\.)\s+(.+?)(?:\s*:\s*(.*))?$/.exec(trimmed);
    if (relationMatch) {
      relationLines.push(trimmed);
      return;
    }

    warnings.push(`不认识的语法，已跳过：${trimmed}`);
  });

  // 重建模型（先清空，与 XML 导入语义一致）
  designer.clear();
  const createdByClass = new Map<string, any>();
  const gapX = 260;
  const gapY = 60;
  let index = 0;
  classDefs.forEach((def, name) => {
    const cls = designer.createClass({
      kind: def.kind,
      className: name,
      abstract: def.abstract,
      attributes: def.attributes,
      methods: def.methods,
      // 文本格式没有坐标：给一个可读的初始网格，导入后用户可再排版（或交给自动布局）
      left: 80 + (index % 3) * gapX * 1.4,
      top: 80 + Math.floor(index / 3) * (gapY + 220),
    });
    createdByClass.set(name, cls);
    index++;
  });

  let relations = 0;
  relationLines.forEach((line) => {
    const match =
      /^(.+?)\s+(<\|--|<\|\.\.|<--|<\.\.|--\*|\*--|--o|o--|-->|\.\.>|--|\.\.)\s+(.+?)(?:\s*:\s*(.*))?$/.exec(line);
    if (!match) {
      warnings.push(`关系解析失败，已跳过：${line}`);
      return;
    }
    const leftName = unquote(match[1]);
    const arrow = match[2];
    const rightName = unquote(match[3]);
    const label = match[4] || '';

    // A <|-- B：B 继承 A → source = 右侧（子类），target = 左侧（父类）
    const arrowPointsLeft = arrow.indexOf('<') === 0;
    const kind = (KIND_BY_ARROW.find(([re]) => re.test(arrow)) || [/x/, 'association'])[1] as UmlRelationKind;
    const sourceName = arrowPointsLeft ? rightName : leftName;
    const targetName = arrowPointsLeft ? leftName : rightName;

    const source = createdByClass.get(sourceName);
    const target = createdByClass.get(targetName);
    if (!source || !target) {
      warnings.push(`关系两端未定义，已跳过：${line}`);
      return;
    }
    designer.createRelation({
      sourceId: source.state.id,
      targetId: target.state.id,
      relationKind: kind,
      label,
    });
    relations++;
  });

  return { classes: createdByClass.size, relations, warnings };
}

/** 关系记法 ↔ PlantUML 连接符（供文档/属性面板展示） */
export function arrowOf(kind: UmlRelationKind): string {
  return ARROW_BY_KIND[kind] || '-->';
}

/** 判断文本看起来是哪种方言（两者都被支持，这里只影响提示文案） */
export function detectUmlDialect(text: string): 'plantuml' | 'mermaid' | 'unknown' {
  if (/@startuml/i.test(text)) {
    return 'plantuml';
  }
  if (/classDiagram/i.test(text)) {
    return 'mermaid';
  }
  return 'unknown';
}
