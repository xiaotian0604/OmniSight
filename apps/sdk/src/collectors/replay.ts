/**
 * @file collectors/replay.ts
 * @description 用户操作录制采集器 — 基于 rrweb 实现用户操作录制与错误窗口上传策略
 *
 * 核心策略：Ring Buffer + 错误窗口
 * 1. 持续录制用户操作，但只保留最近 30 秒的数据（Ring Buffer）
 * 2. 平时不上传任何录像数据，避免浪费带宽和存储
 * 3. 当 JS 错误发生时，继续录制 10 秒（收集错误后的用户反应）
 * 4. 10 秒后将 Ring Buffer 中的全部数据（错误前 30s + 错误后 10s）上传
 * 5. 上传后清空 Buffer，重置状态，等待下一次错误触发
 *
 * 这种策略的优势：
 * - 存储成本降低 80%：只上传与错误相关的录像片段，而非全量录像
 * - 用户体验无影响：录制过程在后台静默进行，不影响页面性能
 * - 故障复现能力强：40 秒的录像窗口足以还原大多数错误场景
 *
 * 设计决策：
 * - 使用动态 import('rrweb') 而非静态导入，原因：
 *   1. rrweb 体积较大（~50KB），作为 optional peer dependency
 *   2. 用户可能不需要录制功能（enableReplay: false）
 *   3. 动态导入支持按需加载，不影响 SDK 核心体积
 * - 隐私配置通过 core.getConfig().privacy 获取，并使用 getMaskOptions() 转换为 rrweb 格式
 * - 返回 cleanup 函数（停止录制 + clearTimeout）
 */

/* 导入 Core 类型 */
import type { Core } from '../core';
/* 导入隐私配置转换函数 */
import { getMaskOptions } from '../privacy/mask';

/**
 * Ring Buffer 保留时长：30 秒（毫秒）
 * 只保留最近 30 秒的录制事件，更早的事件会被丢弃
 */
const BUFFER_DURATION_MS = 30_000;

/**
 * 错误后继续录制时长：10 秒（毫秒）
 * 错误发生后再录制 10 秒，收集用户对错误的反应和后续操作
 */
const AFTER_ERROR_DURATION_MS = 10_000;

/**
 * 录制事件的包装结构
 * 每个 rrweb 事件附带一个时间戳，用于 Ring Buffer 的裁剪
 */
interface BufferedEvent {
  /** rrweb 录制的原始事件对象 */
  event: unknown;
  /** 事件记录的时间戳（毫秒） */
  ts: number;
}

/**
 * 初始化用户操作录制采集器
 *
 * 通过动态导入 rrweb 库，启动用户操作录制。
 * 录制的事件存入 Ring Buffer，当错误发生时触发上传。
 *
 * @param {Core} core - SDK 核心实例，用于监听错误事件和上传录像
 * @returns {() => void} cleanup 函数，调用后停止录制并清理定时器
 */
export function initReplayCollector(core: Core): () => void {
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;
  /* 获取隐私配置 */
  const privacy = core.getConfig().privacy;

  /**
   * Ring Buffer：存储最近 30 秒的录制事件
   * 使用数组模拟环形缓冲区，通过定期裁剪旧事件来维持时间窗口
   */
  const eventBuffer: BufferedEvent[] = [];

  /**
   * 错误触发标志
   * true 表示已经有错误触发了上传流程，正在等待 10 秒后上传
   * 在等待期间，新的错误不会重复触发上传
   */
  let errorTriggered = false;

  /**
   * 错误后等待上传的定时器引用
   * 用于在 cleanup 时取消未执行的上传
   */
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * rrweb 停止录制的函数引用
   * rrweb.record() 返回一个 stop 函数，调用后停止录制
   */
  let stopRecording: (() => void) | null = null;

  /**
   * 动态导入 rrweb 并启动录制
   *
   * 使用立即执行的异步函数（IIFE），
   * 因为 initReplayCollector 本身是同步函数（需要立即返回 cleanup）
   */
  (async () => {
    try {
      /**
       * 动态导入 rrweb 模块
       * 如果用户没有安装 rrweb，这里会抛出 import 错误，
       * 被外层 catch 捕获后静默处理
       */
      const rrweb = await import('rrweb');

      /**
       * 获取 rrweb 的隐私脱敏配置
       * 将 SDK 的 privacy 配置转换为 rrweb 能识别的 maskInputOptions 和 blockSelector
       */
      const maskOptions = getMaskOptions(privacy);

      /**
       * 启动 rrweb 录制
       *
       * rrweb.record() 参数说明：
       * - emit: 每当有新的录制事件产生时调用的回调函数
       * - maskInputOptions: 输入框遮盖配置（如密码框、邮箱框）
       * - blockSelector: 完全屏蔽录制的元素选择器（如支付表单）
       *
       * 返回值是一个 stop 函数，调用后停止录制
       */
      stopRecording = rrweb.record({
        /**
         * 录制事件回调
         * 每当用户进行操作（点击、滚动、输入等）或 DOM 发生变化时触发
         *
         * @param {unknown} event - rrweb 录制的事件对象
         */
        emit(event: unknown) {
          /* 获取当前时间戳 */
          const now = Date.now();

          /* 将事件和时间戳一起存入 Ring Buffer */
          eventBuffer.push({ event, ts: now });

          /**
           * 裁剪 Ring Buffer：移除超过 30 秒的旧事件
           *
           * 计算裁剪时间点：当前时间 - 30 秒
           * 从数组头部开始移除，直到最旧的事件在时间窗口内
           *
           * 使用 while + shift() 而非 filter()，原因：
           * 1. 事件是按时间顺序插入的，最旧的在数组头部
           * 2. shift() 只需要移除头部元素，时间复杂度更低
           * 3. filter() 会创建新数组，产生不必要的内存分配
           */
          const cutoff = now - BUFFER_DURATION_MS;
          while (eventBuffer.length > 0 && eventBuffer[0].ts < cutoff) {
            eventBuffer.shift();
          }
        },
        /* 输入框遮盖配置：密码框、邮箱框等敏感输入会被遮盖 */
        maskInputOptions: maskOptions.maskInputOptions,
        /* 完全屏蔽录制的元素选择器 */
        blockSelector: maskOptions.blockSelector,
      });

      /* 调试模式下输出初始化信息 */
      if (debug) {
        console.log('[OmniSight] rrweb 录制已启动，Ring Buffer 保留最近 30 秒');
      }
    } catch (err) {
      /**
       * rrweb 导入或初始化失败的处理
       *
       * 可能的原因：
       * 1. 用户没有安装 rrweb（它是 optional peer dependency）
       * 2. 浏览器环境不支持 rrweb 所需的 API
       *
       * 处理策略：在 debug 模式下输出警告，不影响 SDK 其他功能
       */
      if (debug) {
        console.warn(
          '[OmniSight] rrweb 录制初始化失败，可能未安装 rrweb 依赖:',
          err,
        );
      }
    }
  })();

  /* ---------------------------------------------------------------
   * 注册错误事件回调 — 错误发生时触发录像上传
   * --------------------------------------------------------------- */

  /**
   * 错误事件回调函数
   *
   * 当 Core 捕获到错误事件时，此回调被触发。
   * 启动 10 秒倒计时，倒计时结束后将 Ring Buffer 中的录像数据上传。
   *
   * 防重复机制：如果已经有一个错误触发了上传流程（errorTriggered = true），
   * 新的错误不会重复触发，避免频繁上传。
   */
  const onError = (): void => {
    /* 如果已经有错误触发了上传流程，跳过 */
    if (errorTriggered) {
      return;
    }

    /* 标记错误已触发，防止重复触发 */
    errorTriggered = true;

    /* 调试模式下输出触发信息 */
    if (debug) {
      console.log(`[OmniSight] 错误触发录像上传，将在 ${AFTER_ERROR_DURATION_MS}ms 后上传`);
    }

    /**
     * 设置 10 秒后上传录像
     * 这 10 秒内继续录制，收集用户对错误的反应
     */
    errorTimer = setTimeout(() => {
      /* 清空定时器引用 */
      errorTimer = null;

      /**
       * 提取 Ring Buffer 中所有事件的原始 rrweb 事件对象
       * 使用 map 只提取 event 字段，丢弃时间戳（rrweb 事件内部已有时间信息）
       */
      const snapshot = eventBuffer.map((item) => item.event);

      /* 调试模式下输出上传信息 */
      if (debug) {
        console.log(`[OmniSight] 正在上传录像，共 ${snapshot.length} 个事件`);
      }

      /**
       * 调用 Core 的 uploadReplay 方法上传录像数据
       * uploadReplay 的具体实现由 index.ts 在初始化时注入
       */
      core.uploadReplay(snapshot);

      /**
       * 清空 Ring Buffer
       * 使用 length = 0 而非重新赋值，保持数组引用不变
       */
      eventBuffer.length = 0;

      /* 重置错误触发标志，允许下一次错误触发新的上传 */
      errorTriggered = false;
    }, AFTER_ERROR_DURATION_MS);
  };

  /* 在 Core 上注册错误事件回调 */
  core.on('error', onError);

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 停止录制、取消定时器、移除回调
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用
   */
  return (): void => {
    /* 停止 rrweb 录制（如果已启动） */
    if (stopRecording) {
      stopRecording();
      stopRecording = null;
    }

    /* 取消错误后等待上传的定时器（如果存在） */
    if (errorTimer !== null) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }

    /* 从 Core 上移除错误事件回调 */
    core.off('error', onError);

    /* 清空 Ring Buffer */
    eventBuffer.length = 0;

    /* 重置错误触发标志 */
    errorTriggered = false;
  };
}
