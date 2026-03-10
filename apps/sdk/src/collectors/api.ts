/**
 * @file collectors/api.ts
 * @description API 接口采集器 — 劫持 XMLHttpRequest 和 Fetch，采集接口请求的耗时、状态等信息
 *
 * 采集两种 HTTP 请求方式：
 * 1. XMLHttpRequest（XHR）劫持：
 *    - 重写 XMLHttpRequest.prototype.open 和 send 方法
 *    - open 方法透传所有 5 个参数（method, url, async, user, password），保存 method 和 url
 *    - send 方法记录开始时间，在 loadend 事件中计算耗时并上报
 * 2. Fetch 劫持：
 *    - 替换 window.fetch 为包装函数
 *    - 处理 input 参数的三种类型：string、URL 对象、Request 对象
 *    - 在 then/catch 中计算耗时并上报
 *
 * 关键设计：
 * - isSdkRequest() 过滤 SDK 自身的上报请求，避免无限递归
 *   （SDK 上报数据时也会触发 XHR/Fetch，如果不过滤会导致无限循环）
 * - 返回 cleanup 函数，恢复原始的 XHR 和 Fetch
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * 判断一个请求是否是 SDK 自身发出的上报请求
 *
 * 过滤逻辑：检查请求 URL 是否匹配 SDK 的上报地址（dsn + /v1/ 路径）
 * 如果匹配，说明这是 SDK 自己的数据上报请求，不应该被采集
 *
 * 设计决策：
 * - 使用 dsn + '/v1/' 作为匹配规则，因为所有 SDK 上报接口都在 /v1/ 路径下
 * - 使用 includes() 而非 startsWith()，兼容 URL 中可能存在的协议差异
 *
 * @param {string} url - 请求的 URL 地址
 * @param {string} dsn - SDK 配置的数据上报地址
 * @returns {boolean} true 表示是 SDK 自身的请求，应该被过滤
 */
function isSdkRequest(url: string, dsn: string): boolean {
  /* 检查 URL 是否包含 dsn 地址和 /v1/ 路径前缀 */
  return url.includes(dsn) && url.includes('/v1/');
}

/**
 * 从 Fetch 的 input 参数中提取 URL 字符串
 *
 * Fetch API 的第一个参数 input 有三种可能的类型：
 * 1. string — 直接就是 URL 字符串
 * 2. URL 对象 — 使用 .href 属性获取完整 URL
 * 3. Request 对象 — 使用 .url 属性获取 URL
 *
 * @param {RequestInfo | URL} input - Fetch 的 input 参数
 * @returns {string} 提取出的 URL 字符串
 */
function extractFetchUrl(input: RequestInfo | URL): string {
  /* 如果是字符串类型，直接返回 */
  if (typeof input === 'string') {
    return input;
  }
  /* 如果是 URL 对象，返回 href 属性 */
  if (input instanceof URL) {
    return input.href;
  }
  /* 如果是 Request 对象，返回 url 属性 */
  if (input instanceof Request) {
    return input.url;
  }
  /* 兜底：转换为字符串 */
  return String(input);
}

/**
 * 初始化 API 接口采集器
 *
 * 劫持 XMLHttpRequest 和 Fetch，在每次请求完成后采集请求信息（URL、状态码、耗时等），
 * 通过 core.capture() 提交给 SDK 核心。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件和读取配置
 * @returns {() => void} cleanup 函数，调用后恢复原始的 XHR 和 Fetch
 */
export function initApiCollector(core: Core): () => void {
  /* 获取 SDK 配置中的数据上报地址，用于过滤 SDK 自身请求 */
  const dsn = core.getConfig().dsn;
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;

  /* ---------------------------------------------------------------
   * 1. 劫持 XMLHttpRequest
   * --------------------------------------------------------------- */

  /**
   * 保存原始的 XMLHttpRequest 构造函数引用
   * 用于在 cleanup 时恢复
   */
  const OriginalXHR = window.XMLHttpRequest;

  /**
   * 保存原始的 XMLHttpRequest.prototype.open 方法引用
   * 我们将重写此方法以拦截请求的 method 和 url
   */
  const originalOpen = OriginalXHR.prototype.open;

  /**
   * 保存原始的 XMLHttpRequest.prototype.send 方法引用
   * 我们将重写此方法以记录请求开始时间和注册完成回调
   */
  const originalSend = OriginalXHR.prototype.send;

  /**
   * 重写 XMLHttpRequest.prototype.open 方法
   *
   * 透传所有 5 个参数给原始 open 方法，同时保存 method 和 url 到 XHR 实例上，
   * 供后续 send 方法中使用。
   *
   * XMLHttpRequest.open() 的完整签名：
   * open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null)
   *
   * 设计决策：使用 function 而非箭头函数，确保 this 指向 XHR 实例
   */
  OriginalXHR.prototype.open = function (
    method: string,                               /* HTTP 方法（GET/POST/PUT/DELETE 等） */
    url: string | URL,                            /* 请求的目标 URL */
    async?: boolean,                              /* 是否异步（默认 true） */
    user?: string | null,                         /* HTTP 认证用户名（可选） */
    password?: string | null,                     /* HTTP 认证密码（可选） */
  ): void {
    /* 将 method 保存到 XHR 实例的自定义属性上，供 send 方法中使用 */
    (this as XMLHttpRequest & { _omnisight_method?: string })._omnisight_method = method;
    /* 将 url 转换为字符串并保存，URL 对象需要取 href 属性 */
    (this as XMLHttpRequest & { _omnisight_url?: string })._omnisight_url =
      typeof url === 'string' ? url : url.href;

    /* 调用原始的 open 方法，透传所有参数 */
    originalOpen.call(this, method, url, async ?? true, user ?? null, password ?? null);
  };

  /**
   * 重写 XMLHttpRequest.prototype.send 方法
   *
   * 在发送请求前记录开始时间，在请求完成（loadend 事件）时计算耗时并上报。
   *
   * 设计决策：
   * - 使用 loadend 事件而非 load/error/abort，因为 loadend 在所有情况下都会触发
   * - 使用 performance.now() 而非 Date.now()，精度更高（微秒级）
   */
  OriginalXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
    /* 读取之前在 open 中保存的 url */
    const url = (this as XMLHttpRequest & { _omnisight_url?: string })._omnisight_url || '';
    /* 读取之前在 open 中保存的 method */
    const method = (this as XMLHttpRequest & { _omnisight_method?: string })._omnisight_method || 'GET';

    /* 检查是否是 SDK 自身的上报请求，如果是则跳过采集 */
    if (isSdkRequest(url, dsn)) {
      /* 直接调用原始 send，不做任何采集 */
      originalSend.call(this, body);
      return;
    }

    /* 记录请求开始时间（使用高精度计时器） */
    const startTime = performance.now();

    /**
     * 注册 loadend 事件监听器
     * loadend 在请求完成时触发（无论成功、失败还是中断）
     */
    this.addEventListener('loadend', () => {
      /* 计算请求耗时（毫秒） */
      const duration = performance.now() - startTime;

      /* 通过 core.capture() 提交 API 事件 */
      core.capture({
        type: 'api',                              /* 事件类型：API 请求 */
        method,                                   /* HTTP 方法 */
        apiUrl: url,                              /* 请求目标 URL（使用 apiUrl 避免与 BaseEvent.url 冲突） */
        status: this.status,                      /* HTTP 响应状态码 */
        duration: Math.round(duration),           /* 请求耗时（四舍五入到整数毫秒） */
      });
    });

    /* 调用原始的 send 方法，发送请求 */
    originalSend.call(this, body);
  };

  /* ---------------------------------------------------------------
   * 2. 劫持 Fetch
   * --------------------------------------------------------------- */

  /**
   * 保存原始的 window.fetch 方法引用
   * 用于在劫持函数中调用原始 fetch，以及在 cleanup 时恢复
   */
  const originalFetch = window.fetch;

  /**
   * 劫持后的 fetch 方法
   *
   * 包装原始 fetch，在请求前后记录时间并上报。
   * 处理 input 参数的三种类型：string、URL、Request。
   *
   * 设计决策：
   * - 使用 async/await 语法，代码更清晰
   * - 在 catch 中也上报事件（status 为 0），记录网络错误
   * - 错误仍然 throw 出去，不影响业务代码的错误处理逻辑
   */
  window.fetch = async function (
    input: RequestInfo | URL,                     /* 请求的 URL 或 Request 对象 */
    init?: RequestInit,                           /* 请求配置（method、headers、body 等） */
  ): Promise<Response> {
    /* 从 input 参数中提取 URL 字符串 */
    const url = extractFetchUrl(input);

    /* 检查是否是 SDK 自身的上报请求，如果是则直接透传 */
    if (isSdkRequest(url, dsn)) {
      return originalFetch.call(window, input, init);
    }

    /**
     * 确定 HTTP 方法
     * 优先级：init.method > Request 对象的 method > 默认 'GET'
     */
    const method =
      init?.method ||
      (input instanceof Request ? input.method : 'GET');

    /* 记录请求开始时间 */
    const startTime = performance.now();

    try {
      /* 调用原始 fetch 发送请求 */
      const response = await originalFetch.call(window, input, init);

      /* 计算请求耗时 */
      const duration = performance.now() - startTime;

      /* 通过 core.capture() 提交 API 事件 */
      core.capture({
        type: 'api',                              /* 事件类型：API 请求 */
        method,                                   /* HTTP 方法 */
        apiUrl: url,                              /* 请求目标 URL（使用 apiUrl 避免与 BaseEvent.url 冲突） */
        status: response.status,                  /* HTTP 响应状态码 */
        duration: Math.round(duration),           /* 请求耗时（四舍五入到整数毫秒） */
      });

      /* 返回原始的 Response 对象，不影响业务代码 */
      return response;
    } catch (err) {
      /* 网络错误（如 DNS 解析失败、CORS 阻止、网络断开等） */
      const duration = performance.now() - startTime;

      /* 上报网络错误事件，status 设为 0 表示请求未完成 */
      core.capture({
        type: 'api',                              /* 事件类型：API 请求 */
        method,                                   /* HTTP 方法 */
        apiUrl: url,                              /* 请求目标 URL（使用 apiUrl 避免与 BaseEvent.url 冲突） */
        status: 0,                                /* 状态码 0 表示网络层错误 */
        duration: Math.round(duration),           /* 请求耗时 */
      });

      /* 将错误继续抛出，不影响业务代码的错误处理 */
      throw err;
    }
  };

  /* 调试模式下输出初始化信息 */
  if (debug) {
    console.log('[OmniSight] API 采集器已初始化（XHR + Fetch 劫持）');
  }

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 恢复原始的 XHR 和 Fetch
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用
   */
  return (): void => {
    /* 恢复 XMLHttpRequest.prototype.open 为原始方法 */
    OriginalXHR.prototype.open = originalOpen;
    /* 恢复 XMLHttpRequest.prototype.send 为原始方法 */
    OriginalXHR.prototype.send = originalSend;
    /* 恢复 window.fetch 为原始方法 */
    window.fetch = originalFetch;
  };
}
