/**
 * @file collectors/resource.ts
 * @description 资源加载性能采集器 — 使用 PerformanceObserver 监听页面资源的加载耗时
 *
 * 采集范围：
 * - 脚本文件（script）
 * - 样式表（link/css）
 * - 图片（img）
 * - 字体（font）
 * - XHR/Fetch 请求（xmlhttprequest/fetch）
 * - 其他所有通过网络加载的资源
 *
 * 设计决策：
 * 1. 使用 PerformanceObserver 而非轮询 performance.getEntriesByType()
 *    - PerformanceObserver 是事件驱动的，性能开销更低
 *    - 能实时捕获新加载的资源，不会遗漏
 * 2. 过滤 SDK 自身的上报请求，避免采集到 SDK 发送数据的请求
 * 3. 使用 buffered: true 选项，可以获取到 Observer 注册前已经加载完成的资源
 * 4. 返回 cleanup 函数（observer.disconnect()），供 SDK 销毁时停止监听
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * 初始化资源加载性能采集器
 *
 * 创建 PerformanceObserver 监听 'resource' 类型的性能条目，
 * 将每个资源的加载信息通过 core.capture() 提交给 SDK 核心。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件和读取配置
 * @returns {() => void} cleanup 函数，调用后断开 PerformanceObserver
 */
export function initResourceCollector(core: Core): () => void {
  /* 获取 SDK 配置中的数据上报地址，用于过滤 SDK 自身请求 */
  const dsn = core.getConfig().dsn;
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;

  /**
   * PerformanceObserver 实例引用
   * 保存在外部变量中，供 cleanup 函数使用
   */
  let observer: PerformanceObserver | null = null;

  try {
    /**
     * 创建 PerformanceObserver 实例
     *
     * 回调函数在有新的性能条目时被调用，
     * entryList.getEntries() 返回本次触发中的所有新条目
     */
    observer = new PerformanceObserver((entryList) => {
      /* 获取本次触发中的所有资源性能条目 */
      const entries = entryList.getEntries();

      /* 遍历每个资源条目 */
      for (const entry of entries) {
        /**
         * 将通用的 PerformanceEntry 转换为 PerformanceResourceTiming
         * PerformanceResourceTiming 包含更详细的资源加载时序信息
         */
        const resourceEntry = entry as PerformanceResourceTiming;

        /* 获取资源的 URL */
        const resourceUrl = resourceEntry.name;

        /**
         * 过滤 SDK 自身的上报请求
         * 检查资源 URL 是否包含 SDK 的上报地址（dsn + /v1/）
         */
        if (resourceUrl.includes(dsn) && resourceUrl.includes('/v1/')) {
          /* 跳过 SDK 自身的请求，不采集 */
          continue;
        }

        /* 通过 core.capture() 提交资源加载事件 */
        core.capture({
          type: 'resource',                        /* 事件类型：资源加载 */
          name: resourceUrl,                       /* 资源的完整 URL */
          /**
           * 资源发起类型（initiatorType）
           * 可能的值：script / link / img / css / fetch / xmlhttprequest / other
           * 用于在控制台中按资源类型分类展示
           */
          initiatorType: resourceEntry.initiatorType,
          /**
           * 资源加载总耗时（毫秒）
           * duration = responseEnd - startTime
           * 包含了 DNS 查询、TCP 连接、TLS 握手、请求发送、响应接收的全部时间
           */
          duration: Math.round(resourceEntry.duration),
          /**
           * 资源传输大小（字节）
           * 包含 HTTP 头部和响应体的总大小
           * 如果资源命中缓存，transferSize 为 0
           */
          transferSize: resourceEntry.transferSize,
          /**
           * 资源解码后的大小（字节）
           * 如果响应经过 gzip/br 压缩，decodedBodySize 是解压后的大小
           */
          decodedBodySize: resourceEntry.decodedBodySize,
        });
      }
    });

    /**
     * 开始观察 'resource' 类型的性能条目
     *
     * buffered: true 的作用：
     * 获取 Observer 注册前已经存在的性能条目（即页面加载初期的资源）
     * 这确保了即使 SDK 初始化较晚，也能采集到页面初始加载的资源信息
     */
    observer.observe({
      type: 'resource',                            /* 监听资源加载类型的条目 */
      buffered: true,                              /* 获取已缓冲的历史条目 */
    });

    /* 调试模式下输出初始化信息 */
    if (debug) {
      console.log('[OmniSight] 资源加载采集器已初始化（PerformanceObserver）');
    }
  } catch (err) {
    /**
     * PerformanceObserver 创建失败的处理
     *
     * 可能的原因：
     * 1. 浏览器不支持 PerformanceObserver（IE 等旧浏览器）
     * 2. 浏览器不支持 'resource' 类型的观察
     *
     * 处理策略：在 debug 模式下输出警告，不影响 SDK 其他功能
     */
    if (debug) {
      console.warn('[OmniSight] 资源加载采集器初始化失败:', err);
    }
  }

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 断开 PerformanceObserver 连接
   *
   * 调用 observer.disconnect() 后，Observer 将停止接收新的性能条目。
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用。
   */
  return (): void => {
    /* 如果 observer 存在，断开连接 */
    if (observer) {
      observer.disconnect();
      /* 清空引用，帮助垃圾回收 */
      observer = null;
    }
  };
}
