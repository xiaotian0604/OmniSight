/**
 * @file collectors/vitals.ts
 * @description Web Vitals 性能指标采集器 — 采集 Google 定义的核心 Web 性能指标
 *
 * 采集以下四个核心指标（FID 已被 Google 废弃，由 INP 替代）：
 * 1. LCP (Largest Contentful Paint) — 最大内容绘制时间
 *    衡量页面主要内容的加载速度，good < 2.5s, poor > 4s
 * 2. CLS (Cumulative Layout Shift) — 累积布局偏移
 *    衡量页面视觉稳定性，good < 0.1, poor > 0.25
 * 3. TTFB (Time to First Byte) — 首字节到达时间
 *    衡量服务器响应速度，good < 800ms, poor > 1800ms
 * 4. INP (Interaction to Next Paint) — 交互到下一次绘制
 *    衡量页面交互响应速度（替代 FID），good < 200ms, poor > 500ms
 *
 * 设计决策：
 * - 使用动态 import('web-vitals') 而非静态导入，原因：
 *   1. web-vitals 是 optional peer dependency，用户可能没有安装
 *   2. 动态导入在模块不存在时不会导致 SDK 整体加载失败
 *   3. 支持 tree-shaking，未安装时不会增加 bundle 体积
 * - 在 debug 模式下，如果 web-vitals 导入失败，输出警告而非抛出错误
 * - web-vitals 的回调函数会在指标最终确定时触发（通常是页面卸载或后台化时）
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * 初始化 Web Vitals 性能指标采集器
 *
 * 通过动态导入 web-vitals 库，注册各指标的回调函数。
 * 当指标值确定时，通过 core.capture() 提交给 SDK 核心。
 *
 * 注意：此函数是异步的，但不返回 Promise，因为 Web Vitals 的采集
 * 不需要等待完成就可以继续初始化其他模块。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件
 * @returns {() => void} cleanup 函数（Web Vitals 不需要特殊清理，返回空函数）
 */
export function initVitalsCollector(core: Core): () => void {
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;

  /**
   * 动态导入 web-vitals 库并注册指标回调
   *
   * 使用立即执行的异步函数（IIFE）包裹，
   * 因为 initVitalsCollector 本身是同步函数（需要立即返回 cleanup）
   */
  (async () => {
    try {
      /**
       * 动态导入 web-vitals 模块
       * 如果用户没有安装 web-vitals，这里会抛出 import 错误，
       * 被外层 catch 捕获后静默处理
       */
      const webVitals = await import('web-vitals');

      /**
       * 注册 LCP (Largest Contentful Paint) 回调
       * LCP 衡量页面主要内容的加载速度
       * - good: < 2500ms
       * - needs-improvement: 2500ms ~ 4000ms
       * - poor: > 4000ms
       */
      webVitals.onLCP((metric) => {
        core.capture({
          type: 'vital',                          /* 事件类型：性能指标 */
          name: 'LCP',                            /* 指标名称 */
          value: metric.value,                    /* 指标值（毫秒） */
          rating: metric.rating,                  /* 评级：good / needs-improvement / poor */
        });
      });

      /**
       * 注册 CLS (Cumulative Layout Shift) 回调
       * CLS 衡量页面的视觉稳定性（布局是否频繁跳动）
       * - good: < 0.1
       * - needs-improvement: 0.1 ~ 0.25
       * - poor: > 0.25
       */
      webVitals.onCLS((metric) => {
        core.capture({
          type: 'vital',                          /* 事件类型：性能指标 */
          name: 'CLS',                            /* 指标名称 */
          value: metric.value,                    /* 指标值（无单位，累积分数） */
          rating: metric.rating,                  /* 评级 */
        });
      });

      /**
       * 注册 TTFB (Time to First Byte) 回调
       * TTFB 衡量从请求发出到收到第一个字节的时间
       * - good: < 800ms
       * - needs-improvement: 800ms ~ 1800ms
       * - poor: > 1800ms
       */
      webVitals.onTTFB((metric) => {
        core.capture({
          type: 'vital',                          /* 事件类型：性能指标 */
          name: 'TTFB',                           /* 指标名称 */
          value: metric.value,                    /* 指标值（毫秒） */
          rating: metric.rating,                  /* 评级 */
        });
      });

      /**
       * 注册 INP (Interaction to Next Paint) 回调
       * INP 衡量用户交互（点击、键盘输入等）到页面响应的延迟
       * INP 已于 2024 年 3 月正式替代 FID 成为核心 Web Vitals 指标
       * - good: < 200ms
       * - needs-improvement: 200ms ~ 500ms
       * - poor: > 500ms
       */
      webVitals.onINP((metric) => {
        core.capture({
          type: 'vital',                          /* 事件类型：性能指标 */
          name: 'INP',                            /* 指标名称 */
          value: metric.value,                    /* 指标值（毫秒） */
          rating: metric.rating,                  /* 评级 */
        });
      });

      /* 调试模式下输出初始化成功信息 */
      if (debug) {
        console.log('[OmniSight] Web Vitals 采集器已初始化（LCP/CLS/TTFB/INP）');
      }
    } catch (err) {
      /**
       * web-vitals 导入失败的处理
       *
       * 可能的原因：
       * 1. 用户没有安装 web-vitals（它是 optional peer dependency）
       * 2. 运行环境不支持动态 import（极少见）
       *
       * 处理策略：在 debug 模式下输出警告，不影响 SDK 其他功能的正常运行
       */
      if (debug) {
        console.warn(
          '[OmniSight] Web Vitals 采集器初始化失败，可能未安装 web-vitals 依赖:',
          err,
        );
      }
    }
  })();

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数
   *
   * Web Vitals 的回调函数由 web-vitals 库内部管理，
   * 没有提供取消注册的 API，因此 cleanup 函数为空。
   * 在页面卸载时，web-vitals 的回调会自然停止。
   */
  return (): void => {
    /* Web Vitals 不需要特殊清理 */
  };
}
