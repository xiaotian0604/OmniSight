# SDK 设计与实现

## 1. 入口与配置

SDK 入口在 `apps/sdk/src/index.ts`，主要对外暴露：

- `init()`
- `destroy()`
- `resetSession()`

当前关键配置：

- `appId`
- `dsn`
- `apiKey`
- `release`
- `sampleRate`
- `enableReplay`
- `privacy`
- `debug`

`release` 是新链路里的关键字段，用来和服务端已上传的 SourceMap 版本精确匹配。

## 2. Core 做了什么

`Core` 是 SDK 中枢，负责：

1. 配置解析
2. 事件公共字段补齐
3. 错误指纹生成
4. 采样
5. 去重
6. 批量上报
7. 生命周期清理

## 3. 错误采集逻辑

当前错误采集器监听：

1. `window.addEventListener('error')`
2. `window.addEventListener('unhandledrejection')`
3. `console.error` 劫持

捕获后统一提交给 `core.capture()`。

## 4. 指纹和防抖

### 指纹生成

指纹由：

- `message`
- `stack` 第一帧

组合后做轻量 hash 得到 `fingerprint`。

### 防抖逻辑

当前防抖键是：

- `sessionId + fingerprint`

规则：

1. 同一个 session 内同一个错误 60 秒内首次立即上报。
2. 重复错误不再实时上报。
3. 重复次数记入 `occurrences`。
4. 到时或页面卸载时补发聚合错误。

### 这个设计解决了什么

1. 防止营销页、活动页、异常页面因为循环报错刷爆上报接口。
2. 保留真实错误次数，不让统计被防抖压扁。
3. 用户重置 session 后，同错会重新计入新的影响范围。

## 5. BatchTransport

当前上报策略：

1. 事件进内存队列
2. 累积到 20 条或 5 秒触发 flush
3. 页面卸载时强制 flush
4. 默认用 `fetch + x-api-key` 上报
5. 失败时降级到 XHR

这里没有用 `sendBeacon` 作为主路径，因为当前鉴权依赖 `x-api-key` header，而 `sendBeacon` 不支持自定义 header。

## 6. Replay 采集

当前 replay 能力来自 `rrweb`：

1. `enableReplay` 打开后启动录制
2. 出错时进入错误窗口上传逻辑
3. 避免上传空事件数组
4. replay 上传走 `/v1/replay`

## 7. SDK 当前不负责的事情

这几个点要明确：

1. SDK 不上传 SourceMap
2. SDK 不做源码还原
3. SDK 不直接发飞书告警
4. SDK 不持有服务端聚合逻辑

SDK 的职责仍然是“浏览器采集和有损防抖”，不是“构建产物管理”。

## 8. SDK 当前边界

1. `sdkVersion` 还是固定值，不是构建时自动注入。
2. SourceMap 只依赖 `release` 和服务端上传记录，不会自动发现构建产物。
3. 同 session 同错仍有 60 秒防抖，这是保留设计，不是 bug。
4. 目前的 SourceMap 定位是服务端能力，不是 SDK 本地能力。

## 9. SDK 相关面试问答

### Q1：为什么客户端可以防抖，服务端不能按 fingerprint 去重？

因为客户端防抖是为了控制流量和刷屏；服务端统计必须保留真实业务语义。如果服务端按 fingerprint 粗暴去重，会直接破坏错误次数、影响人数和高频告警。

### Q2：为什么防抖键要带 sessionId？

如果只按 fingerprint 去重，那么新会话里真实复现的错误也会被错误吞掉。带 sessionId 后，新的用户会话仍能被统计到。

### Q3：为什么还要补发 occurrences？

因为防抖只减少“事件条数”，不能减少“真实发生次数”。`occurrences` 是恢复真实次数的补偿字段。
