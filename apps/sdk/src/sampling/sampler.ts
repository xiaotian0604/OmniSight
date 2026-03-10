/**
 * @file sampling/sampler.ts
 * @description 事件采样器 — 决定每个事件是否应该被上报
 *
 * 采样策略：
 * 1. 关键事件 100% 采集（不受采样率影响）：
 *    - error（JS 错误）：错误是最重要的监控数据，必须全量采集
 *    - whitescreen（白屏）：白屏是严重的用户体验问题，必须全量采集
 *    - 慢接口（duration > 3000ms）：慢接口影响用户体验，需要全量采集以便分析
 * 2. 其他事件按采样率采样：
 *    - 基于 sessionId 的哈希值进行采样，而非随机采样
 *    - 这保证了同一用户在同一会话中的所有事件要么全部被采集，要么全部被跳过
 *    - 避免了随机采样导致的数据碎片化（同一用户的部分事件被采集、部分被跳过）
 *
 * 设计决策：
 * - 使用 sessionId 哈希采样而非 Math.random()，原因：
 *   1. 一致性：同一 session 的采样结果始终一致
 *   2. 可预测性：给定 sessionId 和采样率，可以确定性地判断是否采样
 *   3. 用户体验完整性：要么采集该用户的全部行为，要么完全不采集
 * - 哈希算法使用 djb2 变体，简单高效，分布均匀
 */

/**
 * 事件采样器类
 *
 * 根据事件类型和配置的采样率，决定每个事件是否应该被上报。
 * 关键事件（错误、白屏、慢接口）100% 采集，其余按采样率采样。
 *
 * @example
 * ```typescript
 * const sampler = new Sampler(0.1); // 10% 采样率
 * sampler.shouldSample({ type: 'error', sessionId: 'abc' }); // true（错误 100% 采集）
 * sampler.shouldSample({ type: 'api', sessionId: 'abc', duration: 5000 }); // true（慢接口 100% 采集）
 * sampler.shouldSample({ type: 'behavior', sessionId: 'abc' }); // 取决于 sessionId 的哈希值
 * ```
 */
export class Sampler {
  /**
   * 采样率，取值范围 [0, 1]
   * 0 表示不采样（除关键事件外全部跳过）
   * 1 表示全量采集
   * 0.1 表示 10% 的 session 会被采集
   */
  private sampleRate: number;

  /**
   * 慢接口阈值（毫秒）
   * 接口耗时超过此值的请求会被 100% 采集
   * 默认 3000ms（3 秒）
   */
  private slowApiThreshold: number;

  /**
   * 构造函数
   *
   * @param {number} rate - 采样率，取值范围 [0, 1]，默认 0.1（10%）
   * @param {number} slowApiThreshold - 慢接口阈值（毫秒），默认 3000
   */
  constructor(rate: number = 0.1, slowApiThreshold: number = 3000) {
    /* 将采样率限制在 [0, 1] 范围内，防止无效值 */
    this.sampleRate = Math.max(0, Math.min(1, rate));
    /* 保存慢接口阈值 */
    this.slowApiThreshold = slowApiThreshold;
  }

  /**
   * 判断一个事件是否应该被采样（上报）
   *
   * 判断流程：
   * 1. 错误事件 → 100% 采集
   * 2. 白屏事件 → 100% 采集
   * 3. 慢接口事件（duration > 3s）→ 100% 采集
   * 4. 其他事件 → 基于 sessionId 哈希的采样判断
   *
   * @param {Record<string, unknown>} event - 要判断的事件对象
   * @returns {boolean} true 表示应该采集，false 表示应该跳过
   */
  public shouldSample(event: Record<string, unknown>): boolean {
    /* 获取事件类型 */
    const type = event.type as string;

    /**
     * 规则 1：错误事件 100% 采集
     * 错误是监控系统最核心的数据，不能遗漏任何一个
     */
    if (type === 'error') {
      return true;
    }

    /**
     * 规则 2：白屏事件 100% 采集
     * 白屏是最严重的用户体验问题，必须全量捕获
     */
    if (type === 'whitescreen') {
      return true;
    }

    /**
     * 规则 3：慢接口 100% 采集
     * 接口耗时超过 3 秒的请求需要全量采集，以便分析性能瓶颈
     */
    if (type === 'api') {
      const duration = event.duration as number;
      if (typeof duration === 'number' && duration > this.slowApiThreshold) {
        return true;
      }
    }

    /**
     * 规则 4：其他事件基于 sessionId 哈希采样
     * 使用 sessionId 的哈希值与采样率比较，决定是否采集
     */
    const sessionId = (event.sessionId as string) || '';
    return this.hashRate(sessionId) < this.sampleRate;
  }

  /**
   * 将 sessionId 哈希为 [0, 1) 范围内的浮点数
   *
   * 算法：djb2 哈希变体
   * 1. 初始值为 0
   * 2. 对字符串的每个字符：hash = hash * 31 + charCode（使用位运算加速）
   * 3. 取绝对值后对 10000 取模，再除以 10000，得到 [0, 1) 范围的值
   *
   * 设计决策：
   * - 使用 10000 而非 100 作为模数，提高精度（支持 0.01% 级别的采样率）
   * - 使用位运算 (hash << 5) - hash 代替 hash * 31，性能更好
   * - 取绝对值确保结果为正数
   *
   * @param {string} sessionId - 会话 ID 字符串
   * @returns {number} [0, 1) 范围内的哈希值
   */
  private hashRate(sessionId: string): number {
    /* 初始哈希值 */
    let hash = 0;

    /* 遍历字符串的每个字符 */
    for (let i = 0; i < sessionId.length; i++) {
      /**
       * djb2 哈希计算：hash = hash * 31 + charCode
       * (hash << 5) - hash 等价于 hash * 32 - hash = hash * 31
       * 使用位运算比乘法更快
       * | 0 将结果截断为 32 位整数，防止数值溢出
       */
      hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
    }

    /**
     * 将哈希值转换为 [0, 1) 范围的浮点数
     * 1. Math.abs() 取绝对值，确保为正数
     * 2. % 10000 取模，得到 [0, 9999] 范围的整数
     * 3. / 10000 转换为 [0, 0.9999] 范围的浮点数
     */
    return (Math.abs(hash) % 10000) / 10000;
  }
}
