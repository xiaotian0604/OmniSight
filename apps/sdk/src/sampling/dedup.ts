/**
 * @file sampling/dedup.ts
 * @description 错误去重器 — 基于 LRU Cache 的错误指纹去重机制
 *
 * 去重目的：
 * 同一个错误可能在短时间内被多次触发（如循环中的错误、频繁调用的函数中的错误），
 * 如果每次都上报，会浪费大量带宽和存储空间，也会干扰错误统计的准确性。
 * 通过错误指纹去重，60 秒内相同的错误只上报一次。
 *
 * LRU (Least Recently Used) 实现：
 * 利用 JavaScript Map 的有序特性（按插入顺序迭代）实现真正的 LRU：
 * - Map 天然按插入顺序排列
 * - 当 get 命中时，先 delete 再 set，将该条目移到最新位置
 * - 当容量超限时，删除 Map 中最旧的条目（迭代器的第一个元素）
 *
 * 设计决策：
 * - 使用 Map 而非普通对象（Object），原因：
 *   1. Map 保证键的插入顺序，Object 不保证（数字键会被排序）
 *   2. Map 的 delete 操作是 O(1)，Object 的 delete 性能不稳定
 *   3. Map 有 size 属性，不需要手动维护计数器
 * - TTL（Time To Live）设为 60 秒：
 *   1. 太短（如 10s）：高频错误仍会产生大量重复上报
 *   2. 太长（如 10min）：可能掩盖错误的复发（用户操作后再次触发同一错误）
 *   3. 60s 是合理的折中，与服务端 Redis 布隆过滤器配合使用
 * - 最大容量设为 100：
 *   1. 内存占用极小（每个条目只有一个字符串 key 和一个数字 value）
 *   2. 100 个不同的错误指纹足以覆盖绝大多数场景
 */

/**
 * 错误去重器类
 *
 * 基于 LRU Cache 实现，使用错误指纹作为 key，记录最后一次出现的时间戳。
 * 如果同一指纹在 TTL 时间内再次出现，判定为重复，跳过上报。
 *
 * @example
 * ```typescript
 * const dedup = new Deduplicator(100, 60000);
 * dedup.isDuplicate('fingerprint-abc'); // false（首次出现）
 * dedup.isDuplicate('fingerprint-abc'); // true（60 秒内重复）
 * // 等待 60 秒后...
 * dedup.isDuplicate('fingerprint-abc'); // false（TTL 过期，视为新错误）
 * ```
 */
export class Deduplicator {
  /**
   * LRU 缓存：Map<指纹字符串, 最后出现时间戳>
   *
   * 利用 Map 的有序特性实现 LRU：
   * - 新插入的条目在 Map 的末尾
   * - 被访问（命中）的条目通过 delete + set 移到末尾
   * - 需要淘汰时，删除 Map 的第一个条目（最久未使用的）
   */
  private cache: Map<string, number> = new Map();

  /**
   * 缓存最大容量
   * 超过此容量时，淘汰最久未使用的条目
   */
  private maxSize: number;

  /**
   * 条目的存活时间（Time To Live），单位：毫秒
   * 超过此时间的条目视为过期，不再参与去重判断
   */
  private ttl: number;

  /**
   * 构造函数
   *
   * @param {number} maxSize - 缓存最大容量，默认 100
   * @param {number} ttl - 条目存活时间（毫秒），默认 60000（60 秒）
   */
  constructor(maxSize: number = 100, ttl: number = 60_000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 判断一个错误指纹是否是重复的
   *
   * 判断流程：
   * 1. 在缓存中查找该指纹
   * 2. 如果找到且未过期（距上次出现不超过 TTL）→ 判定为重复
   *    - 同时更新时间戳并移到 LRU 最新位置（delete + set）
   * 3. 如果未找到或已过期 → 判定为新错误
   *    - 检查容量，超限则淘汰最旧条目
   *    - 将新指纹插入缓存
   *
   * @param {string} fingerprint - 错误指纹字符串（由 getErrorFingerprint 生成）
   * @returns {boolean} true 表示是重复错误（应跳过上报），false 表示是新错误（应上报）
   */
  public isDuplicate(fingerprint: string): boolean {
    /* 获取当前时间戳 */
    const now = Date.now();

    /* 尝试从缓存中获取该指纹的上次出现时间 */
    const lastSeen = this.cache.get(fingerprint);

    /**
     * 检查是否命中缓存且未过期
     * lastSeen !== undefined：缓存中存在该指纹
     * now - lastSeen < this.ttl：距上次出现未超过 TTL
     */
    if (lastSeen !== undefined && now - lastSeen < this.ttl) {
      /**
       * 命中缓存且未过期 → 判定为重复
       *
       * 真正的 LRU 操作：先 delete 再 set，将该条目移到 Map 的最新位置
       * 这确保了最近被访问的条目不会被优先淘汰
       *
       * 为什么要 delete 再 set 而不是直接 set？
       * 因为 Map.set() 对已存在的 key 只会更新 value，不会改变其在迭代顺序中的位置。
       * 只有 delete 后重新 set，才能将条目移到 Map 的末尾（最新位置）。
       */
      this.cache.delete(fingerprint);
      this.cache.set(fingerprint, now);

      /* 返回 true，表示是重复错误 */
      return true;
    }

    /**
     * 未命中缓存或已过期 → 判定为新错误
     *
     * 如果之前有过期的条目，先删除它（释放空间）
     */
    if (lastSeen !== undefined) {
      this.cache.delete(fingerprint);
    }

    /**
     * 检查缓存容量是否已满
     * 如果已满，淘汰最旧的条目（Map 迭代器的第一个元素）
     */
    if (this.cache.size >= this.maxSize) {
      /**
       * 获取 Map 中最旧的 key（迭代器的第一个元素）
       * Map 按插入顺序迭代，第一个元素就是最早插入（且最久未被访问）的
       */
      const oldestKey = this.cache.keys().next().value;
      /* 如果获取到了最旧的 key，删除它 */
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    /**
     * 将新指纹插入缓存
     * 新插入的条目自动位于 Map 的末尾（最新位置）
     */
    this.cache.set(fingerprint, now);

    /* 返回 false，表示是新错误（应该上报） */
    return false;
  }

  /**
   * 清空去重缓存
   *
   * 使用场景：
   * 1. SDK 销毁时清理资源
   * 2. 测试环境中重置状态
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * 获取当前缓存中的条目数量
   *
   * 主要用于调试和测试
   *
   * @returns {number} 当前缓存中的条目数量
   */
  public get size(): number {
    return this.cache.size;
  }
}
