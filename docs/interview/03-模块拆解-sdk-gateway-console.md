# OmniSight 模块拆解：SDK / Gateway / Console

## 1. SDK：浏览器侧采集与上报

### 1.1 SDK 的职责

SDK 不是简单埋点，而是前端现场采集器。

当前代码里主要做了这些事：

- JS 错误采集
- `fetch` / `XMLHttpRequest` 劫持采集接口指标
- `web-vitals` 采集 LCP / CLS / TTFB / INP
- `PerformanceObserver` 采集资源加载事件
- 点击行为和路由变化采集
- 白屏检测
- rrweb 错误现场录制与上传
- 批量上报、采样、去重、防抖累计

### 1.2 SDK 核心类：`Core`

你可以把 `Core` 理解为调度中心。

它负责：

- 合并配置
- 生成公共字段（`appId/sessionId/ts/url/ua`）
- 错误指纹生成
- 会话内去重与 `occurrences` 累计
- 触发事件回调
- 把事件交给 `BatchTransport`

### 1.3 错误指纹怎么做

当前实现使用：

- `message`
- `stack` 第一帧

组合后做轻量 hash，得到 `fingerprint`。

为什么不是整个 stack？

- 整个 stack 太容易因为调用链细节变化而漂移
- 第一帧更接近“真正出错的位置”
- 对聚合来说更稳定

### 1.4 客户端防抖和真实次数恢复

这是 SDK 里最容易被面试官追问的地方。

当前逻辑：

- 同一 `session` + 同一 `fingerprint`
- 60 秒内首次错误即时上报，`occurrences = 1`
- 后续重复错误不立刻发，而是在内存里累计
- 60 秒到期或页面卸载时，补发一条聚合事件，`occurrences = N`

设计意图：

- 避免循环报错直接刷爆链路
- 同时不丢失真实次数

### 1.5 rrweb Replay 的设计

当前回放链路的关键点：

- 平时只录内存，不上传
- 错误发生后等待后置观察窗口结束
- 没有首帧录制事件时不上传空回放
- 上传的不是整段生命周期，而是错误窗口切片

你可以这样讲：

> 这不是“用户全程录屏”，而是“错误现场切片回放”。

### 1.6 SDK Q&A

#### Q1：为什么不把每个事件都立刻发出去？

因为事件非常碎，逐条发请求代价高。批量上报能明显减少网络和服务端压力。

#### Q2：为什么回放上传不能用 sendBeacon？

因为 Gateway 需要 `x-api-key` 做鉴权，而 `sendBeacon` 不支持自定义 header。当前实现用 `fetch + keepalive`。

#### Q3：为什么 `resetSession()` 后同错要重新计数？

因为会话已经变了，业务上应视作新的复现，而不是旧会话里的重复噪音。

---

## 2. Gateway：接入、聚合、查询、告警

### 2.1 Gateway 的职责

Gateway 本质上是系统中枢，负责三件大事：

- 接 SDK 的数据
- 整理并存储数据
- 给 Console 和告警模块提供查询结果

### 2.2 接入链路：`IngestController -> Bull -> IngestWorker`

关键点：

- Controller 只做鉴权、校验、入队
- Worker 做去重、富化、入库
- 去重不是按 `fingerprint`，而是按“事件级幂等 key”

当前事件级去重 key 大致包含：

- `appId`
- `sessionId`
- `type`
- `fingerprint`
- `ts`
- `occurrences`

这意味着：

- 同一条事件被重复投递会被挡住
- 同一类错误真实发生多次不会被吞掉

### 2.3 查询链路：`QueryService`

当前主要提供：

- 错误率时序
- 项目列表
- 错误聚合列表
- 错误详情
- API 耗时排行
- Web Vitals 时序

这里你最应该强调的是：

- 错误相关统计统一按 `SUM(occurrences)` 聚合
- `affectedUsers` 统一按去重 audience 统计
- 错误详情不是随便查一条，而是：最新事件 + 聚合统计 + 面包屑 + 关联 replay + Git 信息

### 2.4 高频错误扫描与告警

当前告警逻辑：

- 定时扫描最近窗口内的错误
- 按 `appId + fingerprint` 聚合
- 统计真实次数和影响人数
- Redis 冷却控制
- 发送飞书卡片

面试时要注意一句话：

> 高频错误不是“库里有多少行 error 事件”，而是“窗口内这个错误真实发生了多少次”。

### 2.5 Replay 服务

当前 `ReplayService` 做了两件事：

- `save()`：按 `session_id` 聚合回放数据
- `getBySessionId()`：按 `sessionId + appId` 查询，避免跨项目串读

这个点你现在可以明确说自己修过：

- 之前只按 `sessionId` 查，存在项目隔离漏洞
- 现在控制台请求会带 `appId`，后端也按 `appId` 过滤

### 2.6 SourceMap 服务

当前实现：

- CI 通过 JSON body 上传 `mapContent`
- Gateway 把 `.map` 内容写入本地文件系统
- 同时在 `sourcemaps` 表里记录索引和 Git 信息
- 错误详情/告警时可以根据文件名找到 Git 信息

要诚实说明：

- 当前是作品级简化版上传协议
- 生产环境更适合 multipart 或对象存储

### 2.7 Gateway Q&A

#### Q1：为什么查询层大量用 SQL 而不是 ORM？

因为这里有明显的聚合查询、时间桶查询和分位数计算，直接写 SQL 更直观，也更容易控制性能和口径。

#### Q2：为什么用 TimescaleDB？

因为核心数据是时序型事件，TimescaleDB 的 `time_bucket` 和 retention policy 非常贴合这个场景。

#### Q3：为什么错误详情既支持 fingerprint 又考虑 UUID？

因为控制台路由语义是 fingerprint，但从兼容性角度保留了 UUID 查询分支。不过只有当参数符合 UUID 格式时才走 UUID 查询，避免把普通字符串投给 `uuid` 列报错。

#### Q4：飞书告警里最重要的字段是什么？

- 错误信息
- 文件位置
- 发生次数
- 影响人数
- 时间窗口
- Git 关联信息

因为告警不是为了“告诉你有错”，而是为了“帮你判断需不需要立刻处理”。

---

## 3. Console：查询缓存、可视化和回放界面

### 3.1 Console 的职责

Console 不是埋点后台的“管理页”，而是问题定位终端。

它要把这些东西拼起来：

- 趋势
- 聚合
- 详情
- 现场

### 3.2 当前页面结构

- 概览：错误率趋势、Vitals、Top Errors
- 错误管理：错误聚合列表
- 错误详情：堆栈、面包屑、关联录像
- 行为回放：录像列表和播放器
- 性能分析：Vitals 和 API 指标
- 设置：SDK 接入说明、SourceMap 记录

### 3.3 为什么用 React Query

推荐回答：

> 监控台的核心不是表单提交，而是查询和缓存。React Query 很适合做“按条件查询、自动缓存、自动重取、加载态/错误态管理”。尤其是全局时间范围和项目切换这种场景，如果 queryKey 设计合理，页面联动会很清晰。

顺便一提，这也是这轮排查里我修掉的一个前端 bug：

- 之前不少 queryKey 只带时间范围，不带 `appId`
- 切项目时可能继续命中旧缓存
- 现在已经全部按 `appId + 查询条件` 做缓存隔离

### 3.4 rrweb-player 页面如何组织

播放器页拆成三部分：

- `useReplay`：拉数据和管理播放状态
- `Player`：封装 rrweb-player
- `EventTimeline`：展示关键事件时间轴

这样拆分的好处是：

- 播放状态和数据加载解耦
- 时间轴跳转和播放器 seek 联动清晰
- 页面组件不会被第三方播放器实例细节污染

### 3.5 Console Q&A

#### Q1：为什么全局状态用 Zustand，不用 Redux？

因为这个项目的全局状态并不复杂，主要是 `appId` 和 `timeRange`。Zustand 足够轻，API 简单，还可以在非 React 场景读状态。

#### Q2：为什么图表用 ECharts？

因为监控类场景需要时序图、折线图和较强的配置能力，ECharts 在图表表达力和可定制性上更合适。

#### Q3：为什么控制台里的数字有时看起来像字符串问题？

因为 PostgreSQL 聚合字段经常以字符串形式返回。前端 API 层已经统一做过正规化，避免每个页面自己猜类型。
