/**
 * @file transport/batch.ts
 * @description 批量上报器 — 将事件加入队列，定时批量发送到 Gateway
 *
 * 上报策略：
 * 1. 事件先进入内存队列，不立即发送
 * 2. 触发 flush 的条件（满足任一即触发）：
 *    - 队列中累积了 20 条事件（MAX_BATCH_SIZE）
 *    - 距离上次 flush 已过 5 秒（FLUSH_INTERVAL_MS）
 * 3. flush 时优先使用 sendBeacon API：
 *    - sendBeacon 在页面卸载时也能可靠发送数据
 *    - 不会阻塞页面关闭流程
 *    - 如果 sendBeacon 返回 false（数据过大或浏览器拒绝），fallback 到 fetch
 * 4. 页面卸载时（beforeunload）强制 flush 队列中剩余的事件
 *
 * 设计决策：
 * - 批量上报而非逐条上报，原因：
 *   1. 减少 HTTP 请求数量，降低网络开销
 *   2. 减少服务端的请求处理压力
 *   3. 利用批量写入提高数据库写入效率
 * - sendBeacon 优先于 fetch，原因：
 *   1. sendBeacon 是专为数据上报设计的 API
 *   2. 在页面卸载时，fetch 可能被浏览器取消，而 sendBeacon 不会
 *   3. sendBeacon 是异步的，不阻塞页面
 * - beforeunload 事件绑定/解绑在 constructor/destroy 中管理
 */

/* 导入独立的 Beacon API 封装 */
import { sendViaBeacon } from './beacon';
/* 导入 XHR fallback 上报 */
import { sendViaXHR } from './xhr';

/**
 * 批量上报器类
 *
 * 管理事件队列，定时或定量触发批量上报。
 * 优先使用 sendBeacon API，失败时 fallback 到 XHR。
 *
 * @example
 * ```typescript
 * const transport = new BatchTransport('https://gateway.example.com');
 * transport.add({ type: 'error', message: 'Something went wrong' });
 * // 事件会在 5 秒后或累积 20 条时自动发送
 * transport.destroy(); // 强制 flush 并清理资源
 * ```
 */
export class BatchTransport {
  /** 事件队列：存储待发送的事件 */
  private queue: Record<string, unknown>[] = [];

  /** 定时 flush 的定时器引用 */
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** 数据上报的目标 URL（Gateway 的批量上报接口） */
  private endpoint: string;

  /** 批量上报的最大条数：队列中累积到此数量时立即 flush */
  private readonly MAX_BATCH_SIZE = 20;

  /** 定时 flush 的间隔时间（毫秒）：距上次 flush 超过此时间时触发 */
  private readonly FLUSH_INTERVAL_MS = 5000;

  /**
   * beforeunload 事件处理函数的引用
   * 保存引用是为了在 destroy 时能正确移除事件监听器
   * （addEventListener 和 removeEventListener 需要传入相同的函数引用）
   */
  private onBeforeUnload: () => void;

  /**
   * 构造函数
   *
   * @param {string} dsn - 数据上报地址（Gateway 服务的基础 URL）
   */
  constructor(dsn: string) {
    /**
     * 拼接完整的上报接口 URL
     * 移除 dsn 末尾可能存在的斜杠，然后拼接 /v1/ingest/batch 路径
     */
    this.endpoint = `${dsn.replace(/\/$/, '')}/v1/ingest/batch`;

    /**
     * 创建 beforeunload 事件处理函数
     * 页面卸载前强制 flush 队列中剩余的事件
     */
    this.onBeforeUnload = () => {
      this.flush();
    };

    /**
     * 注册 beforeunload 事件监听器
     * 确保页面关闭时不丢失队列中的数据
     */
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  /**
   * 将一个事件添加到上报队列
   *
   * 添加后检查队列大小：
   * - 如果达到 MAX_BATCH_SIZE（20 条），立即 flush
   * - 否则，如果没有正在运行的定时器，启动一个 5 秒的定时器
   *
   * @param {Record<string, unknown>} event - 要上报的事件数据
   */
  public add(event: Record<string, unknown>): void {
    /* 将事件加入队列末尾 */
    this.queue.push(event);

    /**
     * 检查队列是否已满
     * 如果队列中的事件数量达到 MAX_BATCH_SIZE，立即触发 flush
     */
    if (this.queue.length >= this.MAX_BATCH_SIZE) {
      this.flush();
    } else if (!this.timer) {
      /**
       * 如果没有正在运行的定时器，启动一个新的定时 flush
       * 这确保了即使事件产生速度较慢，也会在 5 秒内被发送
       */
      this.timer = setTimeout(() => {
        this.flush();
      }, this.FLUSH_INTERVAL_MS);
    }
  }

  /**
   * 执行批量上报 — 将队列中的所有事件发送到 Gateway
   *
   * 上报流程：
   * 1. 清除定时器（防止重复 flush）
   * 2. 取出队列中的所有事件（使用 splice 清空队列）
   * 3. 将事件序列化为 JSON
   * 4. 优先使用 sendBeacon 发送
   * 5. 如果 sendBeacon 失败（返回 false），fallback 到 XHR
   *
   * 设计决策：
   * - 使用 splice(0) 而非赋值空数组来清空队列，原因：
   *   splice 返回被移除的元素，一步完成"取出 + 清空"操作
   * - flush 是同步方法（sendBeacon 本身是同步的），
   *   确保在 beforeunload 事件中能可靠执行
   */
  private flush(): void {
    /* 如果队列为空，无需 flush */
    if (this.queue.length === 0) {
      return;
    }

    /* 清除定时器，防止重复 flush */
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    /**
     * 取出队列中的所有事件并清空队列
     * splice(0) 移除所有元素并返回它们，队列变为空数组
     */
    const batch = this.queue.splice(0);

    /* 将事件数组序列化为 JSON 字符串 */
    const payload = JSON.stringify(batch);

    /**
     * 优先使用 sendBeacon API 发送数据
     * sendViaBeacon 返回 true 表示发送成功，false 表示发送失败
     */
    const beaconSuccess = sendViaBeacon(this.endpoint, payload);

    /**
     * 如果 sendBeacon 失败，fallback 到 XHR
     *
     * sendBeacon 可能失败的原因：
     * 1. 浏览器不支持 sendBeacon API
     * 2. 数据超过 64KB 限制
     * 3. 浏览器的 sendBeacon 队列已满
     */
    if (!beaconSuccess) {
      sendViaXHR(this.endpoint, payload);
    }
  }

  /**
   * 销毁批量上报器 — 强制 flush 剩余事件并清理资源
   *
   * 执行流程：
   * 1. 强制 flush 队列中剩余的事件（确保不丢失数据）
   * 2. 移除 beforeunload 事件监听器
   * 3. 清除可能存在的定时器
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 调用
   */
  public destroy(): void {
    /* 强制 flush 队列中剩余的事件 */
    this.flush();

    /* 移除 beforeunload 事件监听器 */
    window.removeEventListener('beforeunload', this.onBeforeUnload);

    /* 清除定时器（flush 中已经清除了，这里是双重保险） */
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
