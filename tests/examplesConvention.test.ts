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
