# Console 设计与实现

## 1. 技术栈

`apps/console` 使用：

- React 18
- Vite
- React Router
- React Query
- Zustand
- Axios
- ECharts
- rrweb-player

## 2. 页面结构

当前核心页面：

- 概览页 `overview`
- 错误列表 `errors`
- 错误详情 `errors/:fingerprint`
- replay 列表 `replay`
- replay 播放器 `replay/player/:sessionId`
- 性能页 `performance`
- SourceMap 管理页 `settings/sourcemap`

## 3. 数据访问方式

前端通过统一的 `apiClient` 调用 `/v1` 接口。

关键约定：

1. `apiClient` 会自动注入 `appId`
2. React Query 的 `queryKey` 已补齐 `appId`
3. 这样切项目时不会复用错误缓存

## 4. 错误页面逻辑

### 错误列表

展示的是聚合后的错误组，不是单条 event。

关键字段：

- `count`：真实发生次数，已经按 `occurrences` 聚合
- `affectedUsers`：去重后的 audience 数
- `fingerprint`：跳转详情页的主键

### 错误详情

当前已展示：

1. message
2. count / affectedUsers / firstSeen / lastSeen
3. breadcrumbs
4. replay link
5. SourceMap 命中结果：
   - release
   - artifact
   - 原始源码位置
   - 压缩后位置
   - 源码片段
6. 结构化多帧映射栈
7. 原始 stack 折叠查看

注意：当前页面会同时展示“主错误单点摘要 + 多帧映射栈 + 原始 stack”，方便校验映射是否正确。

## 5. Replay 页面

### 列表页

展示 replay session 列表。

### 播放页

使用 `rrweb-player` 回放用户操作。

当前已和错误详情页做 session 关联。

## 6. 性能页

当前已有：

- API 指标
- Vitals 指标

当前不完整：

- 资源性能聚合不是完整落地状态

## 7. SourceMap 管理页

当前已经接了真实接口，不再是纯 mock。

能做：

1. 查看已上传的 SourceMap 记录
2. 看到 appId / version / filename / Git 信息

## 8. Console 当前边界

1. 没有真正的实时告警推送展示。
2. 部分性能维度仍偏演示型，不是完整 APM 控制台。
3. SourceMap 详情页还没有独立的深入查看能力，当前主要挂在错误详情上。

## 9. Console 相关面试问答

### Q1：为什么要用 React Query？

因为这个项目本质上是一个数据查询型控制台。React Query 可以统一管理请求状态、缓存、失效和重试，比手写 `useEffect + useState` 更适合这种场景。

### Q2：为什么 queryKey 必须带 appId？

因为这个系统是多项目的。之前没把 appId 放进 queryKey 时，切项目会命中旧缓存，页面显示的是上一个项目的数据。

### Q3：错误详情为什么同时显示“压缩后位置”和“源码位置”？

因为线上排查常常需要双向对照：一边看浏览器原始报错，一边看服务端根据 Sourcemap 还原后的源码位置，才能判断映射是否准确。
