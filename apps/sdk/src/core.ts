/**
 * @file core.ts
 * @description SDK 核心调度器 — 负责配置管理、事件捕获分发、生命周期管理
 *
 * Core 是整个 SDK 的中枢，所有采集器（collectors）通过 Core 提交事件，
 * Core 负责：
 * 1. 合并用户配置与默认配置，生成最终的 ResolvedConfig
 * 2. 提供 capture() 方法供采集器提交事件
 * 3. 在 capture 流程中依次执行：采样判断 → 去重检查 → 指纹生成 → 批量上报
 * 4. 提供事件回调机制（on/off），供 replay 模块监听错误事件
 * 5. 提供 uploadReplay() 方法，由 replay 模块注入具体实现
 * 6. 提供 destroy() 方法，统一销毁所有资源
 *
 * 设计决策：
 * - Core 采用类而非纯函数，因为需要维护内部状态（配置、回调列表、cleanup 函数列表）
 * - 配置合并使用"先展开 config 再用 ?? 填默认值"的策略，确保用户传入的 falsy 值（如 sampleRate: 0）不会被默认值覆盖
 * - 错误指纹（fingerprint）使用 message + stack 第一帧生成，在聚合时能有效合并同一来源的错误
 */

/* 导入会话管理模块 */
import { getSessionId } from './session';
/* 导入采样器 */
import { Sampler } from './sampling/sampler';
/* 导入去重器 */
import { Deduplicator } from './sampling/dedup';
/* 导入批量上报模块 */
import { BatchTransport } from './transport/batch';

/* ---------------------------------------------------------------
 * 类型定义
 * --------------------------------------------------------------- */

/**
 * 隐私配置接口
 * 控制 rrweb 录制时的隐私脱敏行为
 */
export interface PrivacyConfig {
  /** 是否遮盖所有输入框内容（密码框始终遮盖） */
  maskInputs?: boolean;
  /** 需要完全屏蔽录制的 CSS 选择器列表（如支付表单、身份证输入区域） */
  blockSelectors?: string[];
}

/**
 * SDK 初始化配置接口
 * 用户调用 init() 时传入的配置对象
 */
export interface OmniSightConfig {
  /** 应用唯一标识符，用于在后端区分不同接入方 */
  appId: string;
  /** 数据上报地址（Data Source Name），指向 Gateway 服务 */
  dsn: string;
  /** 正常事件的采样率，取值范围 [0, 1]，默认 0.1（10%） */
  sampleRate?: number;
  /** 是否启用 rrweb 用户操作录制，默认 false */
  enableReplay?: boolean;
  /** 隐私脱敏配置 */
  privacy?: PrivacyConfig;
  /** 是否开启调试模式（输出详细日志到 console），默认 false */
  debug?: boolean;
}

/**
 * 解析后的完整配置接口
 * 合并用户配置和默认值后的最终配置，所有字段都有确定的值
 */
export interface ResolvedConfig {
  /** 应用唯一标识符 */
  appId: string;
  /** 数据上报地址 */
  dsn: string;
  /** 正常事件的采样率（已确定值） */
  sampleRate: number;
  /** 是否启用 rrweb 录制（已确定值） */
  enableReplay: boolean;
  /** 隐私脱敏配置（已确定值） */
  privacy: PrivacyConfig;
  /** 是否开启调试模式（已确定值） */
  debug: boolean;
}

/**
 * 事件数据接口
 * 采集器提交给 Core 的原始事件数据结构
 * 使用 Record<string, unknown> 允许不同类型的事件携带不同的字段
 */
export interface EventData extends Record<string, unknown> {
  /** 事件类型：error / api / vital / resource / behavior / whitescreen */
  type: string;
}

/**
 * 事件回调函数类型
 * 用于 on() 注册的监听器，当特定类型的事件被捕获时触发
 *
 * @param {EventData} event - 被捕获的事件数据
 */
export type EventCallback = (event: EventData) => void;

/* ---------------------------------------------------------------
 * 错误指纹生成函数
 * --------------------------------------------------------------- */

/**
 * 生成错误事件的唯一指纹（fingerprint）
 *
 * 指纹用于在客户端和服务端对相同来源的错误进行聚合去重。
 * 生成策略：取错误消息（message）+ 堆栈的第一帧（stack 的第二行）进行拼接，
 * 然后通过简单的哈希算法生成固定长度的字符串。
 *
 * 设计决策：
 * - 只取 stack 的第一帧而非全部，因为同一个错误在不同调用链中 stack 可能不同，
 *   但第一帧（错误发生的位置）通常是相同的
 * - 使用 btoa 编码 + 截断而非完整哈希，因为指纹不需要密码学安全性，
 *   只需要在合理范围内唯一即可
 *
 * @param {string} message - 错误消息文本
 * @param {string} [stack] - 错误堆栈字符串（可选）
 * @returns {string} 生成的指纹字符串（32 字符长度）
 */
export function getErrorFingerprint(message: string, stack?: string): string {
  /* 从堆栈中提取第一帧（第二行，因为第一行通常是错误消息本身） */
  const firstFrame = stack?.split('\n')[1]?.trim() || '';

  /* 拼接 message 和第一帧作为指纹原始数据 */
  const raw = `${message}|${firstFrame}`;

  /**
   * 使用简单的字符串哈希算法（djb2 变体）生成数字哈希
   * 然后转换为 base36 字符串并截取固定长度
   *
   * 为什么不用 btoa：btoa 对非 ASCII 字符会抛出异常，
   * 而错误消息中可能包含中文等非 ASCII 字符
   */
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    /* djb2 哈希算法：hash * 33 + charCode */
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }

  /* 将哈希值转换为正数，再转为 base36 字符串，截取前 16 位 */
  const hashStr = Math.abs(hash).toString(36);

  /* 为了增加指纹的唯一性，再对原始字符串做一次不同种子的哈希 */
  let hash2 = 0;
  for (let i = 0; i < raw.length; i++) {
    hash2 = ((hash2 << 7) - hash2 + raw.charCodeAt(i)) | 0;
  }
  const hashStr2 = Math.abs(hash2).toString(36);

  /* 拼接两个哈希值，截取前 32 个字符作为最终指纹 */
  return (hashStr + hashStr2).padEnd(32, '0').slice(0, 32);
}

/* ---------------------------------------------------------------
 * Core 类
 * --------------------------------------------------------------- */

/**
 * SDK 核心调度器类
 *
 * 职责：
 * 1. 管理 SDK 配置（合并默认值）
 * 2. 接收采集器提交的事件，执行采样、去重、指纹生成后批量上报
 * 3. 管理事件回调（on/off），供 replay 等模块监听特定事件
 * 4. 管理 cleanup 函数列表，在 destroy() 时统一清理资源
 * 5. 提供 uploadReplay 钩子，由 replay 模块注入具体实现
 *
 * 使用方式：
 * ```typescript
 * const core = new Core({ appId: 'my-app', dsn: 'https://gateway.example.com' });
 * core.capture({ type: 'error', message: 'Something went wrong' });
 * core.on('error', (event) => { console.log('Error captured:', event); });
 * core.destroy();
 * ```
 */
export class Core {
  /** 解析后的完整配置（合并了默认值） */
  private config: ResolvedConfig;

  /** 匿名化后的用户 ID（SHA-256 哈希），由 setUserId 异步设置 */
  private userId: string | undefined;

  /** 事件回调注册表：key 为事件类型，value 为该类型的回调函数数组 */
  private callbacks: Map<string, EventCallback[]> = new Map();

  /** cleanup 函数列表：SDK 销毁时需要执行的清理函数 */
  private cleanups: Array<() => void> = [];

  /** 采样器实例：决定事件是否应该被上报 */
  private sampler: Sampler;

  /** 去重器实例：过滤短时间内重复的错误事件 */
  private deduplicator: Deduplicator;

  /** 批量上报器实例：将事件加入队列，定时批量发送 */
  private transport: BatchTransport;

  /**
   * uploadReplay 方法的具体实现
   * 初始为空函数，由 replay 模块在初始化时注入真正的实现
   *
   * 设计决策：使用注入模式而非直接依赖 replay 模块，
   * 这样当用户不启用 replay 功能时，相关代码不会被加载（支持 tree-shaking）
   */
  public uploadReplay: (events: unknown[]) => void = () => {};

  /**
   * 构造函数 — 初始化 Core 实例
   *
   * 配置合并策略：
   * 1. 先用展开运算符（...config）复制用户传入的所有配置
   * 2. 对每个可选字段使用 ?? 运算符填充默认值
   * 3. 使用 ?? 而非 || 的原因：?? 只在值为 null/undefined 时使用默认值，
   *    而 || 会在值为 0、false、'' 等 falsy 值时也使用默认值
   *    例如用户传入 sampleRate: 0 时，?? 会保留 0，而 || 会错误地使用默认值 0.1
   *
   * @param {OmniSightConfig} config - 用户传入的 SDK 配置
   */
  constructor(config: OmniSightConfig) {
    /* 合并用户配置与默认值，生成最终的 ResolvedConfig */
    this.config = {
      /* 必填字段直接使用用户传入的值 */
      appId: config.appId,
      dsn: config.dsn,
      /* 可选字段使用 ?? 运算符填充默认值 */
      sampleRate: config.sampleRate ?? 0.1,         /* 默认 10% 采样率 */
      enableReplay: config.enableReplay ?? false,    /* 默认不启用录制 */
      privacy: config.privacy ?? {},                 /* 默认空对象，不做额外脱敏 */
      debug: config.debug ?? false,                  /* 默认不开启调试模式 */
    };

    /* 初始化采样器，传入配置的采样率 */
    this.sampler = new Sampler(this.config.sampleRate);

    /* 初始化去重器，使用默认参数（容量 100，TTL 60 秒） */
    this.deduplicator = new Deduplicator();

    /* 初始化批量上报器，传入上报地址 */
    this.transport = new BatchTransport(this.config.dsn);

    /* 调试模式下输出初始化信息 */
    if (this.config.debug) {
      console.log('[OmniSight] SDK 初始化完成，配置:', this.config);
    }
  }

  /**
   * 获取当前的完整配置
   * 供其他模块（如 replay、privacy）读取配置信息
   *
   * @returns {ResolvedConfig} 当前的完整配置对象（只读引用）
   */
  public getConfig(): ResolvedConfig {
    return this.config;
  }

  /**
   * 设置匿名化后的用户 ID
   * 由 index.ts 中 anonymizeUserId 异步完成后调用
   * 设置后，后续所有事件都会携带此 userId 字段
   *
   * @param {string} hashedId - SHA-256 哈希后的用户 ID
   */
  public setUserId(hashedId: string): void {
    this.userId = hashedId;
  }

  /**
   * 捕获并处理一个事件
   *
   * 这是 SDK 的核心数据流方法，所有采集器都通过此方法提交事件。
   * 处理流程：
   * 1. 为事件补充公共字段（appId、sessionId、时间戳、URL、UA、SDK 版本）
   * 2. 如果是错误事件，生成指纹并进行去重检查
   * 3. 执行采样判断（错误/白屏/慢接口 100% 采集，其余按采样率）
   * 4. 触发该事件类型的回调函数（如通知 replay 模块有错误发生）
   * 5. 将事件加入批量上报队列
   *
   * @param {EventData} event - 采集器提交的原始事件数据
   */
  public capture(event: EventData): void {
    /* 为事件补充公共字段 */
    const enrichedEvent: Record<string, unknown> = {
      ...event,
      appId: this.config.appId,                    /* 应用标识符 */
      sessionId: getSessionId(),                   /* 当前会话 ID */
      ts: Date.now(),                              /* 客户端时间戳（毫秒） */
      url: typeof location !== 'undefined' ? location.href : '', /* 当前页面 URL */
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', /* User-Agent */
      sdkVersion: '0.0.1',                        /* SDK 版本号 */
      /* 如果已设置匿名化 userId，附加到事件中 */
      ...(this.userId ? { userId: this.userId } : {}),
    };

    /* 如果是错误类型事件，生成指纹并进行去重检查 */
    if (event.type === 'error') {
      /* 生成错误指纹 */
      const fingerprint = getErrorFingerprint(
        (event.message as string) || '',
        (event.stack as string) || undefined,
      );
      /* 将指纹附加到事件数据中 */
      enrichedEvent.fingerprint = fingerprint;

      /* 去重检查：如果是短时间内的重复错误，跳过上报 */
      if (this.deduplicator.isDuplicate(fingerprint)) {
        /* 调试模式下输出跳过信息 */
        if (this.config.debug) {
          console.log('[OmniSight] 重复错误已跳过:', event.message);
        }
        return;
      }
    }

    /* 采样判断：决定该事件是否应该被上报 */
    if (!this.sampler.shouldSample(enrichedEvent)) {
      /* 调试模式下输出采样跳过信息 */
      if (this.config.debug) {
        console.log('[OmniSight] 事件被采样过滤:', event.type);
      }
      return;
    }

    /* 触发该事件类型的所有回调函数 */
    this.emit(event.type, <EventData>enrichedEvent);

    /* 将事件加入批量上报队列 */
    this.transport.add(enrichedEvent);

    /* 调试模式下输出事件捕获信息 */
    if (this.config.debug) {
      console.log('[OmniSight] 事件已捕获:', event.type, enrichedEvent);
    }
  }

  /**
   * 注册事件回调函数
   *
   * 当指定类型的事件被 capture() 捕获时，会触发对应的回调函数。
   * 主要使用场景：replay 模块监听 'error' 事件，在错误发生时触发录像上传。
   *
   * @param {string} eventType - 要监听的事件类型（如 'error'、'api'）
   * @param {EventCallback} callback - 事件触发时执行的回调函数
   */
  public on(eventType: string, callback: EventCallback): void {
    /* 获取该事件类型的回调列表，如果不存在则创建空数组 */
    const list = this.callbacks.get(eventType) || [];
    /* 将新的回调函数添加到列表末尾 */
    list.push(callback);
    /* 更新回调注册表 */
    this.callbacks.set(eventType, list);
  }

  /**
   * 注销事件回调函数
   *
   * @param {string} eventType - 要取消监听的事件类型
   * @param {EventCallback} callback - 要移除的回调函数引用
   */
  public off(eventType: string, callback: EventCallback): void {
    /* 获取该事件类型的回调列表 */
    const list = this.callbacks.get(eventType);
    /* 如果列表不存在，直接返回 */
    if (!list) return;
    /* 过滤掉目标回调函数，保留其他回调 */
    this.callbacks.set(
      eventType,
      list.filter((cb) => cb !== callback),
    );
  }

  /**
   * 触发指定事件类型的所有回调函数（内部方法）
   *
   * @param {string} eventType - 事件类型
   * @param {EventData} event - 要传递给回调函数的事件数据
   */
  private emit(eventType: string, event: EventData): void {
    /* 获取该事件类型的回调列表 */
    const list = this.callbacks.get(eventType);
    /* 如果没有注册任何回调，直接返回 */
    if (!list) return;
    /* 依次执行所有回调函数，每个回调用 try-catch 包裹防止互相影响 */
    for (const cb of list) {
      try {
        cb(event);
      } catch (err) {
        /* 回调执行出错时，仅在调试模式下输出警告，不影响其他回调的执行 */
        if (this.config.debug) {
          console.warn('[OmniSight] 事件回调执行出错:', err);
        }
      }
    }
  }

  /**
   * 注册 cleanup 函数
   *
   * 各采集器在初始化时会返回 cleanup 函数，通过此方法注册到 Core 中，
   * 在 SDK 销毁时统一调用。
   *
   * @param {() => void} fn - 清理函数
   */
  public registerCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /**
   * 销毁 SDK — 释放所有资源、移除所有事件监听器
   *
   * 执行流程：
   * 1. 执行所有注册的 cleanup 函数（移除 DOM 事件监听、断开 Observer 等）
   * 2. 清空回调注册表
   * 3. 销毁批量上报器（强制 flush 剩余事件）
   *
   * 调用时机：
   * - 单页应用卸载时
   * - 用户主动调用 OmniSight.destroy()
   * - 热更新（HMR）时重新初始化前
   */
  public destroy(): void {
    /* 调试模式下输出销毁信息 */
    if (this.config.debug) {
      console.log('[OmniSight] SDK 正在销毁...');
    }

    /* 依次执行所有 cleanup 函数 */
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        /* cleanup 执行出错时静默处理，确保其他 cleanup 能继续执行 */
        if (this.config.debug) {
          console.warn('[OmniSight] cleanup 执行出错:', err);
        }
      }
    }

    /* 清空 cleanup 列表 */
    this.cleanups = [];

    /* 清空所有事件回调 */
    this.callbacks.clear();

    /* 销毁批量上报器（会强制 flush 队列中剩余的事件） */
    this.transport.destroy();

    /* 调试模式下输出销毁完成信息 */
    if (this.config.debug) {
      console.log('[OmniSight] SDK 已销毁');
    }
  }
}
