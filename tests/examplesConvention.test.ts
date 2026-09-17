/**
 * 示例页写法棘轮（2026-09-17 立）。
 *
 * 约定：`examples/*.html` 一律是"**一页 = 一个类**"—— 类名按页面取，内联脚本里不出现模块级
 * `function` / `let`，刷新入口统一叫 `onUpdate()`。整套示例页统一花了一整轮，用这条正则守住
 * "别再写回函数式"最便宜。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.resolve(__dirname, '..', 'examples');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));

const scriptOf = (html: string) =>
  [...html.matchAll(/<script(?: type="text\/javascript")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

describe('示例页写法棘轮', () => {
  it('收录了示例页（防目录改名后静默空转）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('每个示例页都是「一页一个类」，且内联脚本没有模块级 function / let', () => {
    const bad: string[] = [];
    for (const f of files) {
      const script = scriptOf(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (!script.trim()) continue;
      const classes = (script.match(/^\s{0,6}class [A-Z]/gm) || []).length;
      const topFn = (script.match(/^\s{0,6}function /gm) || []).length;
      const topLet = (script.match(/^\s{0,6}let /gm) || []).length;
      if (classes !== 1 || topFn > 0 || topLet > 0) bad.push(`${f}(类${classes}/fn${topFn}/let${topLet})`);
    }
    expect(bad).toEqual([]);
  });

  it('刷新入口统一叫 onUpdate()（页面有刷新动作时）', () => {
    const bad = files.filter((f) => /\brender\(\)\s*\{/.test(scriptOf(fs.readFileSync(path.join(DIR, f), 'utf8'))));
    expect(bad).toEqual([]);
  });
});

/**
 * 类体里的成员序列：`S` 静态字段 / `F` 实例字段 / `C` 构造函数 / `A` 访问器 /
 * `T` 静态方法 / `M` 实例方法。只看**类体这一层**，方法体里的东西不算；注释行整行跳过。
 */
const memberSequence = (classBody: string): string => {
  const kinds: string[] = [];
  let depth = 0;
  for (const line of classBody.split('\n')) {
    const t = line.trim();
    if (depth === 0 && t && !/^(\*|\/\/|\/\*)/.test(t)) {
      const isCtor = /^(?:public |protected |private )?constructor\s*\(/.test(t);
      const isStatic = /^(?:public |protected |private )?static\b/.test(t);
      const isAccessor = /^(?:public |private |protected )?(?:get|set)\s+[A-Za-z_$]/.test(t);
      const isCall = /\b(if|for|while|switch|catch|return|new|super|await|void|typeof)\b/.test(t.split('(')[0]);
      const mods = '(?:(?:public|private|protected|readonly|declare|abstract|override|static|async|\\*)\\s+)*';
      const isMethod =
        !isCtor &&
        !isAccessor &&
        !isCall &&
        /\(/.test(t) &&
        new RegExp(`^${mods}[A-Za-z_$#][\\w$]*(?:\\s*<[^>]*>)?\\s*\\(`).test(t);
      const isField =
        !isCtor &&
        !isAccessor &&
        !isMethod &&
        new RegExp(`^${mods}[A-Za-z_$#][\\w$]*(?:!|\\?)?\\s*(?::[^=;]*)?(?:=|;)`).test(t);
      if (isCtor) kinds.push('C');
      else if (isField) kinds.push(isStatic ? 'S' : 'F');
      else if (isAccessor) kinds.push('A');
      else if (isMethod) kinds.push(isStatic ? 'T' : 'M');
    }
    depth += (line.match(/[{([]/g) || []).length - (line.match(/[})\]]/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return kinds.join('');
};

/**
 * 成员顺序棘轮（2026-09-17 定，全家族同口径）。
 *
 * 契约：`static 常量/字段 → static 方法 → 实例字段 → 构造函数 → 访问器 / 实例方法`
 * —— 就是这条正则：`S*T*F*C*(A|M)*`。示例页本来几乎都是这个形状（只有
 * `flowchart-editor` 的 `static SEED_FLOW` 落在构造函数之后，2026-09-17 挪到类首）。
 *
 * 为什么只到这一层：Google Java Style §3.4.2 明确说 class 成员顺序"**没有唯一正确的配方**"
 * （要的是每种顺序都讲得通、维护者能解释），Google 的 TypeScript 指南对顺序**完全沉默**
 * （全文 "ordering" 出现 0 次）。所以 public/private 的先后、同组内谁先谁后，留给作者判断。
 *
 * ⚠️ 挪位置前先分清挪的是什么：**方法随便挪**（类定义时方法就全部装好，与文本顺序无关），
 * **字段的声明顺序有语义**（初始化按声明顺序执行 + 影响 V8 的 class shape）。
 */
describe('成员顺序棘轮（static 常量 → 实例字段 → 构造函数 → 方法）', () => {
  it('每个示例页的页面类都是 S*T*F*C*(A|M)*', () => {
    const bad: string[] = [];
    let scanned = 0;
    for (const f of files) {
      const script = scriptOf(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const at = script.search(/^[ \t]*(?:export\s+)?(?:abstract\s+)?class\s+[A-Za-z_$]/m);
      if (at < 0) continue;
      const seq = memberSequence(script.slice(at).split('\n').slice(1).join('\n'));
      if (!seq) continue;
      scanned++;
      if (!/^S*T*F*C*(?:A|M)*$/.test(seq)) bad.push(`${f}(${seq})`);
    }
    expect(bad).toEqual([]);
    // 自检：一条都没扫到就说明这条测试已经失效了
    expect(scanned).toBe(files.length);
  });
});
