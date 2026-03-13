# OmniSight — 面试 Q&A 模拟

> 以下模拟面试官听完项目介绍后可能追问的问题，按主题分类。
> 每个问题附参考回答（第一人称），可根据自身理解调整措辞。

---

## 一、整体架构与设计决策

### Q1：为什么选择 Monorepo？多仓库不行吗？

> 核心原因是**类型共享**。SDK 定义了 6 种事件类型，Gateway 要校验这些类型，Console 要展示这些类型。如果分三个仓库，改一个字段名就要分别发 PR、发版、更新依赖，容易出现版本不一致。
>
> Monorepo 下我用 `packages/shared-types` 作为共享类型包，三个应用通过 `workspace:*` 直接引用，改一处编译期就能发现所有不兼容的地方。Turborepo 的 `^build` 机制保证共享包在应用之前构建完成。

### Q2：为什么选 Turborepo 而不是 Nx？

> 两者都能用。选 Turborepo 是因为它更轻量，配置文件就一个 `turbo.json`，只管任务编排和缓存，不侵入项目结构。Nx 功能更全但也更重，对于这个规模的项目 Turborepo 够用了。

### Q3：为什么后端选 NestJS 而不是 Express/Koa？

> NestJS 的模块化和依赖注入让我可以把上报、查询、鉴权、队列消费等职责拆到独立模块，每个模块有自己的 Controller、Service、Module，代码组织非常清晰。Express/Koa 是无骨架的，项目大了代码结构容易乱。另外 NestJS 内置了 `@nestjs/bull`、`@nestjs/swagger`、`@nestjs/config`，开箱即用，减少了很多胶水代码。

### Q4：为什么用 PostgreSQL + TimescaleDB 而不是 ClickHouse？

> 两个原因：一是**运维简单**，TimescaleDB 是 PG 的插件，用标准 SQL 就能查，docker-compose 里一行 `image: timescale/timescaledb:latest-pg15` 就搞定了。ClickHouse 需要单独部署和运维，对面试演示不友好。二是**数据量级**，这个项目的数据量不大，TimescaleDB 的 `time_bucket` 聚合 + 90 天自动保留策略完全够用。如果未来数据量上去了，可以再迁到 ClickHouse。

### Q5：为什么用 Bull Queue + Redis 而不是 Kafka？

> 同样是够用原则。Kafka 是分布式消息系统，适合每秒几十万条的吞吐量，但需要单独部署 Zookeeper/KRaft，运维成本高。Bull 基于 Redis，而 Redis 我已经用来做去重和缓存了，不需要额外部署任何服务。Bull 也支持重试、延迟队列、优先级等特性，对这个项目的数据量来说性能绰绰有余。

### Q6：如果数据量上来了，哪些地方是瓶颈，怎么优化？

> 主要三个瓶颈：
>
> 1. **数据库写入**：目前是单 Worker 单线程消费，可以增加 Worker 并发数（Bull 支持 `concurrency` 配置），或者分多个 Redis 队列做分片
> 2. **查询性能**：TimescaleDB 已经做了时间分区，但如果数据量大到 TB 级别，可以加物化视图（Continuous Aggregate）预聚合常用指标，或者换 ClickHouse
> 3. **Redis 内存**：去重 key 有 TTL 3600s 会自动过期，但如果 error 种类爆炸性增长，可以考虑真正的布隆过滤器（`BF.ADD`/`BF.EXISTS`）替代 SET NX，内存占用降一个数量级

---

## 二、SDK 深入追问

### Q7：SDK 怎么保证不影响业务性能？

> 几个方面：
>
> 1. **体积小**：核心 SDK < 15KB gzip，rrweb 和 web-vitals 做可选依赖动态 import，不用就不加载
> 2. **异步上报**：事件先进内存队列，批量 flush，不阻塞主线程
> 3. **采样降量**：默认 10% 采样率，普通事件不全量采集
> 4. **资源监听用 PerformanceObserver**：不轮询，浏览器异步推送，开销忽略不计
> 5. **白屏检测是一次性的 setTimeout**：不是持续轮询 DOM

### Q8：XHR 和 Fetch 劫持具体是怎么实现的？

> **XHR**：保存 `XMLHttpRequest.prototype.open` 和 `send` 的原始引用，然后重写。在重写的 `open` 中记录请求方法和 URL，在重写的 `send` 中记录开始时间并监听 `loadend` 事件。`loadend` 里用 `performance.now()` 算耗时，再调原始方法。
>
> **Fetch**：保存 `window.fetch` 的原始引用，替换为包装函数。包装函数里记录开始时间，调用原始 fetch，在 `.then()` 和 `.catch()` 里计算耗时和状态码。
>
> 两种方式都需要判断 `isSdkRequest()` 过滤自身上报请求，否则会无限循环。

### Q9：`isSdkRequest` 是怎么判断的？

> 检查请求 URL 是否包含 SDK 配置的 `dsn` 地址并且路径中包含 `/v1/`。比如 dsn 是 `http://localhost:3000`，那所有发往 `http://localhost:3000/v1/*` 的请求都被视为 SDK 自身请求，不采集。

### Q10：为什么上报用 Beacon API 而不是 Fetch？

> 两个原因：
>
> 1. **页面关闭时可靠性**：Beacon API 在 `unload`/`beforeunload` 时仍然能可靠发送，浏览器会在后台完成请求。Fetch 在页面关闭时可能被取消
> 2. **避免自循环**：我已经劫持了 Fetch 做接口采集，如果上报也用 Fetch，虽然 `isSdkRequest` 能过滤，但还是多了一层不必要的处理。Beacon 不走 Fetch，从根源上避免了
>
> 降级方案用的是原生 XHR（不是 Fetch），同样是为了不触发 Fetch 劫持。

### Q11：Beacon API 有什么限制？

> 主要是**64KB 的请求体大小限制**。我在 `beacon.ts` 里用 `new Blob([json])` 计算实际字节大小（不能用 `string.length`，因为中文等多字节字符一个字符可能占 3 个字节），超过 64KB 自动降级到 XHR。

### Q12：采样为什么基于 sessionId 哈希？直接 Math.random() 不行吗？

> `Math.random()` 的问题是**行为碎片化**。同一个用户的一次访问中，可能点击事件被采中了，但紧接着的路由变化没被采中，这样你看到的用户行为链路是断裂的，没法还原完整的用户旅程。
>
> 基于 sessionId 哈希，同一个会话的采样结果是确定性的——要么全采，要么全不采。哈希函数用的 djb2，输入相同的 sessionId 永远得到相同的哈希值。这样被采样到的用户，他的所有行为数据都是完整的。

### Q13：LRU 去重是怎么用 Map 实现的？

> JavaScript 的 `Map` 保证插入顺序。我利用这个特性：
>
> - **插入**：直接 `map.set(fingerprint, timestamp)`
> - **命中**：先 `map.delete(fingerprint)` 再 `map.set(fingerprint, now)`，把它移到 Map 的末尾（最新位置）
> - **淘汰**：当 Map 大小超过容量上限（100），用 `map.keys().next().value` 取到第一个 key（最旧的），删掉
> - **过期**：检查 value 是否超过 60 秒，超过了也删掉
>
> 这种实现比经典的双向链表 + 哈希表简洁得多，性能在这个量级下完全足够。

### Q14：错误指纹是怎么生成的？

> `message + 堆栈第一帧` 做 djb2 哈希。原理是：同一个代码位置抛出的同一个错误消息，指纹一定相同；不同位置或不同消息的错误，指纹大概率不同。只取第一帧是因为深层调用栈可能因为闭包、异步等原因不一致，第一帧是最能代表错误发生位置的。

### Q15：rrweb 录制的 Ring Buffer 是怎么实现的？

> 不是用固定大小的数组，而是用 `while` 循环裁剪。rrweb 的 `emit` 回调每次推一个事件到数组末尾，然后检查数组第一个事件的时间戳是否比最后一个早了 30 秒以上，是的话就 `shift()` 掉。这样数组里始终只保留最近 30 秒的事件。
>
> 用 `while + shift()` 而不是 `filter` 创建新数组，是为了避免在每次 `emit`（频率很高）时都产生垃圾回收压力。

### Q16：什么时候触发录像上传？

> 只有错误发生时才上传。具体流程：
>
> 1. 平时 rrweb 持续录制，Ring Buffer 保留最近 30 秒
> 2. SDK 的 `core.ts` 触发 `error` 事件时，通知 replay 采集器
> 3. replay 采集器设置 `errorTriggered = true`，开始一个 10 秒的延迟
> 4. 10 秒后把 Ring Buffer 里全部事件（30s + 10s = 最多 40s）上传
> 5. `errorTriggered` 防止 10 秒内多次错误重复触发上传
>
> 这个策略让录像存储成本降低了约 80%——大部分正常访问的录像根本不会被上传。

### Q17：Web Vitals 为什么用动态 import？

> 因为 `web-vitals` 是一个外部库，不是每个接入方都需要。如果用静态 import，即使业务方没装这个包，打包也会报错。动态 `import('web-vitals')` 在运行时加载，如果包不存在会被 catch 住，只是静默跳过而不崩溃。同时 Rollup 配置里把 `web-vitals` 设为 external，不打进 SDK 的 bundle，保持体积小。

### Q18：白屏检测 3 秒延迟的依据是什么？太短或太长会怎样？

> 太短（比如 1 秒）：SPA 框架可能还在加载数据和首次渲染，React 的 hydration、Vue 的 mount 都需要时间，会导致大量误报。
>
> 太长（比如 10 秒）：用户可能已经关闭页面或跳转了，检测结果没有实际意义。
>
> 3 秒是经验值——Google 的 Core Web Vitals 把 2.5 秒作为 LCP "Good" 的阈值，也就是说大多数正常页面应该在 2.5 秒内完成首屏渲染。给 0.5 秒的余量，3 秒后还是白屏就大概率是真的出问题了。

---

## 三、Gateway 追问

### Q19：为什么 ValidationPipe 的 whitelist 设为 false？

> 因为 SDK 上报的事件是一个**多态结构**——同一个数组里可能有 error 事件（带 `message`、`stack`）、api 事件（带 `apiUrl`、`duration`）、vital 事件（带 `name`、`value`）。DTO 里只声明了所有事件共有的字段（`type`、`appId`、`sessionId`、`ts`），如果开启 whitelist，这些特有字段会被自动剥离掉，入库后 `payload` 就丢了核心数据。
>
> 所以我的策略是：核心字段强校验（type 必须是枚举值、appId 不能为空），动态字段保留不校验。

### Q20：Bull Queue 的重试机制是怎么配的？

> 三次重试，指数退避。Bull 的配置是 `attempts: 3, backoff: { type: 'exponential', delay: 2000 }`，也就是第一次失败后 2 秒重试，第二次 4 秒，第三次 8 秒。三次都失败了 Job 会进入 `failed` 状态。`removeOnComplete: true` 让成功处理的 Job 自动清理，不占 Redis 内存。

### Q21：Redis 去重为什么用 SET NX EX 而不是真正的布隆过滤器？

> 两个原因：
>
> 1. **简单性**：`SET key NX EX 3600` 一行命令就搞定，不需要额外安装 RedisBloom 模块
> 2. **可删除性**：布隆过滤器只能添加不能删除，SET NX 的 key 会自动过期（TTL 1 小时），不需要手动管理
>
> 缺点是每个 key 占的内存比布隆过滤器大。如果 error 的 fingerprint 种类达到百万级别，可以考虑切换到 `BF.ADD`/`BF.EXISTS`。但目前这个数据规模，SET NX 完全够用。

### Q22：API Key 鉴权为什么要两层缓存？

> 每个 SDK 上报请求都要校验 API Key。如果每次都查数据库，在高并发下会给 PG 带来很大压力。所以我加了 Redis 缓存：第一次查 PG 后把 `apikey:{key} → projectId` 写入 Redis，TTL 5 分钟。后续请求先查 Redis，命中了直接放行，不查 PG。
>
> 大部分 SDK 实例在 5 分钟内会发多次请求（批量上报间隔只有 5 秒），所以 Redis 命中率非常高，PG 的压力可以忽略不计。

### Q23：`time_bucket` 和 `date_trunc` 有什么区别？为什么要做降级？

> `time_bucket` 是 TimescaleDB 扩展的函数，支持任意时间间隔（比如 5 minutes、15 minutes），而 PG 原生的 `date_trunc` 只支持固定精度（minute、hour、day）。
>
> 我做降级是为了兼容没装 TimescaleDB 的 PG 环境。代码先尝试 `time_bucket`，如果 catch 到 "function time_bucket does not exist" 这个错误，就自动切换到 `date_trunc`，并把请求的间隔映射到最接近的精度。

### Q24：SourceMap 的路径穿越是什么意思？怎么防的？

> 路径穿越（Path Traversal）是指攻击者通过构造 `../../etc/passwd` 这样的路径，让服务器写文件到预期目录之外。因为 SourceMap 上传要把文件存到 `uploads/sourcemaps/{appId}/{version}/{filename}.map`，如果 appId 或 filename 里包含 `..`，就可能写到任意位置。
>
> 防护方式是在 DTO 层用 `@Matches(/^[a-zA-Z0-9._-]+$/)` 校验这三个字段，只允许字母、数字、点、下划线、连字符，从根源上禁止 `..`、`/`、`\` 等危险字符。

### Q25：录像的 ON CONFLICT 合并是怎么做的？

> 同一个 session 可能分多次上传录像片段（比如错误窗口策略下，先上传前 30 秒，10 秒后再上传后续部分）。SQL 是 `INSERT ... ON CONFLICT (session_id) DO UPDATE SET events = replay_sessions.events || $3::jsonb`，用 JSONB 的 `||` 操作符把新事件数组拼接到已有数组末尾，而不是覆盖。duration 用 `GREATEST` 取最大值。

---

## 四、Console 追问

### Q26：为什么选 Zustand 而不是 Redux？

> 三个理由：
>
> 1. **无 Provider**：Zustand 不需要在组件树顶部包 `<Provider>`，store 可以在 React 外直接调用 `getState()`。我在 WebSocket 的 `onmessage` 回调里需要往 alert store 添加告警，Zustand 直接 `useAlertStore.getState().addAlert()` 就行
> 2. **代码量少**：一个 store 就是一个 `create()` 调用，几行代码，没有 action type、reducer、selector 那套模板代码
> 3. **性能好**：Zustand 默认只在 selector 返回的值变化时才重渲染，不需要手动 memo

### Q27：React Query 和 Zustand 的分工是怎么定的？

> 原则很简单：**服务端来的数据用 React Query，客户端自己产生的状态用 Zustand**。
>
> - 错误列表、指标数据、回放录像——这些是从 Gateway API 拿的，属于服务端状态，React Query 负责缓存、失效、重试
> - 当前选中的 appId、时间范围、告警列表——这些是用户操作产生的客户端状态，Zustand 管理
>
> 两者配合：React Query 的 queryKey 里包含 Zustand 的 timeRange，时间范围变了 queryKey 就变了，自动重新请求。

### Q28：WebSocket 重连用的是什么策略？

> **指数退避**：初始间隔 1 秒，每次翻倍，最大 30 秒。也就是 1s → 2s → 4s → 8s → 16s → 30s → 30s → ...
>
> 另外每 30 秒发一次 `ping` 心跳，保持连接不被中间件（Nginx、负载均衡）超时关闭。
>
> 有一个细节：WebSocket `onmessage` 里调用 Zustand 的 `addAlert`，如果直接引用 `addAlert`，它会成为 `useEffect` 的依赖，每次 store 更新都可能导致 `connect` 函数被重建，从而频繁重连。我用 `useRef` 包了一层，`addAlertRef.current` 始终是最新的函数引用，但不会触发 `useEffect` 重新执行。

### Q29：rrweb-player 的集成遇到了什么坑？

> rrweb-player v2 是 alpha 版本，API 和文档有不少出入：
>
> 1. 构造函数接受 `events` 参数，但类型系统要求的是 rrweb 自定义类型，实际传 `any[]` 就行
> 2. `play()`、`pause()`、`setSpeed()` 这些方法不在 player 实例上，要通过 `player.getReplayer()` 拿到底层 Replayer 实例才能调用
> 3. 获取当前播放时间用 `getReplayer().getCurrentTime()`，而不是文档里说的 `getMetaData().totalTime`
> 4. 跳转到指定时间用 `getReplayer().play(timestamp)`（从指定时间开始播放）
>
> 这些都是翻 rrweb 源码才搞定的，文档几乎没有涵盖。

### Q30：页面懒加载是怎么做的？

> 用 `React.lazy()` + `Suspense`。每个页面组件都是 `React.lazy(() => import('./pages/xxx'))`，Vite 会自动把每个页面拆成独立 chunk。用户首次访问某个页面时才下载对应的 JS，首屏只加载当前路由需要的代码。`Suspense` 的 fallback 是一个 loading 组件。

---

## 五、性能与优化

### Q31：SDK 怎么控制打包体积在 15KB 以内？

> 几个关键措施：
>
> 1. **手写采集逻辑**：不依赖 Sentry、TraceKit 等大型库
> 2. **可选依赖外置**：rrweb（~50KB）和 web-vitals（~3KB）在 Rollup 配置里设为 external，不打进 bundle
> 3. **动态 import**：运行时按需加载可选依赖，没装不加载
> 4. **`sideEffects: false`**：让 tree-shaking 移除未使用的导出
> 5. **terser 压缩**：`@rollup/plugin-terser` 做代码压缩

### Q32：批量上报的 20 条和 5 秒是怎么定的？

> 这是性能和实时性的平衡：
>
> - **20 条**：一批上报的网络开销（建连、HTTP 头等）是固定的，攒得越多分摊到每条的开销越小。但攒太多有丢数据的风险（页面关闭前没发出去）。20 条的 JSON 大约 5-10KB，远在 Beacon 的 64KB 限制内
> - **5 秒**：保证即使事件产生速率很低（比如用户只是静静看页面），也能在 5 秒内把已有的事件发出去，保证数据时效性

### Q33：如果用户网络很差，上报失败怎么办？

> 目前的设计是**发出即忘**（fire-and-forget）。Beacon API 本身是 "best effort" 的，浏览器会尽力发送但不保证成功。XHR 降级也不处理响应。
>
> 如果要更可靠，可以加一个失败重试队列（用 `IndexedDB` 存失败的事件，下次页面加载时重发），但这会增加 SDK 复杂度和体积。对于监控系统来说，丢少量数据是可以接受的——重要的是统计趋势而不是每条数据都精确。

---

## 六、安全与隐私

### Q34：用户 ID 匿名化用的什么算法？为什么选 SHA-256？

> SHA-256 是单向哈希，无法从哈希值反推原始 ID，满足数据最小化原则。优先用浏览器原生的 Web Crypto API（`crypto.subtle.digest('SHA-256', ...)`），因为它是硬件加速的，比纯 JS 实现快得多。
>
> 降级方案用双重 djb2 哈希 + 十六进制编码，虽然安全性不如 SHA-256（碰撞概率更高），但至少保证了单向性。
>
> 为什么不用 MD5？因为 MD5 已经被认为不够安全（可以找到碰撞），Web Crypto API 也不支持 MD5。

### Q35：rrweb 录制怎么处理敏感数据？

> 三层保护：
>
> 1. **密码框始终遮盖**：`maskInputOptions: { password: true }` 是默认开启的
> 2. **自定义屏蔽元素**：给 DOM 元素加 `data-no-record` 属性，rrweb 录制时会跳过这些元素
> 3. **用户可配置**：SDK 初始化时可以传 `privacy.blockSelectors` 数组，指定额外的 CSS 选择器来屏蔽特定区域

---

## 七、数据库设计

### Q36：events 表为什么要用 TimescaleDB 的超表？

> 监控数据的特点是**写多读少、时序性强**。TimescaleDB 把超表按时间自动分区（默认 7 天一个分区），查询时只扫描相关时间范围的分区，不需要全表扫描。另外 `time_bucket` 函数做时间聚合比 `GROUP BY date_trunc` 更灵活（支持任意时间间隔，比如 5 分钟、15 分钟）。
>
> 还配了 90 天的自动保留策略（`add_retention_policy`），超过 90 天的数据自动删除，不需要手动清理。

### Q37：为什么 payload 用 JSONB 而不是拆成多列？

> 因为不同类型的事件有完全不同的字段结构。error 事件有 `message`、`stack`，api 事件有 `apiUrl`、`duration`，vital 事件有 `name`、`value`。如果拆列，要么建一张超宽表（大量 NULL），要么建 6 张子表（JOIN 复杂）。
>
> JSONB 让所有事件可以存进同一张表，查询时用 `payload->>'fieldName'` 提取。PostgreSQL 对 JSONB 有 GIN 索引支持，查询性能是可以接受的。

### Q38：events 表的索引是怎么设计的？

> 三个索引：
>
> 1. `(app_id, type, ts DESC)`：最常用的查询模式——"某个应用某种类型的事件按时间倒序"
> 2. `(fingerprint, ts DESC)`：错误详情页查询——"某个指纹的所有出现记录"
> 3. `(session_id)`：回放关联查询——"某个会话的所有事件"
>
> 主键是 `(id, ts)`，因为 TimescaleDB 要求分区键（ts）必须包含在主键中。

---

## 八、与竞品对比

### Q39：跟 Sentry 比，你的方案有什么优劣？

> **优势**：
> 1. **SDK 更轻量**：Sentry SDK 约 90KB gzip，我的 < 15KB
> 2. **录像回放**：Sentry 的 Session Replay 是独立付费功能，我内置了 rrweb 录像且有错误窗口策略优化
> 3. **完全自控**：数据不出服务器，适合对数据合规有要求的场景
>
> **劣势**：
> 1. Sentry 有成熟的 SourceMap 堆栈还原（我的是预留了接口但还原逻辑未完全实现）
> 2. Sentry 支持多语言（Python、Java、Go），我只支持 Web 前端
> 3. Sentry 有完整的 Issue 管理、分配、通知，我只有基础的告警
> 4. Sentry 经过大规模生产验证，我的是项目级别

### Q40：如果让你继续迭代，下一步做什么？

> 按优先级：
>
> 1. **SourceMap 堆栈还原**：在错误详情页实时还原压缩后的行列号，展示原始源码上下文
> 2. **告警规则引擎**：支持配置规则（如 "5 分钟内错误率 > 5% 触发告警"），通过邮件/WebHook 推送
> 3. **白屏检测增强**：从当前的子元素数量检查升级为多点采样（`document.elementFromPoint`），加 MutationObserver 监听 DOM 变化
> 4. **性能 Profile**：集成 Long Task API 和 Layout Shift Attribution，定位具体哪个脚本/元素导致了性能问题
> 5. **灰度发布关联**：SDK 上报时携带应用版本号，在控制台上支持按版本对比错误率趋势

---

## 九、代码细节追问（可能的编码题级别问题）

### Q41：djb2 哈希算法里 `(hash << 5) - hash` 是什么意思？

> 位运算实现乘法优化。`hash << 5` 等于 `hash * 32`，减去 `hash` 就是 `hash * 31`。31 是一个常用的哈希乘子，因为：1）它是质数，能减少哈希碰撞；2）`31 = 2^5 - 1`，可以用位运算代替乘法，CPU 执行更快。Java 的 `String.hashCode()` 也用的 31。

### Q42：`children` 和 `childNodes` 的区别？

> `children` 只包含 Element 节点（`nodeType === 1`），也就是真正的 DOM 元素标签。`childNodes` 包含所有节点类型——Element、Text（文本节点）、Comment（注释节点）等。
>
> 白屏检测用 `children` 是因为一个容器可能包含空白文本节点（比如代码缩进产生的换行），这时候 `childNodes.length > 0` 但页面实际上还是白的。`children.length === 0` 才是准确的判断。

### Q43：为什么 Map 可以实现 LRU？

> ES6 规范保证 `Map` 的迭代顺序就是插入顺序。利用这个特性：
>
> - 新元素 `set` 后在末尾
> - 已有元素先 `delete` 再 `set`，相当于移到末尾（最近使用）
> - `keys().next().value` 返回第一个 key（最久未使用）
>
> 这比经典的双向链表 + 哈希表实现简洁得多，但只适用于 JavaScript 环境（其他语言的 Map/HashMap 不保证顺序）。

### Q44：`performance.now()` 和 `Date.now()` 有什么区别？

> 1. **精度**：`performance.now()` 返回微秒级精度的浮点数，`Date.now()` 返回毫秒级整数
> 2. **基准**：`performance.now()` 从页面导航开始计时（不受系统时间修改影响），`Date.now()` 是 Unix 时间戳
> 3. **单调性**：`performance.now()` 是单调递增的，`Date.now()` 可能因为系统时间调整而回退
>
> 测量接口耗时用 `performance.now()` 更准确，不会受时钟偏移影响。

### Q45：`loadend` 和 `load`/`error` 事件有什么区别？

> `load` 只在请求成功时触发，`error` 只在网络错误时触发，`abort` 在请求被取消时触发。如果我分别监听这三个事件，代码会重复三遍。
>
> `loadend` 在 **所有这三种情况** 之后都会触发，一个监听器就搞定了。在 `loadend` 里统一计算耗时和提取状态码，代码更简洁也不容易遗漏场景。
