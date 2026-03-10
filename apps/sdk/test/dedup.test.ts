/**
 * @file test/dedup.test.ts
 * @description 错误去重器的单元测试
 *
 * 测试覆盖：
 * 1. 首次出现的指纹不应被判定为重复
 * 2. 短时间内相同指纹应被判定为重复
 * 3. LRU 淘汰机制：超过最大容量时应淘汰最旧的条目
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Deduplicator } from '../src/sampling/dedup';

describe('Deduplicator', () => {
  /**
   * 测试 1：首次出现的指纹不应被判定为重复
   *
   * 第一次调用 isDuplicate 时，缓存中没有该指纹，
   * 应该返回 false（表示不是重复的，应该上报）。
   */
  it('首次出现的指纹应返回 false（不是重复）', () => {
    /* 创建去重器实例 */
    const dedup = new Deduplicator();

    /* 第一次检查：应返回 false */
    expect(dedup.isDuplicate('fingerprint-abc')).toBe(false);

    /* 验证缓存中有一个条目 */
    expect(dedup.size).toBe(1);
  });

  /**
   * 测试 2：短时间内相同指纹应被判定为重复
   *
   * 在 TTL（60 秒）内，相同的指纹再次出现应返回 true。
   * 这防止了同一个错误在短时间内被多次上报。
   */
  it('短时间内相同指纹应返回 true（是重复）', () => {
    /* 创建去重器实例 */
    const dedup = new Deduplicator();

    /* 第一次检查：不是重复 */
    expect(dedup.isDuplicate('fingerprint-xyz')).toBe(false);

    /* 第二次检查（同一指纹）：是重复 */
    expect(dedup.isDuplicate('fingerprint-xyz')).toBe(true);

    /* 第三次检查（同一指纹）：仍然是重复 */
    expect(dedup.isDuplicate('fingerprint-xyz')).toBe(true);

    /* 不同指纹：不是重复 */
    expect(dedup.isDuplicate('fingerprint-different')).toBe(false);
  });

  /**
   * 测试 3：LRU 淘汰机制
   *
   * 当缓存容量达到上限时，应该淘汰最久未使用的条目。
   * 使用容量为 3 的小缓存来验证淘汰行为。
   */
  it('超过最大容量时应淘汰最旧的条目', () => {
    /* 创建一个容量为 3 的去重器 */
    const dedup = new Deduplicator(3, 60_000);

    /* 插入 3 个不同的指纹，填满缓存 */
    expect(dedup.isDuplicate('fp-1')).toBe(false); /* 缓存: [fp-1] */
    expect(dedup.isDuplicate('fp-2')).toBe(false); /* 缓存: [fp-1, fp-2] */
    expect(dedup.isDuplicate('fp-3')).toBe(false); /* 缓存: [fp-1, fp-2, fp-3] */

    /* 验证缓存已满 */
    expect(dedup.size).toBe(3);

    /* 插入第 4 个指纹，应该淘汰最旧的 fp-1 */
    expect(dedup.isDuplicate('fp-4')).toBe(false); /* 缓存: [fp-2, fp-3, fp-4]（fp-1 被淘汰） */

    /* fp-1 已被淘汰，再次检查应返回 false（不是重复） */
    expect(dedup.isDuplicate('fp-1')).toBe(false);

    /* fp-2 现在是最旧的，但仍在缓存中 */
    /* 注意：fp-1 的重新插入淘汰了 fp-2，所以 fp-2 也不在了 */
    /* 当前缓存: [fp-3, fp-4, fp-1] */
    expect(dedup.size).toBe(3);
  });
});
