// 传统（非 exports）解析器 / 老版本 TypeScript 的子路径垫片。
// 现代解析器会优先走 package.json 的 "exports"（=> dist/react.mjs / dist/react.cjs）。
module.exports = require('./dist/react.cjs');
