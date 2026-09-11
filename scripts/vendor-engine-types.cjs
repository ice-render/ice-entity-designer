/**
 * 把引擎内核（ice-render）的类型声明一并 vendor 进本包，使 .d.ts 完全自包含：
 * 调用方只安装 ice-entity-designer，也能拿到完整类型提示，不需要再安装 ice-render。
 *
 * 步骤：
 *  1) node_modules/ice-render/dist/types            →  dist/types/ice-render
 *  2) 引擎类型引用的 gl-matrix 类型 →  dist/types/gl-matrix.d.ts
 *     （gl-matrix 的 index.d.ts 是 `declare module "gl-matrix"` 形式的**全局 ambient 声明**，
 *       不能当普通模块 import，因此保留引擎里的裸导入 `from 'gl-matrix'`，
 *       改为在本包类型入口用三斜线引用把它带进类型程序）
 *  3) 本包自己产出的 .d.ts 中 `from 'ice-render'` 改写成指向 vendor 目录的相对路径
 *  4) 在类型入口顶部补上 gl-matrix 的 reference
 *
 * 由 npm run build:types 在 tsc 之后调用。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distTypes = path.join(root, 'dist', 'types');
const engineSrc = path.join(root, 'node_modules', 'ice-render', 'dist', 'types');
const engineDest = path.join(distTypes, 'ice-render');
const glMatrixSrc = path.join(root, 'node_modules', 'ice-render', 'node_modules', 'gl-matrix');
const glMatrixAmbient = path.join(distTypes, 'gl-matrix.d.ts');

/** 需要补 gl-matrix reference 的本包类型入口 */
const entries = [path.join(distTypes, 'index.d.ts'), path.join(distTypes, 'react', 'index.d.ts')];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((entry) => {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      // 用读写而不是 copyFile，避免符号链接 / 特殊文件导致的 ENOTSUP
      fs.writeFileSync(to, fs.readFileSync(from));
    }
  });
}

function listDts(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listDts(full, out);
    } else if (entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  });
  return out;
}

/** 计算 fromFile 引用 target（不带扩展名）时应使用的相对说明符 */
function toSpecifier(fromFile, target) {
  let rel = path.relative(path.dirname(fromFile), target).split(path.sep).join('/');
  if (!rel.startsWith('.')) {
    rel = './' + rel;
  }
  return rel;
}

function rewriteSpecifier(file, moduleName, target) {
  const spec = toSpecifier(file, target);
  const text = fs.readFileSync(file, 'utf8');
  const next = text
    .split(`from '${moduleName}'`)
    .join(`from '${spec}'`)
    .split(`from "${moduleName}"`)
    .join(`from "${spec}"`);
  if (next !== text) {
    fs.writeFileSync(file, next);
    return true;
  }
  return false;
}

if (!fs.existsSync(engineSrc)) {
  console.error('[vendor-engine-types] 找不到引擎类型目录：' + engineSrc);
  process.exit(1);
}

// 0) 清理上次 vendor 的产物
fs.rmSync(engineDest, { recursive: true, force: true });
fs.rmSync(glMatrixAmbient, { force: true });

// 1) vendor 引擎类型
copyDir(engineSrc, engineDest);

// 2) vendor gl-matrix 的 ambient 声明
const glMatrixEntry = path.join(glMatrixSrc, 'index.d.ts');
if (fs.existsSync(glMatrixEntry) && fs.statSync(glMatrixEntry).isFile()) {
  fs.writeFileSync(glMatrixAmbient, fs.readFileSync(glMatrixEntry));
} else {
  console.warn('[vendor-engine-types] 未找到 gl-matrix/index.d.ts，跳过');
}

// 3) 本包 .d.ts：把 'ice-render' 指向 vendor 目录
let rewritten = 0;
listDts(distTypes).forEach((file) => {
  if (file.startsWith(engineDest + path.sep)) {
    return;
  }
  if (rewriteSpecifier(file, 'ice-render', path.join(engineDest, 'index'))) {
    rewritten += 1;
  }
});

// 4) 类型入口补 gl-matrix 的 reference（引擎类型里的 `from 'gl-matrix'` 依赖它）
let referenced = 0;
entries.forEach((file) => {
  if (!fs.existsSync(file)) {
    return;
  }
  const spec = toSpecifier(file, glMatrixAmbient);
  const directive = `/// <reference path="${spec}" />\n`;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(directive.trim())) {
    return;
  }
  fs.writeFileSync(file, directive + text);
  referenced += 1;
});

console.log(
  `[vendor-engine-types] 引擎类型已并入 ${path.relative(
    root,
    engineDest
  )}（改写 ${rewritten} 个 .d.ts，补 reference ${referenced} 个）`
);
