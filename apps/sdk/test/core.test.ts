/**
 * @file test/core.test.ts
 * @description Core 错误防抖补偿逻辑测试
 *
 * 核心目标：
 * 1. 首个错误立即进入批量队列并正常发送
 * 2. 60 秒内重复错误不立即发送，但会累计 occurrences
 * 3. 窗口到期或强制销毁时，会补发 occurrences 恢复真实次数
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { resetSession } from '../src/session';

function createCore() {
  return new Core({
    appId: '10002',
    dsn: 'http://localhost:3000',
    apiKey: 'dev-api-key',
    sampleRate: 1,
  });
}

describe('Core duplicate error aggregation', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    });

    resetSession();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true } as never),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSession();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('应在防抖窗口结束后补发同错的累计 occurrences', () => {
    const core = createCore();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    core.capture({
      type: 'error',
      message: '同一个错误',
      stack: 'Error: 同一个错误\n    at test.js:1:1',
    });
    core.capture({
      type: 'error',
      message: '同一个错误',
      stack: 'Error: 同一个错误\n    at test.js:1:1',
    });
    core.capture({
      type: 'error',
      message: '同一个错误',
      stack: 'Error: 同一个错误\n    at test.js:1:1',
    });

    /* 第一条错误会在批量窗口结束后正常发出 */
    vi.advanceTimersByTime(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstBatch = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0].occurrences).toBe(1);

    /* 防抖窗口结束后，2 次重复错误会以补偿事件的形式发送出去 */
    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const aggregatedBatch = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(aggregatedBatch).toHaveLength(1);
    expect(aggregatedBatch[0].occurrences).toBe(2);
    expect(aggregatedBatch[0].fingerprint).toBe(firstBatch[0].fingerprint);
    expect(aggregatedBatch[0].sessionId).toBe(firstBatch[0].sessionId);

    core.destroy();
  });

  it('应在强制销毁时补发尚未到期的重复错误计数', () => {
    const core = createCore();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    core.capture({
      type: 'error',
      message: '销毁前重复错误',
      stack: 'Error: 销毁前重复错误\n    at test.js:2:1',
    });
    core.capture({
      type: 'error',
      message: '销毁前重复错误',
      stack: 'Error: 销毁前重复错误\n    at test.js:2:1',
    });

    /* 先发出首条错误 */
    vi.advanceTimersByTime(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    /* 还未到 60 秒，destroy 也必须把重复次数补发出去 */
    core.destroy();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const aggregatedBatch = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(aggregatedBatch).toHaveLength(1);
    expect(aggregatedBatch[0].occurrences).toBe(1);
  });
});
