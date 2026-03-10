/**
 * @file collectors/error.ts
 * @description JS 错误采集器 — 监听并捕获页面中发生的所有 JavaScript 错误
 *
 * 监听三种错误来源：
 * 1. window.addEventListener('error') — 捕获同步运行时错误
 *    - 需要过滤资源加载错误（如图片 404），通过 e.error 是否存在来判断
 *    - 资源加载错误的 e.error 为 null/undefined，而 JS 运行时错误的 e.error 是 Error 对象
 * 2. window.addEventListener('unhandledrejection') — 捕获未处理的 Promise 异常
 *    - Promise.reject() 后没有 .catch() 处理的异常
 *    - async/await 中未被 try-catch 捕获的异常
 * 3. console.error 劫持 — 捕获业务代码主动调用 console.error 上报的错误
 *    - 劫持 console.error 方法，在原始调用前先提交事件
 *    - 对象类型的参数使用 JSON.stringify 序列化
 *    - 劫持后仍然调用原始的 console.error，不影响开发者工具的输出
 *
 * 设计决策：
 * - 返回 cleanup 函数，供 SDK 销毁时移除所有事件监听器和恢复 console.error
 * - 使用 try-catch 包裹 JSON.stringify，防止循环引用导致的序列化失败
 * - error 事件监听器不使用 capture 阶段（第三个参数为 false），
 *   因为 error 事件不会冒泡，但会在 window 上触发
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * 初始化 JS 错误采集器
 *
 * 注册三种错误监听机制，将捕获到的错误通过 core.capture() 提交给 SDK 核心。
 * 返回 cleanup 函数，调用后会移除所有监听器并恢复 console.error。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件
 * @returns {() => void} cleanup 函数，调用后移除所有错误监听
 */
export function initErrorCollector(core: Core): () => void {
  /* ---------------------------------------------------------------
   * 1. 监听 window error 事件 — 捕获同步运行时错误
   * --------------------------------------------------------------- */

  /**
   * window error 事件处理函数
   *
   * 注意：window 的 error 事件会同时被 JS 运行时错误和资源加载错误触发。
   * 区分方式：
   * - JS 运行时错误：event.error 是一个 Error 对象，event.message 是错误消息
   * - 资源加载错误：event.error 为 undefined，event.target 是加载失败的 DOM 元素
   *
   * 我们只关心 JS 运行时错误，资源加载错误由 resource 采集器处理。
   *
   * @param {ErrorEvent} event - 浏览器原生的 ErrorEvent 对象
   */
  const onWindowError = (event: ErrorEvent): void => {
    /* 过滤资源加载错误：如果 event.error 不存在，说明是资源加载失败而非 JS 错误 */
    if (!event.error) {
      return;
    }

    /* 通过 core.capture() 提交错误事件 */
    core.capture({
      type: 'error',                              /* 事件类型：错误 */
      message: event.message,                     /* 错误消息文本 */
      stack: event.error?.stack,                  /* 错误堆栈字符串（用于定位错误位置） */
      filename: event.filename,                   /* 发生错误的脚本文件名 */
      lineno: event.lineno,                       /* 错误发生的行号 */
      colno: event.colno,                         /* 错误发生的列号 */
    });
  };

  /* 注册 window error 事件监听器 */
  window.addEventListener('error', onWindowError);

  /* ---------------------------------------------------------------
   * 2. 监听 unhandledrejection 事件 — 捕获未处理的 Promise 异常
   * --------------------------------------------------------------- */

  /**
   * unhandledrejection 事件处理函数
   *
   * 当 Promise 被 reject 但没有 .catch() 处理时触发。
   * event.reason 可能是任意类型（Error 对象、字符串、数字等），
   * 需要统一转换为字符串。
   *
   * @param {PromiseRejectionEvent} event - 浏览器原生的 PromiseRejectionEvent 对象
   */
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    /* 将 reason 转换为字符串消息 */
    /* 如果 reason 是 Error 对象，使用其 message 属性；否则使用 String() 转换 */
    const message =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);

    /* 尝试获取堆栈信息（只有 Error 对象才有 stack 属性） */
    const stack =
      event.reason instanceof Error ? event.reason.stack : undefined;

    /* 通过 core.capture() 提交错误事件 */
    core.capture({
      type: 'error',                              /* 事件类型：错误 */
      message,                                    /* 错误消息（已转换为字符串） */
      stack,                                      /* 错误堆栈（如果可用） */
    });
  };

  /* 注册 unhandledrejection 事件监听器 */
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  /* ---------------------------------------------------------------
   * 3. 劫持 console.error — 捕获业务代码主动上报的错误
   * --------------------------------------------------------------- */

  /**
   * 保存原始的 console.error 方法引用
   * 使用 bind(console) 确保在调用时 this 指向 console 对象，
   * 避免在某些环境下 this 丢失导致的 Illegal invocation 错误
   */
  const originalConsoleError = console.error.bind(console);

  /**
   * 劫持后的 console.error 方法
   *
   * 设计决策：
   * - 先提交事件再调用原始方法，确保即使原始方法抛出异常也能捕获到错误
   * - 对象类型的参数使用 JSON.stringify 序列化，方便后续分析
   * - JSON.stringify 用 try-catch 包裹，防止循环引用导致的序列化失败
   *
   * @param {...unknown[]} args - console.error 的参数列表
   */
  console.error = (...args: unknown[]): void => {
    /* 将所有参数转换为字符串并拼接 */
    const message = args
      .map((arg) => {
        /* 如果参数是对象类型，尝试用 JSON.stringify 序列化 */
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg);
          } catch {
            /* JSON.stringify 失败时（如循环引用），降级使用 String() 转换 */
            return String(arg);
          }
        }
        /* 非对象类型直接转换为字符串 */
        return String(arg);
      })
      .join(' ');                                 /* 用空格拼接所有参数 */

    /* 通过 core.capture() 提交错误事件 */
    core.capture({
      type: 'error',                              /* 事件类型：错误 */
      message,                                    /* 拼接后的错误消息 */
    });

    /* 调用原始的 console.error，保持开发者工具中的正常输出 */
    originalConsoleError(...args);
  };

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 移除所有错误监听器并恢复 console.error
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用
   */
  return (): void => {
    /* 移除 window error 事件监听器 */
    window.removeEventListener('error', onWindowError);

    /* 移除 unhandledrejection 事件监听器 */
    window.removeEventListener('unhandledrejection', onUnhandledRejection);

    /* 恢复原始的 console.error 方法 */
    console.error = originalConsoleError;
  };
}
