/**
 * @file index.ts
 * @description OmniSight SDK 入口文件 — 对外暴露 init() 和 destroy() 函数
 *
 * 这是 SDK 的唯一入口，业务方通过以下方式使用：
 *
 * ```typescript
 * import { init, destroy } from '@omnisight/sdk';
 *
 * // 初始化 SDK
 * init({
 *   appId: 'your-app-id',
 *   dsn: 'https://your-gateway.com',
 *   sampleRate: 0.1,
 *   enableReplay: true,
 *   privacy: {
 *     maskInputs: true,
 *     blockSelectors: ['.payment-form'],
 *   },
 *   debug: process.env.NODE_ENV === 'development',
 * });
 *
 * // 需要时销毁 SDK
 * destroy();
 * ```
 *
 * 初始化流程：
 * 1. 创建 Core 实例（配置合并、初始化采样器/去重器/上报器）
 * 2. 如果启用了 replay，注入 uploadReplay 实现并初始化 replay 采集器
 * 3. 注册所有采集器（error、api、vitals、resource、behavior、whitescreen）
 * 4. 每个采集器返回的 cleanup 函数注册到 Core 中
 * 5. 如果用户传入了 userId，使用 SHA-256 匿名化后存储
 *
 * 设计决策：
 * - init() 是同步函数，内部的异步操作（如 anonymize、动态 import）不阻塞初始化
 * - 使用模块级变量 coreInstance 保存 Core 实例，确保全局只有一个 SDK 实例
 * - destroy() 会清理所有资源并重置 coreInstance，允许重新 init()
 * - 导出所有类型定义，方便 TypeScript 用户使用
 */

/* ---------------------------------------------------------------
 * 导入核心模块
 * --------------------------------------------------------------- */

/* SDK 核心调度器 */
import { Core } from './core';
/* 导入 Core 相关类型，用于重新导出 */
import type { OmniSightConfig, ResolvedConfig, PrivacyConfig, EventData } from './core';

/* ---------------------------------------------------------------
 * 导入采集器模块
 * --------------------------------------------------------------- */

/* JS 错误采集器：监听 window.onerror、unhandledrejection、console.error */
import { initErrorCollector } from './collectors/error';
/* API 接口采集器：劫持 XHR 和 Fetch */
import { initApiCollector } from './collectors/api';
/* Web Vitals 性能指标采集器：LCP、CLS、TTFB、INP */
import { initVitalsCollector } from './collectors/vitals';
/* 资源加载性能采集器：PerformanceObserver 监听 resource 类型 */
import { initResourceCollector } from './collectors/resource';
/* 用户行为采集器：点击事件、路由变化 */
import { initBehaviorCollector } from './collectors/behavior';
/* 白屏检测器：检查 SPA 根容器是否渲染 */
import { initWhitescreenCollector } from './collectors/whitescreen';
/* 用户操作录制采集器：rrweb 录制 + 错误窗口上传 */
import { initReplayCollector } from './collectors/replay';

/* ---------------------------------------------------------------
 * 导入其他模块
 * --------------------------------------------------------------- */

/* 会话管理：sessionId 生成与持久化 */
import { getSessionId, resetSession } from './session';
/* 用户 ID 匿名化：SHA-256 单向哈希 */
import { anonymizeUserId } from './privacy/anonymize';
/* Beacon API 封装 */
import { sendViaBeacon } from './transport/beacon';

/* ---------------------------------------------------------------
 * 模块级状态
 * --------------------------------------------------------------- */

/**
 * Core 实例的全局引用
 * 确保整个应用中只有一个 SDK 实例在运行
 * null 表示 SDK 未初始化或已销毁
 */
let coreInstance: Core | null = null;

/* ---------------------------------------------------------------
 * 导出函数
 * --------------------------------------------------------------- */

/**
 * 初始化 OmniSight SDK
 *
 * 这是 SDK 的主入口函数，负责：
 * 1. 创建 Core 实例并合并配置
 * 2. 注册所有采集器
 * 3. 注入 replay 上传逻辑（如果启用）
 * 4. 处理用户 ID 匿名化
 *
 * 注意事项：
 * - 重复调用 init() 会先销毁之前的实例，再创建新实例
 * - init() 是同步函数，但内部某些操作是异步的（不阻塞返回）
 * - 初始化顺序很重要：Core 必须先创建，采集器才能注册
 *
 * @param {OmniSightConfig & { userId?: string }} config - SDK 配置对象
 *   除了标准的 OmniSightConfig 字段外，还支持可选的 userId 字段
 */
export function init(config: OmniSightConfig & { userId?: string }): void {
  /**
   * 防止重复初始化
   * 如果已经存在 Core 实例，先销毁它再创建新的
   * 这在 HMR（热更新）场景下很常见：模块重新加载时需要重新初始化
   */
  if (coreInstance) {
    coreInstance.destroy();
    coreInstance = null;
  }

  /* ---------------------------------------------------------------
   * 步骤 1：创建 Core 实例
   * --------------------------------------------------------------- */

  /**
   * 创建 Core 实例
   * Core 构造函数会合并用户配置与默认值，初始化采样器、去重器、上报器
   */
  const core = new Core(config);

  /* 将 Core 实例保存到模块级变量 */
  coreInstance = core;

  /* ---------------------------------------------------------------
   * 步骤 2：注入 uploadReplay 实现（如果启用了 replay）
   * --------------------------------------------------------------- */

  /**
   * 检查是否启用了 replay 功能
   * 只有 enableReplay 为 true 时才注入上传逻辑和初始化录制采集器
   */
  if (core.getConfig().enableReplay) {
    /**
     * 注入 uploadReplay 的具体实现
     *
     * 当 replay 采集器检测到错误并收集完录像数据后，会调用 core.uploadReplay()。
     * 这里定义了 uploadReplay 的具体行为：将录像数据发送到 Gateway 的 /v1/replay 接口。
     *
     * 使用 sendBeacon 优先发送，因为录像数据可能在页面即将关闭时上传。
     * 如果 sendBeacon 失败（数据过大），降级使用 fetch。
     *
     * @param {unknown[]} events - rrweb 录制的事件数组
     */
    core.uploadReplay = (events: unknown[]): void => {
      /* 构建上传数据：包含 sessionId 和录像事件 */
      const payload = JSON.stringify({
        sessionId: getSessionId(),                 /* 当前会话 ID */
        appId: core.getConfig().appId,             /* 应用标识符 */
        events,                                    /* rrweb 录制的事件数组 */
      });

      /* 构建上传 URL */
      const url = `${core.getConfig().dsn.replace(/\/$/, '')}/v1/replay`;

      /**
       * 优先使用 sendBeacon 发送
       * 录像数据可能较大，如果超过 64KB 限制，sendBeacon 会返回 false
       */
      const beaconSuccess = sendViaBeacon(url, payload);

      /**
       * 如果 sendBeacon 失败，降级使用 fetch
       * fetch 没有数据大小限制，但在页面卸载时可能被取消
       */
      if (!beaconSuccess) {
        try {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,                       /* keepalive 允许在页面卸载后继续发送 */
          }).catch(() => {
            /* fetch 失败时静默忽略，录像数据丢失是可接受的 */
          });
        } catch {
          /* fetch 调用本身失败时静默忽略 */
        }
      }
    };

    /**
     * 初始化 replay 采集器
     * 启动 rrweb 录制，注册错误回调，管理 Ring Buffer
     */
    const replayCleanup = initReplayCollector(core);
    /* 将 replay 采集器的 cleanup 函数注册到 Core */
    core.registerCleanup(replayCleanup);
  }

  /* ---------------------------------------------------------------
   * 步骤 3：注册所有采集器
   * --------------------------------------------------------------- */

  /**
   * 初始化 JS 错误采集器
   * 监听 window.onerror、unhandledrejection、console.error
   */
  const errorCleanup = initErrorCollector(core);
  core.registerCleanup(errorCleanup);

  /**
   * 初始化 API 接口采集器
   * 劫持 XMLHttpRequest 和 Fetch，采集接口请求信息
   */
  const apiCleanup = initApiCollector(core);
  core.registerCleanup(apiCleanup);

  /**
   * 初始化 Web Vitals 性能指标采集器
   * 动态导入 web-vitals，采集 LCP/CLS/TTFB/INP
   */
  const vitalsCleanup = initVitalsCollector(core);
  core.registerCleanup(vitalsCleanup);

  /**
   * 初始化资源加载性能采集器
   * 使用 PerformanceObserver 监听 resource 类型的性能条目
   */
  const resourceCleanup = initResourceCollector(core);
  core.registerCleanup(resourceCleanup);

  /**
   * 初始化用户行为采集器
   * 监听点击事件（捕获阶段）和路由变化（popstate/pushState/replaceState/hashchange）
   */
  const behaviorCleanup = initBehaviorCollector(core);
  core.registerCleanup(behaviorCleanup);

  /**
   * 初始化白屏检测器
   * 3 秒后检查 #root 或 #app 的子元素数量
   */
  const whitescreenCleanup = initWhitescreenCollector(core);
  core.registerCleanup(whitescreenCleanup);

  /* ---------------------------------------------------------------
   * 步骤 4：注册 session 的 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * 将 session 的 resetSession 注册为 cleanup
   * SDK 销毁时会清除 localStorage 中的会话数据
   */
  core.registerCleanup(resetSession);

  /* ---------------------------------------------------------------
   * 步骤 5：处理用户 ID 匿名化（异步，不阻塞初始化）
   * --------------------------------------------------------------- */

  /**
   * 如果用户传入了 userId，使用 SHA-256 进行匿名化处理
   * 匿名化后的 userId 会在后续的事件中使用（通过闭包或全局状态）
   *
   * 注意：这是一个异步操作，不会阻塞 SDK 的初始化
   * 在匿名化完成之前上报的事件不会包含 userId 字段
   */
  if (config.userId) {
    anonymizeUserId(config.userId)
      .then((hashedId) => {
        /* 匿名化成功后，将哈希 ID 存入 Core 实例，后续事件将携带此 userId */
        core.setUserId(hashedId);
        if (core.getConfig().debug) {
          console.log('[OmniSight] 用户 ID 已匿名化:', hashedId);
        }
      })
      .catch(() => {
        /* 匿名化失败时静默忽略，不影响 SDK 正常运行 */
      });
  }

  /* 调试模式下输出初始化完成信息 */
  if (core.getConfig().debug) {
    console.log('[OmniSight] SDK 初始化完成，所有采集器已注册');
  }
}

/**
 * 销毁 OmniSight SDK — 释放所有资源、移除所有事件监听器
 *
 * 调用此函数后：
 * 1. 所有采集器停止工作（移除事件监听、断开 Observer、恢复劫持的方法）
 * 2. 批量上报器强制 flush 队列中剩余的事件
 * 3. 会话数据从 localStorage 中清除
 * 4. Core 实例被销毁，coreInstance 重置为 null
 *
 * 销毁后可以重新调用 init() 来初始化新的 SDK 实例。
 *
 * 使用场景：
 * - 单页应用中的页面卸载
 * - 用户主动关闭监控功能
 * - HMR（热更新）时重新初始化
 * - 测试环境中重置状态
 */
export function destroy(): void {
  /* 如果 SDK 未初始化，直接返回 */
  if (!coreInstance) {
    return;
  }

  /* 调用 Core 的 destroy 方法，执行所有 cleanup 函数 */
  coreInstance.destroy();

  /* 重置模块级变量，允许重新 init() */
  coreInstance = null;
}

/* ---------------------------------------------------------------
 * 导出类型定义
 * --------------------------------------------------------------- */

/**
 * 重新导出所有公共类型，方便 TypeScript 用户使用
 *
 * 使用方式：
 * ```typescript
 * import type { OmniSightConfig, ResolvedConfig, PrivacyConfig } from '@omnisight/sdk';
 * ```
 */
export type {
  OmniSightConfig,    /* SDK 初始化配置接口 */
  ResolvedConfig,     /* 解析后的完整配置接口 */
  PrivacyConfig,      /* 隐私脱敏配置接口 */
  EventData,          /* 事件数据接口 */
};

/* 导出 Core 类（高级用法：直接操作 Core 实例） */
export { Core };

/* 导出错误指纹生成函数（高级用法：自定义指纹逻辑） */
export { getErrorFingerprint } from './core';

/* 导出会话管理函数（高级用法：手动管理会话） */
export { getSessionId, resetSession } from './session';

/* 导出匿名化函数（高级用法：自定义匿名化逻辑） */
export { anonymizeUserId } from './privacy/anonymize';
