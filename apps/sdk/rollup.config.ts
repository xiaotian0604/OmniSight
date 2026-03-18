/**
 * @file rollup.config.ts
 * @description Rollup 构建配置 — 输出 ESM / CJS / IIFE 三种格式
 *
 * 设计决策：
 * 1. ESM 格式：供现代打包工具（Vite/Webpack 5+）使用，支持 tree-shaking
 * 2. CJS 格式：兼容 Node.js 环境和旧版打包工具
 * 3. IIFE 格式：供 <script> 标签直接引入，挂载到 window.OmniSight 全局变量
 *
 * rrweb 和 web-vitals 被标记为 external，不打包进 SDK：
 * - rrweb 体积较大（~50KB），作为 optional peer dependency 按需引入
 * - web-vitals 同理，用户可能已经在项目中引入了
 * - 这样做可以将 SDK 核心体积控制在 < 15KB gzip
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const externalDeps = ['rrweb', 'web-vitals'];

const plugins = [
  resolve({
    browser: true,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: true,
    declarationDir: './dist',
  }),
  terser({
    format: {
      comments: false,
    },
  }),
];

const moduleConfig = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/omnisight.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/omnisight.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
  ],
  external: externalDeps,
  plugins,
};

const iifeConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/omnisight.iife.js',
    format: 'iife',
    name: 'OmniSight',
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins,
};

export default [moduleConfig, iifeConfig];
