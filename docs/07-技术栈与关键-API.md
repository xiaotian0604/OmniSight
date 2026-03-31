# 技术栈与关键 API

## 1. Monorepo 基础设施

### pnpm workspace

用途：

- 统一依赖管理
- workspace 包间引用
- 减少重复安装

### Turbo

用途：

- 统一执行 `build / dev / test / lint`
- 管理 monorepo 任务编排

## 2. SDK 侧技术栈

### Rollup

用于打包 SDK 的：

- ESM
- CJS
- IIFE

### rrweb

用于 Replay 录制。

### web-vitals

用于采集：

- LCP
- CLS
- TTFB
- FID
- INP

## 3. Gateway 侧技术栈

### NestJS

当前项目中用到的关键概念：

- `@Module()`：模块组织
- `@Controller()`：路由控制器
- `@Injectable()`：服务注入
- `@Inject()`：注入自定义 provider
- `@Get()` / `@Post()`：路由声明
- `@Query()` / `@Param()` / `@Body()`：参数绑定
- `@UseGuards()`：鉴权

### Bull + Redis

用途：

- 事件上报异步入队
- Worker 消费
- 告警冷却位
- 事件级幂等去重

### PostgreSQL / TimescaleDB

用途：

- 时序事件存储
- 错误聚合
- 指标查询
- replay 元信息存储
- sourcemap 索引存储

### @jridgewell/trace-mapping

用途：

- 根据 sourcemap 还原压缩后代码位置
- 获取原始源码位置和 `sourcesContent`

## 4. Console 侧技术栈

### React Router

用途：

- 页面级路由
- 错误详情和 replay 播放页参数路由

### React Query

用途：

- 请求状态管理
- 缓存
- queryKey 维度隔离

### Zustand

用途：

- 存放当前 `appId`
- 控制全局筛选状态

### Axios

用途：

- 统一 API 客户端
- 自动注入 `appId`
- 统一错误处理

### ECharts

用途：

- 错误率趋势
- 性能指标可视化

### rrweb-player

用途：

- 播放用户回放

## 5. 当前关键接口

### SDK 上报接口

- `POST /v1/ingest/batch`
- `POST /v1/replay`

### 查询接口

- `GET /v1/apps`
- `GET /v1/errors`
- `GET /v1/errors/:id`
- `GET /v1/metrics/error-rate`
- `GET /v1/metrics/api`
- `GET /v1/metrics/vitals`
- `GET /v1/replay`
- `GET /v1/replay/:sessionId`
- `GET /v1/sourcemap`

### 管理接口

- `POST /v1/sourcemap`

## 6. 当前项目里值得讲清楚的几个 API 设计

### `POST /v1/ingest/batch`

为什么是 batch：

- 减少请求数量
- 降低服务端压力
- 便于 SDK 端缓存和批量发送

### `GET /v1/errors/:id`

虽然路径参数叫 `id`，但当前主语义是 `fingerprint`，只是在兼容 UUID 查询。

当前返回结果除了主错误的 `sourceMap` 摘要，还会额外返回：

- `rawStack`
- `mappedStackFrames`

这样 Console 可以同时展示“主错误摘要 + 多帧映射栈 + 原始 stack”。

### `POST /v1/sourcemap`

为什么要单独做这个接口：

- Sourcemap 是构建产物，不是业务事件
- 上传行为更适合 CI/CD，而不是浏览器 SDK
