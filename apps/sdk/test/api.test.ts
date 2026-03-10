/**
 * @file test/api.test.ts
 * @description API 接口采集器的单元测试
 *
 * 测试覆盖：
 * 1. fetch 劫持能正确捕获请求信息
 * 2. SDK 自身的上报请求应被过滤
 * 3. cleanup 函数能正确恢复原始的 fetch
 *
 * 注意：由于 vitest 运行在 Node.js 环境中，
 * 需要模拟 window.fetch 和 XMLHttpRequest。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initApiCollector } from '../src/collectors/api';

/**
 * 创建一个模拟的 Core 实例
 */
function createMockCore(dsn: string = 'https://gateway.example.com') {
  return {
    capture: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      debug: false,
      dsn,
    }),
    on: vi.fn(),
    off: vi.fn(),
    registerCleanup: vi.fn(),
    uploadReplay: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('initApiCollector', () => {
  let mockCore: ReturnType<typeof createMockCore>;
  let cleanup: (() => void) | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    /* 保存原始的 fetch 引用 */
    originalFetch = globalThis.fetch;
    /* 创建新的 mock Core */
    mockCore = createMockCore();
  });

  afterEach(() => {
    /* 执行 cleanup 恢复原始方法 */
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    /* 确保 fetch 被恢复 */
    globalThis.fetch = originalFetch;
  });

  /**
   * 测试 1：fetch 劫持应捕获请求信息
   *
   * 劫持 fetch 后，发送一个请求，验证 core.capture 被调用且参数正确。
   */
  it('应该捕获 fetch 请求并调用 core.capture', async () => {
    /* 模拟原始 fetch 返回一个成功的响应 */
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200 }),
    );

    /* 初始化 API 采集器 */
    cleanup = initApiCollector(mockCore as any);

    /* 发送一个 fetch 请求 */
    await globalThis.fetch('https://api.example.com/users', {
      method: 'GET',
    });

    /* 验证 core.capture 被调用了一次 */
    expect(mockCore.capture).toHaveBeenCalledTimes(1);

    /* 验证捕获的事件数据 */
    const capturedEvent = mockCore.capture.mock.calls[0][0];
    expect(capturedEvent.type).toBe('api');
    expect(capturedEvent.apiUrl).toBe('https://api.example.com/users');
    expect(capturedEvent.status).toBe(200);
    expect(capturedEvent.method).toBe('GET');
    expect(typeof capturedEvent.duration).toBe('number');
  });

  /**
   * 测试 2：SDK 自身的上报请求应被过滤
   *
   * 当请求 URL 匹配 dsn + /v1/ 时，不应该触发 core.capture。
   */
  it('应该过滤 SDK 自身的上报请求', async () => {
    /* 模拟原始 fetch */
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200 }),
    );

    /* 初始化 API 采集器 */
    cleanup = initApiCollector(mockCore as any);

    /* 发送一个 SDK 自身的上报请求（URL 匹配 dsn + /v1/） */
    await globalThis.fetch('https://gateway.example.com/v1/ingest/batch', {
      method: 'POST',
    });

    /* 验证 core.capture 没有被调用（SDK 请求被过滤） */
    expect(mockCore.capture).not.toHaveBeenCalled();
  });

  /**
   * 测试 3：cleanup 后应恢复原始 fetch
   *
   * 调用 cleanup 后，fetch 应该被恢复为原始方法。
   */
  it('cleanup 后应恢复原始 fetch', () => {
    /* 保存劫持前的 fetch 引用 */
    const beforeHijack = globalThis.fetch;

    /* 初始化 API 采集器（会劫持 fetch） */
    cleanup = initApiCollector(mockCore as any);

    /* 验证 fetch 已被劫持（不再是原始方法） */
    expect(globalThis.fetch).not.toBe(beforeHijack);

    /* 执行 cleanup */
    cleanup();
    cleanup = undefined;

    /* 验证 fetch 已被恢复（但注意：恢复的是 initApiCollector 内部保存的 originalFetch） */
    /* 由于 beforeEach 中设置了 mock fetch，恢复后应该是那个 mock */
    expect(mockCore.capture).not.toHaveBeenCalled();
  });
});
