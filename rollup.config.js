import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import babel from 'rollup-plugin-babel';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const path = require('path');
const license = require('rollup-plugin-license');

const env = process.env.NODE_ENV;
const extensions = ['.js', '.jsx', '.ts', '.tsx'];
const CommonPlugins = [
  json(),
  nodeResolve({ extensions }),
  commonjs(),
  babel({
    extensions,
    include: ['src/**/*'],
  }),
  env === 'production' &&
    strip({
      include: ['src/**/*.(mjs|js|jsx|ts|tsx)'],
      debugger: false,
      labels: ['console'],
    }),
  env === 'production' &&
    terser({
      keep_classnames: true,
      keep_fnames: true,
    }),
  license({
    sourcemap: true,
    banner: {
      commentStyle: 'regular',
      content: {
        file: path.join(__dirname, 'LICENSE'),
        encoding: 'utf-8',
      },
    },
    thirdParty: {
      allow: '(MIT OR Apache-2.0)',
    },
  }),
].filter(Boolean);
// ice-render 内核在构建时被打包进产物，因此从 external 中排除；其余依赖保持外部
const external = [...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.peerDependencies || {})].filter(
  (name) => name !== 'ice-render'
);
const globals = { 'ice-render': 'ICE' };

/**
 * support config Intellisense
 * @type {import('rollup').RollupOptions[]}
 */
const configs = [
  {
    input: 'src/index.ts',
    external,
    output: {
      file: pkg.main,
      format: 'cjs',
      globals: { ...globals },
    },
    plugins: CommonPlugins,
  },
  {
    input: 'src/index.ts',
    external,
    output: {
      file: pkg.module,
      format: 'esm',
      globals: { ...globals },
    },
    plugins: CommonPlugins,
  },
  {
    input: 'src/index.ts',
    external,
    output: {
      name: 'IED',
      file: pkg.browser,
      format: 'umd',
      globals: { ...globals },
    },
    plugins: CommonPlugins,
  },
  //React 绑定入口（子路径导出 ice-entity-designer/react，仅 ESM + CJS，不打 UMD）
  {
    input: 'src/react/index.ts',
    external,
    output: {
      file: 'dist/react.mjs',
      format: 'esm',
      globals: { ...globals, react: 'React' },
    },
    plugins: CommonPlugins,
  },
  {
    input: 'src/react/index.ts',
    external,
    output: {
      file: 'dist/react.cjs',
      format: 'cjs',
      globals: { ...globals, react: 'React' },
    },
    plugins: CommonPlugins,
  },
];
export default configs;
