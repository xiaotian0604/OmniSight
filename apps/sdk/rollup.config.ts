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

import resolve from '@rollup/plugin-node-resolve';    /* 解析 node_modules 中的第三方模块 */
import commonjs from '@rollup/plugin-commonjs';        /* 将 CommonJS 模块转换为 ES Module */
import typescript from '@rollup/plugin-typescript';    /* TypeScript 编译支持 */
import terser from '@rollup/plugin-terser';              /* 代码压缩（生产环境） */
import type { RollupOptions } from 'rollup';           /* Rollup 配置类型定义 */

/**
 * 外部依赖列表
 * 这些依赖不会被打包进 SDK 产物中，而是由使用方自行提供
 * - rrweb：用户操作录制库，体积较大，作为可选依赖
 * - web-vitals：Google 官方 Web Vitals 采集库，作为可选依赖
 */
const externalDeps: string[] = ['rrweb', 'web-vitals'];

/**
 * 公共插件配置
 * 所有输出格式共享的 Rollup 插件列表
 */
const plugins = [
  /* 解析 node_modules 中的模块，使 Rollup 能找到第三方包 */
  resolve({
    browser: true,          /* 优先使用 package.json 中的 browser 字段 */
  }),
  /* 将 CommonJS 格式的模块（如某些 npm 包）转换为 ES Module */
  commonjs(),
  /* TypeScript 编译插件，使用项目根目录的 tsconfig.json 配置 */
  typescript({
    tsconfig: './tsconfig.json',
    declaration: true,                /* 生成类型声明文件 */
    declarationDir: './dist',         /* 类型声明文件输出目录 */
  }),
  /* 代码压缩：移除注释、缩短变量名、优化代码体积 */
  terser({
    format: {
      comments: false,      /* 移除所有注释以减小体积 */
    },
  }),
];

/**
 * Rollup 构建配置
 * 定义输入文件和三种输出格式
 */
const config: RollupOptions = {
  /* 构建入口文件 */
  input: 'src/index.ts',

  /* 三种输出格式配置 */
  output: [
    {
      /* ESM 格式：供现代打包工具使用，支持 tree-shaking */
      file: 'dist/omnisight.esm.js',
      format: 'esm',                   /* ES Module 格式 */
      sourcemap: true,                 /* 生成 sourcemap 便于调试 */
    },
    {
      /* CJS 格式：兼容 Node.js 和旧版打包工具 */
      file: 'dist/omnisight.cjs.js',
      format: 'cjs',                   /* CommonJS 格式 */
      sourcemap: true,                 /* 生成 sourcemap 便于调试 */
      exports: 'named',               /* 使用命名导出，避免 default export 警告 */
    },
    {
      /* IIFE 格式：供 <script> 标签直接引入 */
      file: 'dist/omnisight.iife.js',
      format: 'iife',                  /* 立即执行函数格式 */
      name: 'OmniSight',              /* 全局变量名：window.OmniSight */
      sourcemap: true,                 /* 生成 sourcemap 便于调试 */
      /**
       * IIFE 格式下的外部依赖全局变量映射
       * 当用户通过 <script> 标签引入时，这些依赖需要先于 SDK 加载
       * 并挂载到对应的全局变量上
       */
      globals: {
        'rrweb': 'rrweb',             /* rrweb 的全局变量名 */
        'web-vitals': 'webVitals',    /* web-vitals 的全局变量名 */
      },
    },
  ],

  /* 外部依赖：不打包进产物，由使用方自行提供 */
  external: externalDeps,

  /* 构建插件 */
  plugins,
};

/* 导出 Rollup 配置 */
export default config;
