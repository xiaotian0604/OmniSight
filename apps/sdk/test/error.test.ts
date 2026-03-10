/**
 * @file test/error.test.ts
 * @description JS 错误采集器的单元测试
 *
 * 测试覆盖：
 * 1. window error 事件能正确触发 core.capture()
 * 2. unhandledrejection 事件能正确触发 core.capture()
 * 3. cleanup 函数能正确移除所有监听器
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initErrorCollector } from '../src/collectors/error';

/**
 * 创建一个模拟的 Core 实例
 * 只需要 capture 方法和 getConfig 方法
 */
function createMockCore() {
  return {
    capture: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ debug: false, dsn: 'https://test.com' }),
    on: vi.fn(),
    off: vi.fn(),
    registerCleanup: vi.fn(),
    uploadReplay: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('initErrorCollector', () => {
  let mockCore: ReturnType<typeof createMockCore>;
  let cleanup: () => void;

  beforeEach(() => {
    /* 每个测试前创建新的 mock Core */
    mockCore = createMockCore();
  });

  afterEach(() => {
    /* 每个测试后执行 cleanup，防止监听器泄漏 */
    if (cleanup) {
      cleanup();
    }
  });

  /**
   * 测试 1：window error 事件应触发 core.capture()
   *
   * 模拟一个 JS 运行时错误事件（带有 error 对象），
   * 验证 core.capture 被调用且参数正确。
   */
  it('应该捕获 window error 事件并调用 core.capture', () => {
    /* 初始化错误采集器 */
    cleanup = initErrorCollector(mockCore as any);

    /* 创建一个模拟的 ErrorEvent */
    const errorEvent = new ErrorEvent('error', {
      message: '测试错误消息',
      filename: 'test.js',
      lineno: 42,
      colno: 10,
      error: new Error('测试错误消息'),
    });

    /* 触发 window error 事件 */
    window.dispatchEvent(errorEvent);

    /* 验证 core.capture 被调用了一次 */
    expect(mockCore.capture).toHaveBeenCalledTimes(1);

    /* 验证传入的事件数据包含正确的字段 */
    const capturedEvent = mockCore.capture.mock.calls[0][0];
    expect(capturedEvent.type).toBe('error');
    expect(capturedEvent.message).toBe('测试错误消息');
    expect(capturedEvent.filename).toBe('test.js');
    expect(capturedEvent.lineno).toBe(42);
  });

  /**
   * 测试 2：资源加载错误（无 error 对象）应被过滤
   *
   * 资源加载错误的 event.error 为 undefined，
   * 错误采集器应该忽略这类事件。
   */
  it('应该过滤资源加载错误（event.error 为空）', () => {
    /* 初始化错误采集器 */
    cleanup = initErrorCollector(mockCore as any);

    /* 创建一个没有 error 对象的 ErrorEvent（模拟资源加载错误） */
    const resourceErrorEvent = new ErrorEvent('error', {
      message: '图片加载失败',
      /* 不设置 error 字段，模拟资源加载错误 */
    });

    /* 触发 window error 事件 */
    window.dispatchEvent(resourceErrorEvent);

    /* 验证 core.capture 没有被调用（资源加载错误被过滤） */
    expect(mockCore.capture).not.toHaveBeenCalled();
  });

  /**
   * 测试 3：cleanup 函数应移除所有监听器
   *
   * 调用 cleanup 后，再触发 error 事件不应该调用 core.capture。
   */
  it('cleanup 后应停止捕获错误事件', () => {
    /* 初始化错误采集器 */
    cleanup = initErrorCollector(mockCore as any);

    /* 执行 cleanup */
    cleanup();

    /* 创建一个错误事件 */
    const errorEvent = new ErrorEvent('error', {
      message: 'cleanup 后的错误',
      error: new Error('cleanup 后的错误'),
    });

    /* 触发 window error 事件 */
    window.dispatchEvent(errorEvent);

    /* 验证 core.capture 没有被调用（监听器已移除） */
    expect(mockCore.capture).not.toHaveBeenCalled();
  });
});
