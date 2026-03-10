/**
 * @file transport/xhr.ts
 * @description XHR Fallback 上报 — 当 Beacon API 不可用时的降级方案
 *
 * 使用场景：
 * 1. 浏览器不支持 navigator.sendBeacon（如 IE）
 * 2. 数据大小超过 sendBeacon 的 64KB 限制
 * 3. sendBeacon 返回 false（浏览器拒绝发送）
 *
 * 设计决策：
 * - 使用原生 XMLHttpRequest 而非 fetch，原因：
 *   1. 避免触发 SDK 自身的 fetch 劫持（api.ts 中劫持了 window.fetch）
 *   2. XHR 的兼容性更好（支持 IE 10+）
 *   3. XHR 可以设置 sync 模式（虽然不推荐，但在 beforeunload 中可能需要）
 * - 使用异步模式（async: true），不阻塞页面
 * - 不处理响应内容，上报是"发出即忘"（fire-and-forget）模式
 * - 错误处理使用 try-catch，防止 XHR 创建失败影响 SDK 其他功能
 *
 * 注意：此模块直接使用原始的 XMLHttpRequest 构造函数，
 * 不会被 api.ts 中的 XHR 劫持所影响，因为劫持是在 prototype 层面进行的，
 * 而我们这里的请求 URL 包含 dsn + /v1/，会被 isSdkRequest 过滤掉。
 */

/**
 * 通过 XMLHttpRequest 发送数据（Beacon API 的 fallback 方案）
 *
 * 创建一个 XHR POST 请求，将 JSON 数据发送到指定 URL。
 * 这是一个"发出即忘"的操作，不关心响应结果。
 *
 * @param {string} url - 数据发送的目标 URL
 * @param {string} payload - 要发送的 JSON 字符串
 */
export function sendViaXHR(url: string, payload: string): void {
  try {
    /**
     * 创建 XMLHttpRequest 实例
     * 使用浏览器原生的 XMLHttpRequest 构造函数
     */
    const xhr = new XMLHttpRequest();

    /**
     * 打开 HTTP 连接
     * - method: POST（上报数据使用 POST 方法）
     * - url: 目标上报地址
     * - async: true（异步模式，不阻塞页面）
     */
    xhr.open('POST', url, true);

    /**
     * 设置请求头 Content-Type 为 application/json
     * 告知服务端请求体是 JSON 格式
     */
    xhr.setRequestHeader('Content-Type', 'application/json');

    /**
     * 发送请求
     * payload 是已经序列化好的 JSON 字符串
     *
     * 不注册 onload/onerror 回调，因为：
     * 1. 数据上报是"发出即忘"模式，不需要处理响应
     * 2. 即使发送失败，也不需要重试（避免在异常情况下产生更多请求）
     * 3. 减少代码复杂度和内存占用
     */
    xhr.send(payload);
  } catch {
    /**
     * XHR 创建或发送失败时静默忽略
     *
     * 可能的原因：
     * 1. 浏览器安全策略阻止了跨域请求
     * 2. 网络完全断开
     * 3. 浏览器正在关闭，XHR 被中断
     *
     * 处理策略：静默忽略，不影响 SDK 其他功能的正常运行
     * 数据丢失是可接受的，因为监控数据本身就允许一定程度的丢失
     */
  }
}
