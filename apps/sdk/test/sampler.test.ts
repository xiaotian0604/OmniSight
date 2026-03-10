/**
 * @file test/sampler.test.ts
 * @description 事件采样器的单元测试
 *
 * 测试覆盖：
 * 1. 错误事件始终被采集（100% 采样）
 * 2. 白屏事件始终被采集（100% 采样）
 * 3. 慢接口（duration > 3s）始终被采集
 * 4. 普通事件根据 sessionId 哈希和采样率决定是否采集
 */

import { describe, it, expect } from 'vitest';
import { Sampler } from '../src/sampling/sampler';

describe('Sampler', () => {
  /**
   * 测试 1：错误事件应始终被采集
   *
   * 无论采样率设置为多少（即使是 0），错误事件都应该返回 true。
   * 这是监控系统的核心原则：错误数据不能丢失。
   */
  it('错误事件应始终返回 true（100% 采集）', () => {
    /* 创建一个采样率为 0 的采样器（正常事件全部跳过） */
    const sampler = new Sampler(0);

    /* 构造一个错误事件 */
    const errorEvent = {
      type: 'error',
      sessionId: 'test-session-123',
      message: '测试错误',
    };

    /* 验证错误事件始终被采集 */
    expect(sampler.shouldSample(errorEvent)).toBe(true);
  });

  /**
   * 测试 2：白屏事件应始终被采集
   *
   * 白屏是最严重的用户体验问题，必须 100% 捕获。
   */
  it('白屏事件应始终返回 true（100% 采集）', () => {
    /* 创建一个采样率为 0 的采样器 */
    const sampler = new Sampler(0);

    /* 构造一个白屏事件 */
    const whitescreenEvent = {
      type: 'whitescreen',
      sessionId: 'test-session-456',
    };

    /* 验证白屏事件始终被采集 */
    expect(sampler.shouldSample(whitescreenEvent)).toBe(true);
  });

  /**
   * 测试 3：慢接口应始终被采集
   *
   * 接口耗时超过 3 秒的请求需要 100% 采集，以便分析性能瓶颈。
   */
  it('慢接口（duration > 3s）应始终返回 true', () => {
    /* 创建一个采样率为 0 的采样器 */
    const sampler = new Sampler(0);

    /* 构造一个慢接口事件（耗时 5 秒） */
    const slowApiEvent = {
      type: 'api',
      sessionId: 'test-session-789',
      duration: 5000,
      url: '/api/slow-endpoint',
    };

    /* 验证慢接口事件始终被采集 */
    expect(sampler.shouldSample(slowApiEvent)).toBe(true);

    /* 构造一个正常速度的接口事件（耗时 200ms） */
    const normalApiEvent = {
      type: 'api',
      sessionId: 'test-session-789',
      duration: 200,
      url: '/api/fast-endpoint',
    };

    /* 正常速度的接口事件受采样率控制（采样率为 0，应被跳过） */
    /* 注意：这取决于 sessionId 的哈希值，但采样率为 0 时应该总是 false */
    expect(sampler.shouldSample(normalApiEvent)).toBe(false);
  });
});
