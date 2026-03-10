/**
 * @file transport/beacon.ts
 * @description Beacon API 封装 — 使用 navigator.sendBeacon 发送数据
 *
 * Beacon API 是浏览器提供的专用于数据上报的 API，具有以下优势：
 * 1. 异步发送：不阻塞页面的卸载和导航
 * 2. 可靠性高：即使页面正在关闭，浏览器也会尽力完成发送
 * 3. 低优先级：不会与页面的关键资源请求竞争带宽
 *
 * 限制：
 * 1. 数据大小限制：大多数浏览器限制为 64KB
 *    - Chrome: 64KB
 *    - Firefox: 64KB
 *    - Safari: 64KB
 * 2. 只支持 POST 请求
 * 3. 无法获取响应内容
 * 4. 无法设置自定义请求头（通过 Blob 的 type 属性设置 Content-Type）
 *
 * 设计决策：
 * - 在发送前检查数据大小是否超过 64KB 限制
 * - 使用 Blob 包装数据，设置 Content-Type 为 application/json
 * - 检查 sendBeacon 的返回值（true/false），false 表示发送失败
 * - 如果浏览器不支持 sendBeacon，直接返回 false
 */

/**
 * Beacon API 的数据大小限制（字节）
 * 大多数浏览器限制 sendBeacon 的数据大小为 64KB
 * 超过此限制的数据会被浏览器拒绝（sendBeacon 返回 false）
 */
const BEACON_MAX_SIZE = 64 * 1024;

/**
 * 通过 Beacon API 发送数据
 *
 * 将 JSON 字符串通过 navigator.sendBeacon 发送到指定 URL。
 * 在发送前会检查：
 * 1. 浏览器是否支持 sendBeacon API
 * 2. 数据大小是否超过 64KB 限制
 * 3. sendBeacon 的返回值是否为 true
 *
 * @param {string} url - 数据发送的目标 URL
 * @param {string} payload - 要发送的 JSON 字符串
 * @returns {boolean} true 表示发送成功（浏览器已接受数据），false 表示发送失败
 */
export function sendViaBeacon(url: string, payload: string): boolean {
  /**
   * 检查浏览器是否支持 sendBeacon API
   * 某些旧浏览器（如 IE）不支持此 API
   */
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    /* 浏览器不支持 sendBeacon，返回 false，由调用方使用 fallback */
    return false;
  }

  /**
   * 检查数据大小是否超过 64KB 限制
   *
   * 使用 Blob 来计算实际的字节大小，而非字符串长度。
   * 原因：JSON 中可能包含多字节字符（如中文），
   * 一个中文字符占 3 个 UTF-8 字节，但字符串 length 只算 1。
   *
   * 提前检查可以避免调用 sendBeacon 后才发现数据过大，
   * 提高代码的可预测性。
   */
  const blob = new Blob([payload], { type: 'application/json' });

  /* 如果数据大小超过限制，返回 false */
  if (blob.size > BEACON_MAX_SIZE) {
    return false;
  }

  /**
   * 调用 navigator.sendBeacon 发送数据
   *
   * sendBeacon 的返回值：
   * - true：浏览器已将数据加入发送队列（不保证已发送成功，但会尽力发送）
   * - false：浏览器拒绝了发送请求（可能是队列已满或其他原因）
   *
   * 使用 Blob 而非字符串作为 data 参数，原因：
   * Blob 可以通过 type 属性设置 Content-Type，
   * 而 sendBeacon 不支持自定义请求头
   */
  const success = navigator.sendBeacon(url, blob);

  /* 返回 sendBeacon 的结果 */
  return success;
}
