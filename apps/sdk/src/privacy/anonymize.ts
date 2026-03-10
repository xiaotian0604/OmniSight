/**
 * @file privacy/anonymize.ts
 * @description 用户身份匿名化模块 — 使用 SHA-256 单向哈希处理用户 ID
 *
 * 在监控系统中，我们需要关联同一用户的事件（用于统计"影响用户数"等指标），
 * 但不应该存储用户的原始身份信息（如用户名、邮箱、手机号等）。
 *
 * 解决方案：对用户 ID 进行单向哈希处理
 * - 相同的输入始终产生相同的哈希值（可用于关联同一用户的事件）
 * - 无法从哈希值反推出原始用户 ID（保护用户隐私）
 * - 满足 GDPR 等数据合规要求
 *
 * 实现策略：
 * 1. 优先使用 Web Crypto API（SubtleCrypto）的 SHA-256 算法
 *    - 密码学安全，不可逆
 *    - 现代浏览器原生支持，性能优秀
 * 2. 降级方案：使用简单的字符串哈希算法
 *    - 在不支持 SubtleCrypto 的环境中使用（如某些 WebView）
 *    - 非密码学安全，但对于监控场景足够使用
 *
 * 设计决策：
 * - 使用异步函数（async），因为 SubtleCrypto.digest() 返回 Promise
 * - 降级方案使用同步的 djb2 哈希，包裹在 Promise 中保持接口一致
 * - 哈希结果转换为十六进制字符串，便于存储和传输
 */

/**
 * 使用 SHA-256 算法对用户 ID 进行单向哈希
 *
 * 优先使用 Web Crypto API（SubtleCrypto），如果不可用则降级到简单哈希。
 * 返回的哈希值是一个 64 字符的十六进制字符串（SHA-256 产生 256 位 = 32 字节 = 64 个十六进制字符）。
 *
 * @param {string} userId - 用户的原始 ID（如用户名、邮箱、手机号等）
 * @returns {Promise<string>} 哈希后的用户 ID（十六进制字符串）
 *
 * @example
 * ```typescript
 * const hashedId = await anonymizeUserId('user@example.com');
 * // 返回类似: "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"
 * ```
 */
export async function anonymizeUserId(userId: string): Promise<string> {
  /**
   * 检查 Web Crypto API 是否可用
   *
   * SubtleCrypto 在以下环境中可用：
   * - 现代浏览器（Chrome 37+, Firefox 34+, Safari 11+, Edge 12+）
   * - 必须在安全上下文中（HTTPS 或 localhost）
   *
   * 在以下环境中不可用：
   * - HTTP 页面（非 localhost）
   * - 某些 WebView 环境
   * - IE 浏览器
   */
  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.digest === 'function'
  ) {
    try {
      /* 使用 SHA-256 算法进行哈希 */
      return await sha256Hash(userId);
    } catch {
      /**
       * SubtleCrypto 调用失败的处理
       *
       * 可能的原因：
       * 1. 非安全上下文（HTTP 页面）中 SubtleCrypto 被禁用
       * 2. 浏览器的安全策略限制
       *
       * 降级到简单哈希算法
       */
      return simpleFallbackHash(userId);
    }
  }

  /* SubtleCrypto 不可用，使用降级方案 */
  return simpleFallbackHash(userId);
}

/**
 * 使用 Web Crypto API 的 SHA-256 算法进行哈希
 *
 * 处理流程：
 * 1. 将字符串编码为 UTF-8 字节数组（Uint8Array）
 * 2. 调用 crypto.subtle.digest('SHA-256', data) 计算哈希
 * 3. 将哈希结果（ArrayBuffer）转换为十六进制字符串
 *
 * @param {string} input - 要哈希的输入字符串
 * @returns {Promise<string>} SHA-256 哈希值的十六进制表示（64 字符）
 */
async function sha256Hash(input: string): Promise<string> {
  /**
   * 将字符串编码为 UTF-8 字节数组
   * TextEncoder 将 JavaScript 字符串（UTF-16）转换为 UTF-8 编码的 Uint8Array
   */
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  /**
   * 调用 SubtleCrypto.digest() 计算 SHA-256 哈希
   * 返回一个 ArrayBuffer，包含 32 字节（256 位）的哈希值
   */
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  /**
   * 将 ArrayBuffer 转换为十六进制字符串
   *
   * 步骤：
   * 1. 创建 Uint8Array 视图，逐字节访问哈希值
   * 2. 每个字节转换为 2 位十六进制字符（padStart 补零）
   * 3. 拼接所有十六进制字符
   */
  const hashArray = new Uint8Array(hashBuffer);
  const hexString = Array.from(hashArray)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  /* 返回 64 字符的十六进制字符串 */
  return hexString;
}

/**
 * 简单哈希降级方案 — 在 SubtleCrypto 不可用时使用
 *
 * 算法：双重 djb2 哈希 + 十六进制编码
 * 1. 使用两个不同种子的 djb2 哈希算法分别计算哈希值
 * 2. 将两个哈希值拼接，增加唯一性
 * 3. 结果为 16 字符的十六进制字符串
 *
 * 注意：此算法不是密码学安全的，理论上存在碰撞可能。
 * 但在监控场景中，我们只需要"足够唯一"即可，不需要密码学安全性。
 * 此算法仅作为 SubtleCrypto 不可用时的降级方案。
 *
 * @param {string} input - 要哈希的输入字符串
 * @returns {string} 哈希值的十六进制表示（16 字符）
 */
function simpleFallbackHash(input: string): string {
  /**
   * 第一轮哈希：djb2 算法（种子 5381）
   * djb2 是 Daniel J. Bernstein 提出的经典字符串哈希算法
   * 公式：hash = hash * 33 + charCode
   */
  let hash1 = 5381;
  for (let i = 0; i < input.length; i++) {
    /* (hash << 5) + hash 等价于 hash * 33 */
    hash1 = ((hash1 << 5) + hash1 + input.charCodeAt(i)) | 0;
  }

  /**
   * 第二轮哈希：使用不同的种子（52711）和不同的乘数
   * 双重哈希可以显著降低碰撞概率
   */
  let hash2 = 52711;
  for (let i = 0; i < input.length; i++) {
    /* (hash << 7) - hash 等价于 hash * 127 */
    hash2 = ((hash2 << 7) - hash2 + input.charCodeAt(i)) | 0;
  }

  /**
   * 将两个哈希值转换为十六进制字符串并拼接
   * 每个哈希值转为 8 位十六进制（32 位整数 = 8 个十六进制字符）
   * 使用 >>> 0 将有符号整数转为无符号整数，避免负号
   * padStart(8, '0') 确保不足 8 位时补零
   */
  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');

  /* 拼接两个哈希值，返回 16 字符的十六进制字符串 */
  return hex1 + hex2;
}
