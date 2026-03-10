/**
 * ---------------------------------------------------------------
 * @omnisight/shared-types — 事件类型定义
 *
 * 本文件定义了 OmniSight 全链路可观测性系统中所有事件的 TypeScript 类型。
 * 这些类型在 SDK（采集端）、Gateway（接入网关）、Console（可视化控制台）
 * 三个应用之间共享，确保数据结构在整条链路上保持一致。
 *
 * 设计原则：
 *   1. 所有事件继承 BaseEvent，保证公共字段统一
 *   2. 每种事件通过 type 字段做字面量区分（可辨识联合类型）
 *   3. 为避免与浏览器原生 ErrorEvent 命名冲突，
 *      内部使用 OmniErrorEvent，同时通过 export { OmniErrorEvent as ErrorEvent }
 *      提供符合直觉的外部命名
 * ---------------------------------------------------------------
 */

// ========================= 事件类型枚举 =========================

/**
 * EventType — 事件类型的联合类型
 *
 * OmniSight 系统支持的所有事件类型：
 * - 'error'       : JavaScript 运行时错误（同步错误、Promise 未捕获异常、console.error）
 * - 'api'         : 接口请求事件（XHR / Fetch 劫持采集，包含耗时、状态码等）
 * - 'vital'       : Web Vitals 性能指标（LCP / CLS / TTFB / FID / INP）
 * - 'resource'    : 静态资源加载事件（JS / CSS / 图片等，通过 PerformanceObserver 采集）
 * - 'behavior'    : 用户行为事件（点击、路由变化等）
 * - 'whitescreen' : 白屏检测事件（页面渲染异常，DOM 节点数过少等情况）
 */
export type EventType =
  | 'error'
  | 'api'
  | 'vital'
  | 'resource'
  | 'behavior'
  | 'whitescreen';

// ========================= 基础事件接口 =========================

/**
 * BaseEvent — 所有事件的基础接口
 *
 * 每一条上报到 OmniSight 的事件都必须包含以下字段。
 * SDK 在采集时自动填充这些公共信息，Gateway 在入库时进行校验。
 */
export interface BaseEvent {
  /**
   * 事件类型标识
   * 用于区分不同种类的事件，是可辨识联合类型（Discriminated Union）的判别字段。
   * 取值范围见 EventType 联合类型定义。
   */
  type: EventType;

  /**
   * 应用唯一标识
   * 由用户在 OmniSight 控制台创建项目时生成，SDK 初始化时传入。
   * 用于在多项目场景下区分不同应用的数据。
   * 示例: "my-web-app"
   */
  appId: string;

  /**
   * 会话唯一标识
   * 由 SDK 在用户首次访问时生成（UUID v4），存储在 localStorage 中。
   * 同一用户在同一浏览器标签页的连续访问共享同一个 sessionId。
   * 用于关联同一用户会话内的所有事件，支持行为回放和用户旅程分析。
   */
  sessionId: string;

  /**
   * 用户唯一标识（可选）
   * 经过 SHA-256 单向哈希脱敏后的用户 ID，满足隐私合规要求。
   * 如果业务方未传入用户 ID，则此字段为 undefined。
   * 用于统计"影响用户数"等指标。
   */
  userId?: string;

  /**
   * 客户端时间戳（毫秒级）
   * 事件发生时的客户端本地时间，使用 Date.now() 获取。
   * 注意：客户端时间可能不准确，Gateway 可在入库时补充服务端时间作为参考。
   */
  ts: number;

  /**
   * 当前页面 URL
   * 事件发生时浏览器地址栏的完整 URL（含协议、域名、路径、查询参数）。
   * 用于定位问题发生在哪个页面，支持按页面维度聚合分析。
   */
  url: string;

  /**
   * 用户代理字符串（User-Agent）
   * 浏览器的 navigator.userAgent 值。
   * Gateway Worker 会对其进行解析，提取浏览器类型、版本、操作系统等信息。
   */
  ua: string;

  /**
   * SDK 版本号
   * 当前 @omnisight/sdk 的版本，用于排查因 SDK 版本差异导致的数据问题。
   * 格式遵循语义化版本规范（SemVer），如 "0.1.0"。
   */
  sdkVersion: string;
}

// ========================= 错误事件 =========================

/**
 * OmniErrorEvent — JavaScript 错误事件
 *
 * 采集来源：
 *   1. window.addEventListener('error') — 同步运行时错误
 *   2. window.addEventListener('unhandledrejection') — 未捕获的 Promise 异常
 *   3. console.error 劫持 — 业务方主动上报的错误信息
 *
 * 命名说明：
 *   使用 OmniErrorEvent 而非 ErrorEvent，是为了避免与浏览器原生
 *   ErrorEvent（DOM 标准接口）产生命名冲突。
 *   通过 export { OmniErrorEvent as ErrorEvent } 提供外部友好命名。
 */
export interface OmniErrorEvent extends BaseEvent {
  /** 事件类型固定为 'error'，用于类型守卫和可辨识联合 */
  type: 'error';

  /**
   * 错误信息
   * 对应 Error.message 或 console.error 的参数拼接。
   * 示例: "Cannot read properties of undefined (reading 'name')"
   */
  message: string;

  /**
   * 错误堆栈（可选）
   * 对应 Error.stack，包含调用栈信息。
   * 在生产环境中通常是压缩后的代码行列号，
   * 需要配合 SourceMap 还原为可读的源码位置。
   * 对于 console.error 劫持的错误，可能没有堆栈信息。
   */
  stack?: string;

  /**
   * 错误发生的文件名（可选）
   * 对应 ErrorEvent.filename，即触发错误的脚本文件 URL。
   * 示例: "https://example.com/assets/app.a1b2c3.js"
   */
  filename?: string;

  /**
   * 错误发生的行号（可选）
   * 对应 ErrorEvent.lineno，压缩后代码中的行号。
   * 配合 SourceMap 可还原为源码行号。
   */
  lineno?: number;

  /**
   * 错误发生的列号（可选）
   * 对应 ErrorEvent.colno，压缩后代码中的列号。
   * 配合 SourceMap 可还原为源码列号。
   */
  colno?: number;

  /**
   * 错误指纹（用于聚合去重）
   * 由 SDK 根据 message + stack 第一帧计算的哈希值。
   * 算法：btoa(`${message}|${stack第一帧}`).slice(0, 32)
   *
   * 用途：
   *   - 客户端 LRU Cache 去重：60s 内相同指纹的错误不重复上报
   *   - 服务端 Redis 布隆过滤器二次去重
   *   - 控制台按指纹聚合展示错误频次和影响用户数
   */
  fingerprint: string;
}

/**
 * 为外部使用者提供符合直觉的 ErrorEvent 命名
 * 内部使用 OmniErrorEvent 避免与浏览器原生 ErrorEvent 冲突
 */
export { OmniErrorEvent as ErrorEvent };

// ========================= 接口请求事件 =========================

/**
 * ApiEvent — 接口请求事件
 *
 * 采集来源：
 *   1. XMLHttpRequest 劫持 — 通过继承 OriginalXHR 并重写 open/send 方法
 *   2. Fetch API 劫持 — 通过 Proxy 包装 window.fetch
 *
 * 用途：
 *   - 监控接口成功率和耗时分布（P50 / P75 / P99）
 *   - 发现慢接口和异常状态码
 *   - 接口耗时超过 3000ms 的请求会被 100% 采集（不受采样率限制）
 */
export interface ApiEvent extends BaseEvent {
  /** 事件类型固定为 'api'，用于类型守卫和可辨识联合 */
  type: 'api';

  /**
   * HTTP 请求方法
   * 如 'GET'、'POST'、'PUT'、'DELETE' 等。
   * 对于 XHR 劫持，从 open() 方法的参数中获取；
   * 对于 Fetch 劫持，从 init.method 中获取，默认为 'GET'。
   */
  method: string;

  /**
   * 请求目标 URL
   * 接口的完整请求地址。
   * 注意：此字段与 BaseEvent.url（当前页面 URL）不同，
   * BaseEvent.url 是事件发生时的页面地址，apiUrl 是 API 请求的目标地址。
   * 使用不同字段名避免 core.ts enrichment 阶段的字段覆盖冲突。
   */
  apiUrl: string;

  /**
   * HTTP 响应状态码
   * 如 200（成功）、404（未找到）、500（服务器错误）等。
   * 当请求因网络错误失败时（如 CORS、断网），status 为 0。
   */
  status: number;

  /**
   * 请求耗时（毫秒）
   * 从发起请求到收到响应的时间差，使用 performance.now() 计算。
   * 用于统计接口性能分布（P50 / P75 / P99）。
   * 超过 3000ms 的请求会被采样策略标记为 100% 采集。
   */
  duration: number;

  /**
   * 请求体大小（字节，可选）
   * 发送的请求数据大小，用于分析是否存在过大的请求体。
   */
  requestSize?: number;

  /**
   * 响应体大小（字节，可选）
   * 接收的响应数据大小，用于分析是否存在过大的响应。
   */
  responseSize?: number;
}

// ========================= Web Vitals 事件 =========================

/**
 * VitalName — Web Vitals 指标名称的联合类型
 *
 * 对应 Google 定义的核心 Web 指标和补充指标：
 * - 'LCP'  : Largest Contentful Paint — 最大内容绘制时间，衡量加载性能
 * - 'CLS'  : Cumulative Layout Shift — 累积布局偏移，衡量视觉稳定性
 * - 'TTFB' : Time to First Byte — 首字节时间，衡量服务器响应速度
 * - 'FID'  : First Input Delay — 首次输入延迟，衡量交互响应性（已逐步被 INP 替代）
 * - 'INP'  : Interaction to Next Paint — 交互到下一次绘制，衡量整体交互响应性
 */
export type VitalName = 'LCP' | 'CLS' | 'TTFB' | 'FID' | 'INP';

/**
 * VitalRating — Web Vitals 评分等级
 *
 * 基于 Google 的性能评分标准：
 * - 'good'              : 良好 — 指标值在推荐阈值内（如 LCP ≤ 2.5s）
 * - 'needs-improvement' : 需要改进 — 指标值在中等范围（如 2.5s < LCP ≤ 4s）
 * - 'poor'              : 较差 — 指标值超出可接受范围（如 LCP > 4s）
 */
export type VitalRating = 'good' | 'needs-improvement' | 'poor';

/**
 * VitalEvent — Web Vitals 性能指标事件
 *
 * 采集来源：
 *   使用 Google 官方 web-vitals 库（onLCP / onCLS / onTTFB / onFID / onINP）。
 *   这些回调在页面卸载或后台化时触发，保证数据准确性。
 *
 * 用途：
 *   - 控制台性能页面展示各指标的趋势图
 *   - 概览仪表盘的 Vitals 评分卡（好/需改进/差 三态展示）
 *   - 识别 LCP > 2.5s 的慢页面，推动性能优化
 */
export interface VitalEvent extends BaseEvent {
  /** 事件类型固定为 'vital'，用于类型守卫和可辨识联合 */
  type: 'vital';

  /**
   * Web Vitals 指标名称
   * 标识当前事件对应的是哪个性能指标。
   * 取值范围见 VitalName 联合类型定义。
   */
  name: VitalName;

  /**
   * 指标数值
   * 不同指标的单位不同：
   *   - LCP  : 毫秒（ms），如 2500 表示 2.5 秒
   *   - CLS  : 无单位的分数，如 0.1
   *   - TTFB : 毫秒（ms）
   *   - FID  : 毫秒（ms）
   *   - INP  : 毫秒（ms）
   */
  value: number;

  /**
   * 性能评分等级
   * 由 web-vitals 库根据 Google 的阈值标准自动计算。
   * 控制台 StatusBadge 组件会根据此字段渲染不同颜色的状态徽章。
   */
  rating: VitalRating;
}

// ========================= 资源加载事件 =========================

/**
 * ResourceEvent — 静态资源加载事件
 *
 * 采集来源：
 *   通过 PerformanceObserver 监听 'resource' 类型的性能条目。
 *   可采集 JS、CSS、图片、字体等所有静态资源的加载信息。
 *
 * 用途：
 *   - 发现加载缓慢的资源文件
 *   - 分析资源加载失败的原因
 *   - 控制台资源分析页面的数据来源
 */
export interface ResourceEvent extends BaseEvent {
  /** 事件类型固定为 'resource'，用于类型守卫和可辨识联合 */
  type: 'resource';

  /**
   * 资源名称（URL）
   * 资源文件的完整请求地址。
   * 对应 PerformanceResourceTiming.name 属性。
   * 示例: "https://cdn.example.com/assets/app.a1b2c3.js"
   */
  name: string;

  /**
   * 资源加载耗时（毫秒）
   * 从发起请求到资源完全加载的时间。
   * 计算方式: responseEnd - startTime（来自 PerformanceResourceTiming）。
   */
  duration: number;

  /**
   * 资源传输大小（字节）
   * 通过网络实际传输的数据量（含 HTTP 头部）。
   * 对应 PerformanceResourceTiming.transferSize。
   * 如果资源命中缓存，transferSize 可能为 0。
   */
  transferSize: number;

  /**
   * 资源类型
   * 资源的 MIME 类型或加载方式标识。
   * 对应 PerformanceResourceTiming.initiatorType。
   * 常见值: 'script'（JS）、'link'（CSS）、'img'（图片）、'fetch'、'xmlhttprequest' 等。
   */
  initiatorType: string;
}

// ========================= 用户行为事件 =========================

/**
 * BehaviorType — 用户行为子类型
 *
 * - 'click'        : 用户点击事件（记录点击目标元素信息）
 * - 'route-change' : 路由变化事件（SPA 单页应用的页面切换）
 * - 'custom'       : 自定义行为事件（业务方通过 SDK API 主动上报）
 */
export type BehaviorType = 'click' | 'route-change' | 'custom';

/**
 * BehaviorEvent — 用户行为事件
 *
 * 采集来源：
 *   1. 点击事件 — 通过 document.addEventListener('click') 全局监听
 *   2. 路由变化 — 监听 popstate 事件和劫持 pushState / replaceState
 *   3. 自定义事件 — 业务方调用 SDK 提供的 track() 方法
 *
 * 用途：
 *   - 构建用户操作面包屑（Breadcrumbs），在错误详情页展示错误发生前的操作序列
 *   - 用户旅程分析和漏斗图
 *   - 配合 rrweb 录像回放，提供时间轴上的行为标记
 */
export interface BehaviorEvent extends BaseEvent {
  /** 事件类型固定为 'behavior'，用于类型守卫和可辨识联合 */
  type: 'behavior';

  /**
   * 行为子类型
   * 区分具体是哪种用户行为。
   * 取值范围见 BehaviorType 联合类型定义。
   */
  subType: BehaviorType;

  /**
   * 行为数据（JSON 格式）
   * 不同子类型携带不同的数据结构：
   *
   * click 类型示例:
   *   { tagName: "BUTTON", className: "submit-btn", innerText: "提交", xpath: "..." }
   *
   * route-change 类型示例:
   *   { from: "/home", to: "/detail/123" }
   *
   * custom 类型示例:
   *   { action: "add_to_cart", payload: { productId: "abc", quantity: 1 } }
   */
  data: Record<string, unknown>;
}

// ========================= 白屏检测事件 =========================

/**
 * WhitescreenEvent — 白屏检测事件
 *
 * 采集来源：
 *   SDK 的 whitescreen.ts 采集器，通过以下策略检测白屏：
 *   1. 页面加载完成后检查 document.body 的子元素数量
 *   2. 采样检测页面关键区域的 DOM 节点（如根容器 #app / #root）
 *   3. 结合 MutationObserver 监听 DOM 变化，判断页面是否长时间无内容渲染
 *
 * 用途：
 *   - 白屏是前端最严重的用户体验问题之一
 *   - 此事件被采样策略标记为 100% 采集（与错误事件同等优先级）
 *   - 控制台可据此统计白屏率和影响范围
 */
export interface WhitescreenEvent extends BaseEvent {
  /** 事件类型固定为 'whitescreen'，用于类型守卫和可辨识联合 */
  type: 'whitescreen';

  /**
   * 检测到的根元素标签名
   * 白屏检测时采样的页面根容器元素。
   * 通常为 'HTML'、'BODY'、'DIV#app'、'DIV#root' 等。
   * 用于排查是哪个层级的容器未正常渲染。
   */
  rootElement: string;

  /**
   * 采样点中空白点的数量
   * 白屏检测算法会在页面上选取多个采样点（如 18 个），
   * 检查每个点对应的 DOM 元素是否为根容器或 body/html。
   * 如果空白点数量超过阈值（如 17 个），则判定为白屏。
   */
  emptyPoints: number;

  /**
   * 页面可见区域的宽度（像素）
   * 对应 document.documentElement.clientWidth。
   * 用于辅助分析白屏是否与特定视口尺寸有关。
   */
  viewportWidth: number;

  /**
   * 页面可见区域的高度（像素）
   * 对应 document.documentElement.clientHeight。
   */
  viewportHeight: number;
}

// ========================= 上报事件联合类型 =========================

/**
 * IngestEvent — 上报事件联合类型（可辨识联合 / Discriminated Union）
 *
 * 这是所有可上报事件类型的联合，Gateway 的 /v1/ingest/batch 接口
 * 接收的就是 IngestEvent[] 数组。
 *
 * TypeScript 的可辨识联合特性允许通过 event.type 字段进行类型收窄：
 *
 * @example
 * ```typescript
 * function handleEvent(event: IngestEvent) {
 *   switch (event.type) {
 *     case 'error':
 *       // 此处 event 自动收窄为 OmniErrorEvent 类型
 *       console.log(event.fingerprint);
 *       break;
 *     case 'api':
 *       // 此处 event 自动收窄为 ApiEvent 类型
 *       console.log(event.duration);
 *       break;
 *     case 'vital':
 *       // 此处 event 自动收窄为 VitalEvent 类型
 *       console.log(event.rating);
 *       break;
 *     // ... 其他类型
 *   }
 * }
 * ```
 */
export type IngestEvent =
  | OmniErrorEvent
  | ApiEvent
  | VitalEvent
  | ResourceEvent
  | BehaviorEvent
  | WhitescreenEvent;
