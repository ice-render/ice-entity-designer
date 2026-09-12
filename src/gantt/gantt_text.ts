/**
 * Copyright (c) 2022 大漠穷秋.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * 甘特图的**文本互操作**（Mermaid gantt 语法子集）。
 *
 * Mermaid 的 gantt 是事实标准：导出的文本能直接进 Markdown / 文档站 / PR 描述，
 * 导入能把别人写好的排期搬进来。语法参考 `docs/syntax/gantt.md`：
 *
 * ```
 * gantt
 *   title 移动端 2.0 发布排期
 *   dateFormat YYYY-MM-DD
 *   section 产品
 *   需求评审 :done, t1, 2026-03-02, 4d
 *   交互设计 :active, t2, after t1, 6d
 * ```
 *
 * 记法约定（写死并测试）：
 * - `section` ↔ **负责人（`resource`）**：Mermaid 的 section 就是「一组任务」，
 *   与「同一个负责人 / 团队」天然对应；没有负责人的任务写在所有 section 之前（Mermaid 允许顶层任务）；
 * - 依赖：**恰好一个前置、且起始日期就等于前置结束日**时用 `after <id>` ——
 *   这样 Mermaid 会自己画依赖箭头，而且算出来的日期与模型完全一致；
 *   多前置（Mermaid 没有语法）或「带 buffer 的排期」（起始日期晚于前置结束日，Mermaid 也没法表达）时，
 *   退化成「显式起始日期」，依赖关系写进 `%% task <id>: deps=...` 注释
 *   （Mermaid 忽略 `%%` 注释，所以文本照样渲染正确，往返也不丢信息）；
 * - 进度：`1 → done`、`0 ~ 1 → active`；Mermaid 只有标签没有数值，
 *   精确值写进 `%% task <id>: progress=...` 注释（同理，渲染不受影响）。
 */
import { addDays, diffDays } from './gantt_date';

export type GanttTextImportResult = {
  tasks: number;
  dependencies: number;
  /** 解析不了 / 不支持的输入行（不阻断整体导入） */
  warnings: string[];
};

/** Mermaid 的指令行（不含任务）：导入时直接跳过 */
const DIRECTIVE =
  /^(gantt|title|dateFormat|axisFormat|excludes|includes|todayMarker|tickInterval|accTitle|accDescr|displayMode|weekday)\b/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i;
const TAG = /^(done|active|crit|milestone|vert)$/i;

type ParsedTask = {
  /** Mermaid 里的任务 id（导出时是 t1、t2…；手写文件可以是任意标识符） */
  id: string | null;
  title: string;
  /** 显式起始日期（`YYYY-MM-DD`） */
  start: string | null;
  endDate: string | null;
  /** `after a b`：前置任务 id（多前置就是多个） */
  after: string[];
  days: number | null;
  progress: number;
  resource: string;
  line: string;
};

/** 时长 → 天数（Mermaid 允许 ms/s/m/h/d/w；不足一天的按一天算） */
function durationToDays(value: string): number {
  const match = DURATION.exec(value);
  if (!match) {
    return 1;
  }
  const amount = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 'w':
      return Math.max(1, Math.round(amount * 7));
    case 'd':
      return Math.max(1, Math.round(amount));
    case 'h':
      return Math.max(1, Math.round(amount / 24));
    case 'm':
    case 's':
    case 'ms':
    default:
      return 1;
  }
}

/**
 * 导出为 Mermaid gantt 文本。
 *
 * 只输出**排期语义**（负责人分组、日期、天数、进度、依赖），不输出像素/画布坐标 ——
 * 要保坐标的场景用引擎快照（`designer.serialize()`）或 SVG 导出。
 */
export function toMermaidGantt(designer: any, options: { title?: string } = {}): string {
  const tasks: any[] = designer.nodes || [];
  const mermaidId = new Map<string, string>();
  tasks.forEach((task, index) => mermaidId.set(task.state.id, `t${index + 1}`));

  const predecessors = new Map<string, string[]>();
  (designer.edges || []).forEach((edge: any) => {
    const links = edge.state.links || {};
    const from = links.start && links.start.id;
    const to = links.end && links.end.id;
    if (!from || !to || !mermaidId.has(to)) {
      return;
    }
    predecessors.set(to, [...(predecessors.get(to) || []), from]);
  });

  const lines: string[] = ['gantt'];
  if (options.title) {
    lines.push(`  title ${options.title}`);
  }
  lines.push('  dateFormat YYYY-MM-DD');
  lines.push('  axisFormat %m-%d');

  const emit = (task: any): void => {
    const id = mermaidId.get(task.state.id);
    const progress = Number(task.state.progress) || 0;
    const before = predecessors.get(task.state.id) || [];
    const tags: string[] = [];
    if (progress >= 1) {
      tags.push('done');
    } else if (progress > 0) {
      tags.push('active');
    }
    // `after` 只在「算出来的日期与模型一致」时才用：Mermaid 的 after 只表达「紧接前置结束」，
    // 带 buffer 的排期（起始日晚于前置结束日）用它会把日期提前，所以退化成显式日期 + 注释补依赖。
    const singlePredecessor = before.length === 1 ? mermaidId.get(before[0]) : null;
    const predecessorTask =
      before.length === 1 ? (designer.nodes || []).find((item: any) => item.state.id === before[0]) : null;
    const feasibleStart =
      predecessorTask && singlePredecessor
        ? addDays(predecessorTask.state.start, Math.max(1, Math.round(Number(predecessorTask.state.days) || 1)))
        : null;
    const useAfter = !!singlePredecessor && feasibleStart === String(task.state.start || '');
    const startClause = useAfter ? `after ${singlePredecessor}` : String(task.state.start || '');
    const days = Math.max(1, Math.round(Number(task.state.days) || 1));
    lines.push(`  ${task.state.title} :${tags.length ? `${tags.join(', ')}, ` : ''}${id}, ${startClause}, ${days}d`);

    // 注释通道：Mermaid 表达不了的精确进度 / 多前置依赖
    const extras: string[] = [];
    if (progress > 0 && progress < 1) {
      extras.push(`progress=${progress}`);
    }
    if (before.length && !useAfter) {
      extras.push(`deps=${before.map((id) => mermaidId.get(id)).join(',')}`);
    }
    if (extras.length) {
      lines.push(`  %% task ${id}: ${extras.join(' ')}`);
    }
  };

  // 顶层任务（没有负责人）先写，再按负责人分 section（顺序稳定：按负责人首次出现）
  const resources: string[] = [];
  tasks.forEach((task) => {
    const resource = String(task.state.resource || '');
    if (resource && resources.indexOf(resource) === -1) {
      resources.push(resource);
    }
  });
  tasks.filter((task) => !String(task.state.resource || '')).forEach(emit);
  resources.forEach((resource) => {
    lines.push('');
    lines.push(`  section ${resource}`);
    tasks.filter((task) => String(task.state.resource || '') === resource).forEach(emit);
  });

  return lines.join('\n');
}

/**
 * 从 Mermaid gantt 文本导入（容错：不认识的行进 `warnings`，不阻断整体导入）。
 *
 * 会先清空目标 designer 的当前模型（与 BPMN XML / UML 文本导入同一语义）。
 * `after X` 按引擎的依赖语义（前置结束 → 本任务开始）反推出起始日期，并建立依赖线。
 */
export function fromMermaidGantt(
  text: string,
  designer: any,
  options: { defaultStart?: string } = {}
): GanttTextImportResult {
  const warnings: string[] = [];
  const parsed: ParsedTask[] = [];
  const metaById = new Map<string, { progress?: number; deps?: string[] }>();
  const idByToken = new Map<string, ParsedTask>();
  let resource = '';
  let fallbackStart = options.defaultStart || '';

  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.startsWith('%%')) {
      // 导出时写的注释通道：`%% task t3: progress=0.35 deps=t1,t2`
      const meta = /^%%\s*task\s+(\S+)\s*:\s*(.*)$/i.exec(trimmed);
      if (meta) {
        const entry = metaById.get(meta[1]) || {};
        meta[2].split(/\s+/).forEach((pair) => {
          const [key, value] = pair.split('=');
          if (key === 'progress') {
            entry.progress = Number(value);
          } else if (key === 'deps' && value) {
            entry.deps = value.split(',').filter((item) => !!item);
          }
        });
        metaById.set(meta[1], entry);
      }
      return; // Mermaid 的注释
    }
    if (DIRECTIVE.test(trimmed)) {
      return;
    }
    const sectionMatch = /^section\s+(.+)$/i.exec(trimmed);
    if (sectionMatch) {
      resource = sectionMatch[1].trim();
      return;
    }

    const taskMatch = /^(.+?)\s*:\s*(.*)$/.exec(trimmed);
    if (!taskMatch) {
      warnings.push(`不认识的语法，已跳过：${trimmed}`);
      return;
    }
    const title = taskMatch[1].trim();
    const task: ParsedTask = {
      id: null,
      title,
      start: null,
      endDate: null,
      after: [],
      days: null,
      progress: 0,
      resource,
      line: trimmed,
    };
    taskMatch[2].split(',').forEach((rawClause) => {
      const clause = rawClause.trim();
      if (!clause) {
        return;
      }
      if (TAG.test(clause)) {
        if (/^done$/i.test(clause)) {
          task.progress = 1;
        } else if (/^active$/i.test(clause)) {
          task.progress = 0.5; // Mermaid 只有「进行中」，精确值靠 %% task 注释
        }
        return;
      }
      const afterMatch = /^after\s+(.+)$/i.exec(clause);
      if (afterMatch) {
        task.after = afterMatch[1]
          .trim()
          .split(/\s+/)
          .filter((item) => !!item);
        return;
      }
      if (/^until\s+/i.test(clause)) {
        warnings.push(`暂不支持 until 依赖，已跳过该子句：${trimmed}`);
        return;
      }
      if (DATE.test(clause)) {
        if (!task.start) {
          task.start = clause;
        } else if (!task.endDate) {
          task.endDate = clause;
        }
        return;
      }
      if (DURATION.test(clause)) {
        task.days = durationToDays(clause);
        return;
      }
      if (!task.id) {
        task.id = clause;
        return;
      }
      warnings.push(`无法识别的子句「${clause}」，已跳过：${trimmed}`);
    });
    parsed.push(task);
    if (task.id) {
      idByToken.set(task.id, task);
    }
    if (!fallbackStart && task.start) {
      fallbackStart = task.start;
    }
  });

  designer.clear();
  const start0 = fallbackStart || '2026-01-01';
  const created = new Map<string, any>();
  const nodes: any[] = [];
  parsed.forEach((task) => {
    const days = task.days || (task.start && task.endDate ? Math.max(1, diffDays(task.start, task.endDate)) : 3);
    const node = designer.createTask({
      title: task.title,
      start: task.start || start0,
      days,
      progress: task.progress,
      resource: task.resource,
    });
    nodes.push(node);
    if (task.id) {
      created.set(task.id, { node, parsed: task });
    }
  });

  // `after X`：前置结束 → 本任务开始。链式依赖要多轮才收敛（A→B→C），最多 8 轮。
  for (let round = 0; round < 8; round += 1) {
    let changed = false;
    parsed.forEach((task, index) => {
      if (!task.after.length) {
        return;
      }
      let earliest = '';
      task.after.forEach((token) => {
        const entry = created.get(token);
        if (!entry) {
          return;
        }
        const end = addDays(entry.node.state.start, Math.max(1, Number(entry.node.state.days) || 1));
        if (!earliest || diffDays(earliest, end) > 0) {
          earliest = end;
        }
      });
      if (earliest && nodes[index].state.start !== earliest) {
        nodes[index].applyPatch({ start: earliest });
        changed = true;
      }
    });
    if (!changed) {
      break;
    }
  }

  // 注释通道：精确进度与多前置依赖
  created.forEach((entry, token) => {
    const meta = metaById.get(token);
    if (!meta) {
      return;
    }
    if (typeof meta.progress === 'number' && !Number.isNaN(meta.progress)) {
      entry.node.applyPatch({ progress: meta.progress });
    }
    if (meta.deps && meta.deps.length) {
      entry.parsed.after = Array.from(new Set([...entry.parsed.after, ...meta.deps]));
    }
  });

  let dependencies = 0;
  parsed.forEach((task) => {
    if (!task.after.length) {
      return;
    }
    const target = created.get(task.id as string);
    if (!target) {
      return;
    }
    Array.from(new Set(task.after)).forEach((token) => {
      const source = created.get(token);
      if (!source) {
        warnings.push(`找不到前置任务「${token}」，已跳过该依赖：${task.line}`);
        return;
      }
      designer.createDependency({ sourceId: source.node.state.id, targetId: target.node.state.id });
      dependencies += 1;
    });
  });

  designer.select(null);
  return { tasks: nodes.length, dependencies, warnings };
}
