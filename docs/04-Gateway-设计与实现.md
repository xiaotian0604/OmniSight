# Gateway 设计与实现

## 1. 技术定位

`apps/gateway` 是整个系统的服务端中枢，使用 NestJS 实现，职责包括：

1. SDK 上报接入
2. Replay 管理
3. 错误和指标查询
4. SourceMap 管理与还原
5. 高频错误告警

## 2. 模块划分

当前核心模块：

- `IngestModule`
- `WorkerModule`
- `QueryModule`
- `ReplayModule`
- `SourcemapModule`
- `AlertModule`
- `AuthModule`
- `HealthModule`

## 3. Ingest 链路

### Controller

`POST /v1/ingest/batch`

主要职责：

1. 校验事件数组
2. 校验 `x-api-key`
3. 写入 Bull Queue
4. 快速返回 200

### Worker

Worker 从队列消费后做三件事：

1. Redis 事件级幂等去重
2. 预留富化
3. 写 PostgreSQL

### 为什么要异步化

因为上报链路的目标是低延迟和高吞吐，不应该在 HTTP 请求里同步完成复杂写库和聚合逻辑。

## 4. 数据库设计

当前 PostgreSQL 核心表：

### `events`

存储所有事件，公共字段结构化，个性化字段进 `payload JSONB`。

关键列：

- `app_id`
- `session_id`
- `type`
- `ts`
- `fingerprint`
- `payload`
- `url`
- `ua`

### `replay_sessions`

存储 rrweb 回放数据。

### `sourcemaps`

存储 SourceMap 索引信息：

- `app_id`
- `version`
- `filename`
- `map_path`
- `git_*`

## 5. QueryService 的查询逻辑

### 错误列表

按 `fingerprint` 聚合，返回：

- `message`
- `filename`
- `count = SUM(occurrences)`
- `affectedUsers`
- `firstSeen`
- `lastSeen`

### 错误详情

查询逻辑：

1. 先按 `appId + fingerprint` 查最新错误事件
2. 兼容 UUID 形态时再按 `id` 查
3. 聚合 count / affectedUsers
4. 查 breadcrumbs
5. 查 replay
6. 查 SourceMap 命中结果
7. 组装 tags 返回

### 指标查询

包括：

- 错误率趋势
- API 指标
- Vitals 指标
- 项目列表聚合

## 6. Replay 模块

接口：

- `POST /v1/replay`
- `GET /v1/replay`
- `GET /v1/replay/:sessionId`

当前已经补过 `appId` 作用域隔离，避免不同项目间串读回放数据。

## 7. Sourcemap 模块

接口：

- `POST /v1/sourcemap`
- `GET /v1/sourcemap`

工作方式：

1. CI 上传 `.map`
2. 文件落地到本地目录
3. 数据库记录索引和 Git 信息
4. 查询错误详情或告警时读取文件反查

## 8. Alert 模块

### 当前机制

1. 定时扫描最近一段时间内的错误
2. 按 `appId + fingerprint` 聚合
3. 用 `SUM(occurrences)` 计算真实次数
4. 用 Redis 冷却位防止重复告警
5. 调用渠道发送

### 飞书告警当前带什么

- appId
- message
- release
- 压缩后位置
- 源码位置
- 源码片段
- count
- affectedUsers
- 时间窗口
- Git 信息

## 9. Gateway 当前边界

1. Worker 里的 UA / Geo enrich 还是占位。
2. SourceMap 文件当前存在本地，不是对象存储。
3. 目前是单点错误位置还原，不是整条 stack remap。
4. 没有真正的实时 WebSocket 告警推送。

## 10. Gateway 相关面试问答

### Q1：为什么要用 Bull Queue？

为了把上报接口和后处理链路解耦。上报请求只负责校验和入队，复杂写库、去重、聚合留给 Worker 异步做。

### Q2：为什么 Redis 去重不按 fingerprint 做？

因为按 fingerprint 做会吞掉真实重复错误，直接把统计和告警做错。现在 Redis 只负责事件级幂等保护。

### Q3：为什么错误详情接口主语义是 fingerprint，但还兼容 UUID？

因为 Console 的路由语义是 fingerprint，但为了兼容一些内部或历史调用场景，仍保留 UUID 查询分支。不过只有参数长得像 UUID 才会走那个分支，避免 PostgreSQL 把普通字符串当 UUID 报错。
