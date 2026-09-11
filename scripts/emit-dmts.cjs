/**
 * 由 `dist/types/**\/*.d.ts` 生成 ESM 版声明 `*.d.mts`。
 *
 * 为什么需要：本包同时发布 CJS 与 ESM（`dist/index.cjs` / `dist/index.mjs`，
 * React 绑定同样有 `dist/react.cjs` / `dist/react.mjs`）。单一套 `.d.ts` 在无 `type`
 * 字段的包内被判定为 **CJS 声明**，于是 `exports["."].import.types` 指向它时，
 * Node ESM + TS 消费者会按 CJS 互操作解读（`publint` 报「types is interpreted as CJS when
 * resolving with the import condition」，`attw` 报 `Masquerading as CJS`）——
 * 命名导入的行为与 ESM 实际不符。
 *
 * 做法：为 import 条件提供一套 ESM 化声明 —— 内容与 `.d.ts` 相同，只把**相对导入说明符**
 * 补上 `.mjs` 扩展名（TS 会把 `./x.mjs` 解析到 `./x.d.mts`）。
 * require 条件继续用 `.d.ts`，两边都正确。
 *
 * 注意：必须在本包的 `vendor-engine-types.cjs` **之后**运行 —— 后者会把本包 .d.ts 里的
 * `from 'ice-render'` 改写为 vendor 目录的相对路径（`.d.mts` 需要基于改写后的结果再补扩展名）。
 *
 * 用法：node scripts/emit-dmts.cjs（由 npm run build:types 串起来）
 */
const fs = require('fs');
const path = require('path');

const TYPES_DIR = path.resolve(__dirname, '..', 'dist', 'types');

/** 相对说明符补 `.mjs`（已有扩展名的原样保留）。 */
function rewriteSpecifier(spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return spec;
  if (/\.(mjs|cjs|js|json)$/.test(spec)) return spec;
  return spec + '.mjs';
}

function rewrite(content) {
  return content
    .replace(/(\bfrom\s*['"])([^'"]+)(['"])/g, (m, a, spec, b) => a + rewriteSpecifier(spec) + b)
    .replace(/(\bimport\(\s*['"])([^'"]+)(['"]\s*\))/g, (m, a, spec, b) => a + rewriteSpecifier(spec) + b);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

if (!fs.existsSync(TYPES_DIR)) {
  console.error('[emit-dmts] 找不到 ' + TYPES_DIR + '，请先运行 tsc --emitDeclarationOnly');
  process.exit(1);
}

let count = 0;
for (const file of walk(TYPES_DIR)) {
  const target = file.replace(/\.d\.ts$/, '.d.mts');
  fs.writeFileSync(target, rewrite(fs.readFileSync(file, 'utf8')));
  count++;
}
console.log('[emit-dmts] 生成 ' + count + ' 个 .d.mts（ESM 声明）');
