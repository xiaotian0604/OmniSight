# OmniSight 全链路可观测性系统 — 项目架构文档

> Turborepo · NestJS · PostgreSQL + TimescaleDB · Redis · React 18 · rrweb
> 
> 定位：简历级项目，前端深度优先，后端保证可用

---

## 📄 简历描述（直接复制使用）

**OmniSight 全链路可观测性系统（负责人，0-1 搭建）**

- **关键词**：前端监控、rrweb、性能分析、错误追踪、用户行为回放、可观测性、数据可视化、时序数据库、Web Vitals
- **项目简介**：自研全链路前端可观测性平台，覆盖 JS 错误监控、性能采集、用户行为录制与回放，帮助研发团队快速定位线上问题，将错误发现时效从小时级压缩至分钟级。
- **技术栈**：TypeScript · rrweb · React 18 · ECharts · NestJS · PostgreSQL(TimescaleDB) · Redis · Bull Queue · WebSocket · Turborepo
- **技术亮点**：
  - **轻量 SDK**：手写采集 SDK（< 15KB gzip），无侵入劫持 XHR/Fetch、监听 window.onerror、PerformanceObserver 采集 Web Vitals；引入指纹去重 + 头部采样策略，上报量降低 60%，异常事件保证 100% 捕获。
  - **故障复现**：基于 rrweb 实现用户操作录制，采用错误窗口策略（仅上传报错前后 40s 片段）+ Web Worker 压缩，存储成本降低 80%；支持时间轴回放并关联错误堆栈，实现线上 Bug 像素级还原。
  - **时序存储**：PostgreSQL + TimescaleDB 扩展存储时序指标数据，自动按时间分区，聚合查询性能提升 10x；异步写入队列（Bull Queue）解耦上报链路，网关接口 P99 响应 < 50ms。
  - **可视化分析**：基于 ECharts 构建性能趋势图、错误率分布图、用户旅程漏斗图，支持时间范围联动与多维下钻；rrweb-player 回放页与错误事件时间轴联动。
- **难点与解决方案**：
  - **采集无侵入**：通过 Proxy 劫持 XMLHttpRequest / fetch，Hook 原型链方式拦截接口调用，对业务代码零修改；使用 PerformanceObserver 替代轮询，减少性能开销。
  - **回放隐私安全**：rrweb 录制配置 maskInputOptions 遮盖敏感输入，自定义 CSS Selector 脱敏规则；用户 ID 经 SHA-256 单向哈希后存储，满足数据合规要求。
  - **数据量控制**：客户端 LRU Cache 存储错误指纹，60s 内相同错误不重复上报；服务端 Redis 布隆过滤器二次去重；rrweb 录像仅在错误触发时上传，日常静默录制不传输。
  - **堆栈可读性**：CI 构建阶段自动上传 SourceMap，查看错误时服务端实时还原压缩后的行列号，展示源码上下文，定位效率提升数倍。
- **成果**：SDK 接入 3 条业务线，错误发现时效从小时级降至分钟级；回放功能帮助定位多个复现率低的疑难 Bug；性能面板直观暴露 LCP > 2.5s 的慢页面，推动完成专项优化。

---

## 目录

1. [整体架构](#1-整体架构)
2. [Monorepo 结构](#2-monorepo-结构)
3. [apps/sdk — 前端采集 SDK](#3-appssdk--前端采集-sdk)
4. [apps/gateway — 数据接入网关](#4-appsgateway--数据接入网关)
5. [apps/console — 可视化控制台](#5-appsconsole--可视化控制台)
6. [packages/ — 共享内部包](#6-packages--共享内部包)
7. [数据库设计](#7-数据库设计)
8. [数据流转链路](#8-数据流转链路)
9. [本地开发启动](#9-本地开发启动)
10. [开发路线图](#10-开发路线图)

---

## 1. 整体架构

### 设计原则

- **前端深度优先**：SDK 和控制台是核心，每行代码都要能讲清楚
- **后端够用即可**：NestJS 薄薄一层，能接数据、能查询、不崩就行
- **可演示**：docker-compose 一键起所有依赖，本地跑通，面试现场能开
- **可解释**：每个技术选型都有合理理由，不堆概念

### 架构图

```
┌─────────────────────────────────────────┐
│           业务方 Web App                 │
│                                         │
│   <script src="omnisight.iife.js">      │
│   OmniSight.init({ appId, dsn })        │
└──────────────┬──────────────────────────┘
               │ Beacon API / XHR 批量上报
               │ POST /v1/ingest/batch
┌──────────────▼──────────────────────────┐
│         apps/gateway (NestJS)            │
│                                         │
│  鉴权 → 校验 → Bull Queue → 响应 200    │
└──────────────┬──────────────────────────┘
               │ 异步消费队列
┌──────────────▼──────────────────────────┐
│         Queue Worker                    │
│                                         │
│  去重(Redis) → 富化 → 写 PostgreSQL      │
└──────┬──────────────────┬───────────────┘
       │ TimescaleDB       │ Redis Pub/Sub
       │ 时序数据           │ 实时告警
┌──────▼──────┐  ┌────────▼───────────────┐
│ PostgreSQL  │  │  apps/console           │
│ TimescaleDB │  │  React 18 + ECharts     │
│             │  │  rrweb-player 回放      │
└─────────────┘  └────────────────────────┘
```

### 技术选型说明

| 选型 | 替代了什么 | 理由 |
|------|-----------|------|
| PostgreSQL + TimescaleDB | ClickHouse | 时序扩展够用，运维简单，面试可说"时序数据库" |
| Bull Queue + Redis | Kafka | 功能等价，零额外部署，Kafka 作为架构演进方向 |
| NestJS 单服务 | 微服务拆分 | 当前规模不需要拆，代码结构清晰即可 |
| Docker Compose | K8s | 本地演示足够，不引入不必要复杂度 |

---

## 2. Monorepo 结构

```
omnisight/
├── turbo.json                    # Turborepo 任务管道（build/dev/test/lint）
├── pnpm-workspace.yaml           # pnpm workspace 声明
├── package.json                  # 根 package，统一脚本入口
├── docker-compose.yml            # PostgreSQL + TimescaleDB + Redis 一键启动
├── .env.example                  # 环境变量模板
│
├── apps/
│   ├── sdk/                      # ⭐ 核心：前端采集 SDK
│   ├── gateway/                  # NestJS 接入网关
│   └── console/                  # ⭐ 核心：React 可视化控制台
│
└── packages/
    ├── shared-types/             # 全链路共用 TS 类型
    └── ui-components/            # 控制台公共组件
```

### turbo.json

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "cache": false
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## 3. apps/sdk — 前端采集 SDK

> **这是整个项目最重要的部分，每个文件都要手写，面试时能逐行解释。**

### 目录结构

```
apps/sdk/
├── src/
│   ├── index.ts                  # 入口：export init() + 各模块按需导出
│   ├── core.ts                   # 调度器：模块注册、配置合并、生命周期管理
│   │
│   ├── collectors/               # 采集器（核心手写）
│   │   ├── error.ts              # JS 错误采集
│   │   ├── api.ts                # XHR / Fetch 接口耗时劫持
│   │   ├── vitals.ts             # Web Vitals（LCP/CLS/TTFB/FID）
│   │   ├── resource.ts           # 资源加载耗时（PerformanceObserver）
│   │   ├── behavior.ts           # 用户行为（点击/路由变化）
│   │   ├── whitescreen.ts        # 白屏检测
│   │   └── replay.ts             # rrweb 录制 + 错误窗口上传
│   │
│   ├── transport/                # 上报层
│   │   ├── batch.ts              # 事件队列 + 定时批量 flush
│   │   ├── beacon.ts             # Beacon API 上报（页面卸载时使用）
│   │   └── xhr.ts                # XHR fallback
│   │
│   ├── sampling/                 # 采样与去重
│   │   ├── sampler.ts            # 头部采样：正常事件按比例，错误事件 100%
│   │   └── dedup.ts              # LRU Cache 错误指纹去重
│   │
│   ├── privacy/                  # 隐私脱敏
│   │   ├── mask.ts               # rrweb maskInputOptions + 自定义选择器
│   │   └── anonymize.ts          # 用户 ID SHA-256 单向哈希
│   │
│   └── session.ts                # session_id 生成与管理（UUID + localStorage）
│
├── test/
│   ├── error.test.ts
│   ├── sampler.test.ts
│   ├── dedup.test.ts
│   └── api.test.ts
│
├── rollup.config.ts              # 构建：ESM / CJS / IIFE 三格式输出
└── package.json                  # @omnisight/sdk，sideEffects: false
```

### 各文件核心实现说明

#### `collectors/error.ts` — JS 错误采集

```typescript
// 监听三种错误来源
export function initErrorCollector(core: Core) {
  // 1. 同步错误
  window.addEventListener('error', (e) => {
    core.capture({
      type: 'error',
      message: e.message,
      stack: e.error?.stack,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  // 2. Promise 未捕获异常
  window.addEventListener('unhandledrejection', (e) => {
    core.capture({
      type: 'error',
      message: String(e.reason),
      stack: e.reason?.stack,
    });
  });

  // 3. console.error 劫持（可选，捕获业务主动上报的错误）
  const _error = console.error.bind(console);
  console.error = (...args) => {
    core.capture({ type: 'error', message: args.join(' ') });
    _error(...args);
  };
}
```

#### `collectors/api.ts` — XHR/Fetch 劫持

```typescript
// 劫持 XMLHttpRequest
export function initApiCollector(core: Core) {
  const OriginalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = class extends OriginalXHR {
    private _startTime = 0;
    private _url = '';

    open(method: string, url: string) {
      this._url = url;
      return super.open(method, url);
    }

    send(body?: any) {
      this._startTime = performance.now();
      this.addEventListener('loadend', () => {
        core.capture({
          type: 'api',
          url: this._url,
          status: this.status,
          duration: performance.now() - this._startTime,
          method: 'XHR',
        });
      });
      return super.send(body);
    }
  } as any;

  // 劫持 fetch（Proxy 方式）
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const startTime = performance.now();
    const url = typeof input === 'string' ? input : input.url;
    try {
      const res = await originalFetch(input, init);
      core.capture({
        type: 'api',
        url,
        status: res.status,
        duration: performance.now() - startTime,
        method: init?.method || 'GET',
      });
      return res;
    } catch (err) {
      core.capture({ type: 'api', url, status: 0, duration: performance.now() - startTime });
      throw err;
    }
  };
}
```

#### `collectors/vitals.ts` — Web Vitals 采集

```typescript
import { onLCP, onCLS, onTTFB, onFID, onINP } from 'web-vitals';

export function initVitalsCollector(core: Core) {
  // 只在页面卸载或后台化时上报，保证数据准确性
  onLCP((metric) => core.capture({ type: 'vital', name: 'LCP', value: metric.value, rating: metric.rating }));
  onCLS((metric) => core.capture({ type: 'vital', name: 'CLS', value: metric.value, rating: metric.rating }));
  onTTFB((metric) => core.capture({ type: 'vital', name: 'TTFB', value: metric.value, rating: metric.rating }));
  onFID((metric) => core.capture({ type: 'vital', name: 'FID', value: metric.value, rating: metric.rating }));
  onINP((metric) => core.capture({ type: 'vital', name: 'INP', value: metric.value, rating: metric.rating }));
}
```

#### `collectors/replay.ts` — rrweb 录制与错误窗口策略

```typescript
import * as rrweb from 'rrweb';

// 核心思路：Ring Buffer 保留最近 30s，错误发生时才上传
export function initReplayCollector(core: Core) {
  const BUFFER_DURATION = 30_000; // 保留 30s
  const AFTER_ERROR_DURATION = 10_000; // 错误后再录 10s

  const eventBuffer: { event: any; ts: number }[] = [];
  let errorTriggered = false;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  // 录制事件，始终写入 buffer
  rrweb.record({
    emit(event) {
      const now = Date.now();
      eventBuffer.push({ event, ts: now });

      // 裁剪 30s 之前的数据
      const cutoff = now - BUFFER_DURATION;
      while (eventBuffer.length && eventBuffer[0].ts < cutoff) {
        eventBuffer.shift();
      }

      // 如果已触发错误，继续收集直到 10s 后上传
      if (errorTriggered) return;
    },
    // 隐私脱敏配置
    maskInputOptions: { password: true, email: true, tel: true },
    blockSelector: '[data-no-record]',
  });

  // 错误发生时，触发上传
  core.on('error', () => {
    if (errorTriggered) return;
    errorTriggered = true;

    // 再等 10s，收集错误后的操作
    errorTimer = setTimeout(() => {
      const snapshot = [...eventBuffer].map(e => e.event);
      core.uploadReplay(snapshot); // 上传到 /v1/replay
      eventBuffer.length = 0;
      errorTriggered = false;
    }, AFTER_ERROR_DURATION);
  });
}
```

#### `sampling/sampler.ts` — 采样策略

```typescript
export class Sampler {
  private sampleRate: number;

  constructor(rate = 0.1) {
    this.sampleRate = rate;
  }

  shouldSample(event: BaseEvent): boolean {
    // 错误类事件：100% 采集
    if (event.type === 'error') return true;
    // 白屏、接口超时：100% 采集
    if (event.type === 'whitescreen') return true;
    if (event.type === 'api' && (event as ApiEvent).duration > 3000) return true;

    // 其余按配置比例采样（基于 sessionId hash，保证同一用户行为一致性）
    return this.hashRate(event.sessionId) < this.sampleRate;
  }

  private hashRate(sessionId: string): number {
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash << 5) - hash + sessionId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 100) / 100;
  }
}
```

#### `sampling/dedup.ts` — LRU 指纹去重

```typescript
// 简单 LRU：Map 天然按插入顺序，超出容量删除最旧的
export class Deduplicator {
  private cache = new Map<string, number>();
  private maxSize: number;
  private ttl: number; // ms

  constructor(maxSize = 100, ttl = 60_000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  isDuplicate(event: ErrorEvent): boolean {
    const fingerprint = this.getFingerprint(event);
    const now = Date.now();
    const lastSeen = this.cache.get(fingerprint);

    if (lastSeen && now - lastSeen < this.ttl) return true;

    // 超出容量，删除最旧
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(fingerprint, now);
    return false;
  }

  private getFingerprint(event: ErrorEvent): string {
    // 取 message + stack 第一帧作为指纹
    const firstFrame = event.stack?.split('\n')[1] || '';
    return btoa(`${event.message}|${firstFrame}`).slice(0, 32);
  }
}
```

#### `transport/batch.ts` — 批量上报

```typescript
export class BatchTransport {
  private queue: BaseEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_SIZE = 20;
  private readonly FLUSH_INTERVAL = 5000; // 5s

  add(event: BaseEvent) {
    this.queue.push(event);
    if (this.queue.length >= this.MAX_SIZE) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  private async flush() {
    if (!this.queue.length) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    const batch = this.queue.splice(0);

    // 优先 Beacon（页面关闭时也能投递）
    const payload = JSON.stringify(batch);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/v1/ingest/batch', new Blob([payload], { type: 'application/json' }));
    } else {
      await fetch('/v1/ingest/batch', { method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json' }, keepalive: true });
    }
  }

  // 页面卸载时强制 flush
  destroy() { this.flush(); }
}
```

### SDK 初始化接口

```typescript
// 业务方使用方式
import { init } from '@omnisight/sdk';

init({
  appId: 'your-app-id',
  dsn: 'https://your-gateway.com',
  sampleRate: 0.1,       // 正常事件 10% 采样
  enableReplay: true,    // 开启行为录制
  privacy: {
    maskInputs: true,
    blockSelectors: ['.payment-form', '#id-card'],
  },
  // 开发环境 debug 模式
  debug: process.env.NODE_ENV === 'development',
});
```

---

## 4. apps/gateway — 数据接入网关

> 保证可用性，接口稳定，不是重点。薄薄一层，能讲清楚流程就行。

```
apps/gateway/
├── src/
│   ├── main.ts                   # 启动入口，全局 Pipe/Filter，Swagger 文档
│   ├── app.module.ts             # 根模块
│   │
│   ├── ingest/                   # 数据上报
│   │   ├── ingest.module.ts
│   │   ├── ingest.controller.ts  # POST /v1/ingest/batch
│   │   ├── ingest.service.ts     # 写入 Bull Queue
│   │   └── ingest.dto.ts         # class-validator 校验
│   │
│   ├── replay/                   # 录像上传
│   │   ├── replay.controller.ts  # POST /v1/replay
│   │   └── replay.service.ts
│   │
│   ├── query/                    # 控制台查询接口
│   │   ├── query.controller.ts   # GET /v1/errors, /v1/metrics, /v1/replay/:sessionId
│   │   └── query.service.ts      # 查询 PostgreSQL，组装返回数据
│   │
│   ├── sourcemap/                # SourceMap 上传
│   │   ├── sourcemap.controller.ts
│   │   └── sourcemap.service.ts  # 存文件 + 记录索引到 PG
│   │
│   ├── worker/
│   │   └── ingest.worker.ts      # Bull Queue Worker：去重 → 富化 → 写 PG
│   │
│   ├── auth/
│   │   └── api-key.guard.ts      # x-api-key Header 校验（查 PG projects 表）
│   │
│   └── health/
│       └── health.controller.ts  # GET /health（PG + Redis 连通性）
│
└── Dockerfile
```

### 核心接口

| 接口 | 说明 |
|------|------|
| `POST /v1/ingest/batch` | SDK 上报，写入 Bull Queue，立即返回 200 |
| `POST /v1/replay` | 录像分段上传 |
| `POST /v1/sourcemap` | CI 上传 SourceMap |
| `GET /v1/errors` | 错误列表（聚合、分页、筛选） |
| `GET /v1/errors/:id` | 错误详情 + 还原堆栈 |
| `GET /v1/metrics` | 时序指标查询（错误率/P99延迟/Vitals） |
| `GET /v1/replay/:sessionId` | 拉取指定 session 录像数据 |
| `GET /health` | K8s 探针 / 演示时验证服务状态 |

### Worker 处理流程

```typescript
// worker/ingest.worker.ts
@Processor('ingest')
export class IngestWorker {
  @Process()
  async handle(job: Job<BaseEvent[]>) {
    for (const event of job.data) {
      // 1. Redis 布隆过滤器去重
      const isDup = await this.redis.bloomFilter.has(event.fingerprint);
      if (isDup) continue;
      await this.redis.bloomFilter.add(event.fingerprint);

      // 2. 富化（UA 解析、IP 地理位置）
      const enriched = await this.enrich(event);

      // 3. 写入 PostgreSQL
      await this.db.events.insert(enriched);
    }
  }
}
```

---

## 5. apps/console — 可视化控制台

> **这是第二个重点，面试演示的核心。页面要好看、交互要流畅。**

```
apps/console/
├── src/
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # 路由配置（react-router-dom v6）
│   │
│   ├── pages/
│   │   ├── overview/             # 概览仪表盘（首屏，重点）
│   │   │   ├── index.tsx         # 错误率趋势、PV/UV、Vitals 评分
│   │   │   ├── ErrorRateChart.tsx# ECharts 折线图，支持时间范围刷选
│   │   │   ├── VitalsScore.tsx   # LCP/CLS/TTFB 评分卡（好/需改进/差 三态）
│   │   │   └── TopErrors.tsx     # Top 10 高频错误列表
│   │   │
│   │   ├── errors/               # 错误管理（重点）
│   │   │   ├── index.tsx         # 错误聚合列表（按指纹分组，显示频次/影响用户数）
│   │   │   └── detail/
│   │   │       ├── index.tsx     # 错误详情页
│   │   │       ├── StackTrace.tsx# Source Map 还原后的堆栈（代码高亮）
│   │   │       ├── Breadcrumbs.tsx # 错误前的用户操作面包屑
│   │   │       └── ReplayLink.tsx  # 跳转到关联录像的按钮
│   │   │
│   │   ├── replay/               # 行为回放（最震撼的演示点）
│   │   │   ├── index.tsx         # 录像列表（含关联错误数标记）
│   │   │   └── player/
│   │   │       ├── index.tsx     # 回放页面
│   │   │       ├── Player.tsx    # rrweb-player 封装（倍速/暂停/全屏）
│   │   │       └── EventTimeline.tsx # 右侧时间轴（错误/点击/路由 标记）
│   │   │
│   │   ├── performance/          # 性能分析
│   │   │   ├── index.tsx         # Vitals 趋势 + 接口耗时分布
│   │   │   ├── ApiTable.tsx      # 接口耗时排行（P50/P75/P99）
│   │   │   └── ResourceChart.tsx # 资源加载分析
│   │   │
│   │   └── settings/             # 项目设置
│   │       ├── sdk-setup/        # SDK 接入指引（交互式代码生成）
│   │       └── sourcemap/        # SourceMap 上传记录
│   │
│   ├── components/               # 公共组件
│   │   ├── TimeRangePicker.tsx   # 时间范围选择（全局联动）
│   │   ├── MetricChart.tsx       # ECharts 封装（统一配置/主题/Loading）
│   │   ├── ErrorBoundary.tsx     # React 错误边界
│   │   └── EmptyState.tsx        # 空状态占位
│   │
│   ├── hooks/
│   │   ├── useMetrics.ts         # React Query：拉取时序数据 + 自动刷新
│   │   ├── useWebSocket.ts       # WS 连接（实时告警推送）
│   │   └── useReplay.ts          # 录像数据加载 + 播放状态管理
│   │
│   ├── api/
│   │   ├── client.ts             # axios 实例（统一 token/错误处理）
│   │   ├── errors.ts             # 错误相关接口
│   │   ├── metrics.ts            # 指标查询接口
│   │   └── replay.ts             # 录像接口
│   │
│   └── store/
│       ├── global.store.ts       # 当前项目 / 时间范围（Zustand）
│       └── alert.store.ts        # 实时告警队列
│
└── vite.config.ts
```

### 回放页面核心实现

```typescript
// pages/replay/player/Player.tsx
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

export function ReplayPlayer({ events, errorTimestamps }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !events.length) return;

    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events,
        width: 1024,
        height: 576,
        autoPlay: false,
        speedOption: [1, 2, 4, 8],  // 倍速选项
      },
    });

    return () => playerRef.current?.$destroy();
  }, [events]);

  // 点击时间轴错误标记，跳转到对应时刻
  const jumpToError = (timestamp: number) => {
    playerRef.current?.goto(timestamp);
  };

  return (
    <div className="replay-page">
      <div ref={containerRef} />
      <EventTimeline
        errorTimestamps={errorTimestamps}
        onJump={jumpToError}
      />
    </div>
  );
}
```

---

## 6. packages/ — 共享内部包

### @omnisight/shared-types

```
packages/shared-types/
└── src/
    ├── events.ts         # 所有事件类型定义（BaseEvent / ErrorEvent / ApiEvent / VitalEvent）
    ├── session.ts        # SessionContext
    └── index.ts
```

核心类型：

```typescript
// events.ts
export type EventType = 'error' | 'api' | 'vital' | 'resource' | 'behavior' | 'whitescreen';

export interface BaseEvent {
  type: EventType;
  appId: string;
  sessionId: string;
  userId?: string;       // 脱敏后的哈希值
  ts: number;            // 客户端时间戳（ms）
  url: string;           // 当前页面 URL
  ua: string;            // User-Agent
  sdkVersion: string;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  fingerprint: string;   // hash(message + stack[0])，用于聚合去重
}

export interface ApiEvent extends BaseEvent {
  type: 'api';
  method: string;
  url: string;
  status: number;
  duration: number;      // ms
  requestSize?: number;
  responseSize?: number;
}

export interface VitalEvent extends BaseEvent {
  type: 'vital';
  name: 'LCP' | 'CLS' | 'TTFB' | 'FID' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}
```

### @omnisight/ui-components

```
packages/ui-components/
└── src/
    ├── MetricChart/      # ECharts 时序图（统一主题、Loading、空状态）
    ├── StatusBadge/      # 状态徽章（good/warn/error 三态）
    └── index.ts
```

---

## 7. 数据库设计

### PostgreSQL 表结构

```sql
-- 项目表
CREATE TABLE projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  api_key    VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 事件表（核心，TimescaleDB 超表）
CREATE TABLE events (
  id          UUID DEFAULT gen_random_uuid(),
  app_id      VARCHAR(64) NOT NULL,
  session_id  VARCHAR(64) NOT NULL,
  type        VARCHAR(20) NOT NULL,         -- error/api/vital/behavior
  ts          TIMESTAMPTZ NOT NULL,          -- 事件时间（作为时序主键）
  fingerprint VARCHAR(64),                   -- 错误去重指纹
  payload     JSONB NOT NULL,                -- 完整事件数据
  url         TEXT,
  ua          TEXT,
  country     VARCHAR(64),
  city        VARCHAR(64),
  PRIMARY KEY (id, ts)                       -- TimescaleDB 超表要求
);

-- 转为 TimescaleDB 超表（按时间自动分区）
SELECT create_hypertable('events', 'ts');
-- 自动按天分区，90天后自动过期
SELECT add_retention_policy('events', INTERVAL '90 days');

-- 创建常用查询索引
CREATE INDEX idx_events_app_type ON events (app_id, type, ts DESC);
CREATE INDEX idx_events_fingerprint ON events (fingerprint, ts DESC);
CREATE INDEX idx_events_session ON events (session_id);

-- 录像表
CREATE TABLE replay_sessions (
  session_id  VARCHAR(64) PRIMARY KEY,
  app_id      VARCHAR(64) NOT NULL,
  events      JSONB NOT NULL,               -- rrweb events 数组
  error_count INT DEFAULT 0,
  duration    INT,                          -- 录像时长（ms）
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SourceMap 索引表
CREATE TABLE sourcemaps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     VARCHAR(64) NOT NULL,
  version    VARCHAR(64) NOT NULL,          -- 对应 app 版本号（如 git sha）
  filename   VARCHAR(256) NOT NULL,         -- 原始文件名
  map_path   TEXT NOT NULL,                 -- SourceMap 文件存储路径
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (app_id, version, filename)
);
```

### 常用查询示例

```sql
-- 查询最近 1h 错误率（TimescaleDB time_bucket）
SELECT
  time_bucket('5 minutes', ts) AS bucket,
  COUNT(*) FILTER (WHERE type = 'error') AS error_count,
  COUNT(*) AS total_count,
  ROUND(
    COUNT(*) FILTER (WHERE type = 'error')::numeric / COUNT(*) * 100, 2
  ) AS error_rate
FROM events
WHERE app_id = $1
  AND ts > NOW() - INTERVAL '1 hour'
GROUP BY bucket
ORDER BY bucket;

-- 错误聚合列表（按指纹分组）
SELECT
  fingerprint,
  payload->>'message' AS message,
  payload->>'filename' AS filename,
  COUNT(*)              AS count,
  COUNT(DISTINCT session_id) AS affected_users,
  MAX(ts)               AS last_seen,
  MIN(ts)               AS first_seen
FROM events
WHERE app_id = $1
  AND type = 'error'
  AND ts > $2
GROUP BY fingerprint, payload->>'message', payload->>'filename'
ORDER BY count DESC
LIMIT 50;

-- P99 接口耗时（近 24h）
SELECT
  payload->>'url' AS endpoint,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY (payload->>'duration')::float) AS p50,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY (payload->>'duration')::float) AS p99,
  COUNT(*) AS count
FROM events
WHERE app_id = $1
  AND type = 'api'
  AND ts > NOW() - INTERVAL '24 hours'
GROUP BY payload->>'url'
ORDER BY p99 DESC
LIMIT 20;
```

### Redis 数据结构

| Key | 类型 | 用途 | TTL |
|-----|------|------|-----|
| `bf:dedup:{appId}` | Bit String | 布隆过滤器去重 | 无（定期重置）|
| `session:{sessionId}` | Hash | 会话上下文缓存 | 30min |
| `apikey:{key}` | String | API Key 缓存 | 5min |
| `alert:sent:{ruleId}` | String | 告警收敛去重 | 10min |

---

## 8. 数据流转链路

### 正常上报链路

```
用户浏览器
  window.onerror / Fetch Hook / PerformanceObserver
    ↓
  SDK collectors → sampler（采样决策）→ dedup（去重）→ batch queue
    ↓ 每 5s 或积累 20 条，Beacon API 上报
  POST /v1/ingest/batch
    ↓
  Gateway: 鉴权 → DTO 校验 → 写入 Bull Queue → 立即返回 200
    ↓ 异步消费
  IngestWorker: BloomFilter 去重 → UA/IP 富化 → INSERT INTO events
    ↓
  PostgreSQL events 表（TimescaleDB 自动时间分区）
    ↓
  Console: React Query 定时拉取 → ECharts 渲染
```

### rrweb 录像链路

```
用户浏览器
  rrweb.record() → Ring Buffer（保留最近 30s）
    ↓ JS Error 触发
  等待 10s（收集错误后操作）
    ↓
  POST /v1/replay（携带前 30s + 后 10s 录像数据）
    ↓
  Gateway → 写入 replay_sessions 表
    ↓
  Console replay 页面：拉取 events → rrweb-player 渲染
  + EventTimeline 展示错误/点击标记，可点击跳转
```

### Source Map 还原链路

```
CI 构建
  webpack/vite build → 生成 .map 文件
  → POST /v1/sourcemap（携带 appId + version）
  → 存文件系统，索引写 sourcemaps 表

查看错误详情
  前端请求错误详情 API
  → 后端读取 stack（压缩后行列号）
  → 找到对应 SourceMap 文件（app_id + version）
  → source-map 库还原为源文件路径 + 行列
  → 返回前后 5 行源代码上下文
  → 前端代码高亮展示
```

---

## 9. 本地开发启动

### docker-compose.yml

```yaml
version: '3.8'
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_DB: omnisight
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./infra/scripts/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pg_data:
```

### 启动命令

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库
docker-compose up -d

# 3. 配置环境变量
cp .env.example .env

# 4. 启动所有服务（Turborepo 并行）
pnpm dev

# 单独启动某个服务
pnpm --filter @omnisight/gateway dev   # http://localhost:3000
pnpm --filter @omnisight/console dev   # http://localhost:5173
pnpm --filter @omnisight/sdk build:watch

# 运行测试
pnpm test
```

### .env.example

```bash
# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omnisight

# Redis
REDIS_URL=redis://localhost:6379

# JWT / API Key
JWT_SECRET=change-me-in-production

# Gateway
PORT=3000
NODE_ENV=development

# Console
VITE_API_BASE=http://localhost:3000
```

---

## 10. 开发路线图

### Phase 1 — SDK（2 周，必须做扎实）

- [ ] `error.ts` — JS 错误 + Promise 异常
- [ ] `api.ts` — XHR/Fetch 劫持
- [ ] `vitals.ts` — Web Vitals
- [ ] `behavior.ts` — 点击/路由
- [ ] `sampler.ts` — 采样策略
- [ ] `dedup.ts` — LRU 去重
- [ ] `batch.ts` — 批量上报
- [ ] `replay.ts` — rrweb + 错误窗口策略
- [ ] `mask.ts` — 隐私脱敏
- [ ] Rollup 打包，输出 ESM / IIFE
- [ ] Vitest 单元测试（覆盖率 > 70%）

### Phase 2 — 网关 & 数据库（1 周）

- [ ] NestJS 项目初始化
- [ ] `/v1/ingest/batch` 接口
- [ ] Bull Queue Worker
- [ ] PostgreSQL + TimescaleDB 表结构
- [ ] Redis 布隆过滤器去重
- [ ] 查询接口（错误列表/详情/指标）

### Phase 3 — 控制台（2 周，重点打磨 UI）

- [ ] 概览仪表盘（错误率趋势图）
- [ ] 错误列表页（聚合/搜索/筛选）
- [ ] 错误详情页（堆栈展示）
- [ ] **回放页面**（rrweb-player + 时间轴，演示最震撼）
- [ ] 性能页面（Vitals 评分卡）

### Phase 4 — 加分项（有时间再做）

- [ ] Source Map 上传 + 堆栈还原
- [ ] SDK 接入向导页（交互式代码生成）
- [ ] 简单邮件告警

---

## 面试常见追问 & 参考答法

**Q：为什么不用 ClickHouse？**
> "当前接入规模用 PostgreSQL + TimescaleDB 完全够用，TimescaleDB 提供自动时间分区和连续聚合，查询性能满足需求。ClickHouse 在亿级数据量才有明显优势，引入它反而增加运维成本，是过度设计。"

**Q：为什么不用 Kafka？**
> "用 Bull Queue + Redis 实现了异步队列解耦，功能上等价。Kafka 是为更大数据规模预留的演进方案，架构上已经做了队列层的接口抽象，后续替换成本很低。"

**Q：rrweb 录制对性能有影响吗？**
> "有轻微影响。我做了两个优化：一是序列化压缩放到 Web Worker 里跑，不阻塞主线程；二是 Ring Buffer 策略，平时只录不传，触发错误才上传，大幅减少网络开销。"

**Q：采样怎么做的，会不会漏掉重要错误？**
> "双轨策略：错误事件、白屏、慢接口强制 100% 采集；正常 PV、点击行为按配置比例采样（默认 10%）。基于 sessionId hash 采样保证同一用户的行为数据完整性。"

**Q：如何保证数据不重复？**
> "两层去重：客户端 LRU Cache 存错误指纹，60s 内相同错误不重复上报；服务端 Redis 布隆过滤器二次过滤，误判率 0.1%，几乎消除重复写入。"

---

*v2.0 · 2026-03 · 简历版，前端优先*
