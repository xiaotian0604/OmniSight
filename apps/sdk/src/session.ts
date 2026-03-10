/**
 * @file session.ts
 * @description 会话（Session）管理模块 — 负责生成、持久化和管理用户会话 ID
 *
 * 设计决策：
 * 1. 使用 UUID v4 作为 sessionId，保证全局唯一性
 * 2. 通过 localStorage 持久化 sessionId，使同一用户在刷新页面后仍保持同一会话
 * 3. 引入 30 分钟过期机制：如果用户超过 30 分钟没有活动，视为新会话
 *    - 每次获取 sessionId 时检查时间戳，超过 30 分钟则重新生成
 *    - 这与 Google Analytics 的会话定义一致
 * 4. 所有 localStorage 操作都用 try-catch 包裹，防止以下场景导致 SDK 崩溃：
 *    - 浏览器隐私模式下 localStorage 不可用
 *    - localStorage 存储空间已满
 *    - 第三方安全策略阻止了 localStorage 访问
 * 5. 提供 resetSession() 清理函数，供 SDK 销毁时调用
 */

/* ---------------------------------------------------------------
 * 常量定义
 * --------------------------------------------------------------- */

/** localStorage 中存储 sessionId 的键名 */
const SESSION_KEY = '__omnisight_session_id__';

/** localStorage 中存储会话时间戳的键名（用于过期检测） */
const SESSION_TS_KEY = '__omnisight_session_ts__';

/** 会话过期时间：30 分钟（单位：毫秒） */
const SESSION_EXPIRE_MS = 30 * 60 * 1000;

/* ---------------------------------------------------------------
 * UUID v4 生成函数
 * --------------------------------------------------------------- */

/**
 * 生成符合 RFC 4122 标准的 UUID v4 字符串
 *
 * 实现原理：
 * - 优先使用 crypto.randomUUID()（现代浏览器原生支持，性能最佳且密码学安全）
 * - 降级方案：使用 crypto.getRandomValues() 手动拼接 UUID 格式
 * - 最终降级：使用 Math.random()（不推荐，但保证在任何环境下都能工作）
 *
 * UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - 第 13 位固定为 '4'，表示版本号
 * - 第 17 位为 '8', '9', 'a', 'b' 之一，表示变体
 *
 * @returns {string} 生成的 UUID v4 字符串，例如 "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
 */
function generateUUID(): string {
  /* 优先使用浏览器原生的 crypto.randomUUID() API */
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  /* 降级方案：使用 crypto.getRandomValues() 手动生成 */
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    /* 生成 16 个随机字节 */
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    /* 设置版本号（第 7 字节的高 4 位设为 0100，即版本 4） */
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    /* 设置变体（第 9 字节的高 2 位设为 10，即 RFC 4122 变体） */
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    /* 将字节数组转换为 UUID 格式的十六进制字符串 */
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    /* 按照 UUID 格式插入连字符：8-4-4-4-12 */
    return [
      hex.slice(0, 8),    /* 前 8 个十六进制字符 */
      hex.slice(8, 12),   /* 接下来 4 个 */
      hex.slice(12, 16),  /* 接下来 4 个（包含版本号） */
      hex.slice(16, 20),  /* 接下来 4 个（包含变体） */
      hex.slice(20, 32),  /* 最后 12 个 */
    ].join('-');
  }

  /* 最终降级：使用 Math.random()（非密码学安全，仅作为兜底方案） */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    /* 生成 0-15 的随机整数 */
    const random = (Math.random() * 16) | 0;
    /* x 直接使用随机值，y 需要满足变体约束（高 2 位为 10） */
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    /* 转换为十六进制字符 */
    return value.toString(16);
  });
}

/* ---------------------------------------------------------------
 * 会话管理核心逻辑
 * --------------------------------------------------------------- */

/**
 * 检查当前存储的会话是否已过期
 *
 * 判断逻辑：
 * 1. 从 localStorage 读取上次活动的时间戳
 * 2. 如果时间戳不存在（首次访问），视为已过期，需要创建新会话
 * 3. 如果当前时间与上次活动时间的差值超过 30 分钟，视为已过期
 *
 * @returns {boolean} true 表示会话已过期，需要重新生成 sessionId
 */
function isSessionExpired(): boolean {
  try {
    /* 从 localStorage 读取上次活动的时间戳字符串 */
    const tsStr = localStorage.getItem(SESSION_TS_KEY);

    /* 如果时间戳不存在，说明是首次访问或数据被清除，视为过期 */
    if (!tsStr) {
      return true;
    }

    /* 将时间戳字符串解析为数字 */
    const lastActiveTime = parseInt(tsStr, 10);

    /* 如果解析结果不是有效数字，视为过期 */
    if (isNaN(lastActiveTime)) {
      return true;
    }

    /* 计算距离上次活动的时间差，超过 30 分钟则过期 */
    const elapsed = Date.now() - lastActiveTime;
    return elapsed > SESSION_EXPIRE_MS;
  } catch {
    /* localStorage 访问失败时，保守地视为过期，生成新会话 */
    return true;
  }
}

/**
 * 将 sessionId 和当前时间戳持久化到 localStorage
 *
 * @param {string} sessionId - 要持久化的会话 ID
 */
function persistSession(sessionId: string): void {
  try {
    /* 存储 sessionId */
    localStorage.setItem(SESSION_KEY, sessionId);
    /* 存储当前时间戳，用于后续的过期检测 */
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
  } catch {
    /* localStorage 写入失败时静默忽略
     * 可能的原因：存储空间已满、隐私模式、安全策略限制
     * 此时 sessionId 仍然在内存中有效，只是无法跨页面持久化 */
  }
}

/* ---------------------------------------------------------------
 * 模块级状态
 * --------------------------------------------------------------- */

/**
 * 当前会话 ID 的内存缓存
 * 避免每次调用 getSessionId() 都访问 localStorage，提升性能
 */
let currentSessionId: string | null = null;

/* ---------------------------------------------------------------
 * 导出函数
 * --------------------------------------------------------------- */

/**
 * 获取当前会话的 sessionId
 *
 * 执行流程：
 * 1. 检查内存缓存中是否已有 sessionId
 * 2. 检查会话是否已过期（超过 30 分钟无活动）
 * 3. 如果未过期，从 localStorage 读取已有的 sessionId
 * 4. 如果已过期或不存在，生成新的 UUID v4 作为 sessionId
 * 5. 将 sessionId 和时间戳持久化到 localStorage
 * 6. 更新内存缓存并返回
 *
 * @returns {string} 当前会话的 sessionId（UUID v4 格式）
 */
export function getSessionId(): string {
  /* 如果内存中已有 sessionId 且会话未过期，直接返回（快速路径） */
  if (currentSessionId && !isSessionExpired()) {
    /* 更新时间戳，延长会话有效期（类似"滑动窗口"过期策略） */
    persistSession(currentSessionId);
    return currentSessionId;
  }

  /* 会话已过期或首次调用，需要决定是复用还是重新生成 */
  if (!isSessionExpired()) {
    /* 会话未过期但内存缓存为空（页面刚加载），尝试从 localStorage 恢复 */
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        /* 成功从 localStorage 恢复 sessionId */
        currentSessionId = stored;
        /* 更新时间戳，延长会话有效期 */
        persistSession(currentSessionId);
        return currentSessionId;
      }
    } catch {
      /* localStorage 读取失败，继续执行下方的新建逻辑 */
    }
  }

  /* 会话已过期或无法恢复，生成全新的 sessionId */
  currentSessionId = generateUUID();

  /* 将新的 sessionId 持久化到 localStorage */
  persistSession(currentSessionId);

  /* 返回新生成的 sessionId */
  return currentSessionId;
}

/**
 * 重置当前会话 — 清除内存缓存和 localStorage 中的会话数据
 *
 * 使用场景：
 * 1. SDK 销毁时调用，清理所有会话状态
 * 2. 用户主动登出时，可调用此函数强制开始新会话
 * 3. 测试环境中重置状态
 *
 * 此函数是 session 模块的 cleanup 函数，由 SDK 的 destroy() 方法调用
 */
export function resetSession(): void {
  /* 清除内存中的 sessionId 缓存 */
  currentSessionId = null;

  try {
    /* 从 localStorage 中移除 sessionId */
    localStorage.removeItem(SESSION_KEY);
    /* 从 localStorage 中移除时间戳 */
    localStorage.removeItem(SESSION_TS_KEY);
  } catch {
    /* localStorage 操作失败时静默忽略
     * 即使 localStorage 清理失败，内存缓存已被清除，
     * 下次调用 getSessionId() 时会因为过期检测而生成新的 sessionId */
  }
}
