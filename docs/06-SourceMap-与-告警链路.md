# SourceMap 与告警链路

## 1. 当前实现目标

当前 SourceMap 链路的目标不是“SDK 自动上传构建产物”，而是：

1. 业务项目接入 SDK 时带上 `release`
2. CI 把当前版本的 SourceMap 上传到 Gateway
3. Gateway 在错误详情和告警时做源码反查

这是目前更合理的职责划分。

## 2. 当前实际流程

### 业务项目侧

SDK 初始化示例：

```ts
OmniSight.init({
  appId: '10002',
  dsn: 'http://localhost:3000',
  apiKey: 'dev-api-key-omnisight',
  release: '9f3c2ab',
  sampleRate: 1,
  enableReplay: true,
});
```

### CI 侧

构建后上传 Sourcemap：

```bash
curl -X POST http://localhost:3000/v1/sourcemap \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: dev-api-key-omnisight' \
  -d '{
    "appId": "10002",
    "version": "9f3c2ab",
    "filename": "index-abc123.js",
    "mapContent": "{...}",
    "gitCommit": "9f3c2ab",
    "gitAuthor": "liuliuwenbo"
  }'
```

关键要求：

- `version` 必须和 SDK 的 `release` 一致
- `filename` 必须和浏览器错误里出现的产物 basename 一致

## 3. Gateway 如何命中 SourceMap

当前匹配策略：

1. 先把错误事件的 `filename` 归一化成 basename
2. 优先按 `appId + release + artifact` 精确命中
3. 如果没有 `release`，退化到 `appId + artifact` 下最新记录

这么做的原因很简单：

- 只按“最新同名文件”查找，版本一多就不可靠
- `release` 是真正稳定的发布标识

## 4. 当前还原结果包含什么

`SourcemapService.resolveLocation()` 当前返回：

- `release`
- `artifact`
- `originalFile`
- `originalLine`
- `originalColumn`
- `sourceContext`
- `gitCommit`
- `gitAuthor`
- `gitMessage`
- `gitBranch`

## 5. Console 错误详情现在能看到什么

1. Release
2. Artifact
3. 压缩后位置
4. 命中的源码位置
5. 命中的代码片段
6. 关联 Git 信息（通过 tags 暴露）

## 6. 飞书告警现在能看到什么

当前飞书告警已经能直接看到：

1. 应用名
2. 错误文案
3. Release
4. 压缩后位置
5. 源码位置
6. 源码片段
7. 发生次数
8. 影响用户数
9. 时间窗口
10. Git 信息

这比只发一句“某页面报错”更接近可执行的排障消息。

## 7. 当前链路没做满的地方

### 1. 还原的是“主错误位置”，不是整条 stack

目前返回的是：

- 原始 `stack`
- 加上一份 SourceMap 解析结果

不是把 stack 每一帧都重写成源码位置。

### 2. 没有自动上传插件

现在只有接口，没有现成的：

- Vite 插件
- Webpack 插件
- 发布 CLI

### 3. Sourcemap 存本地文件系统

当前是：

- `uploads/sourcemaps/...`

不是：

- S3 / OSS / MinIO

### 4. 告警没有详情页 deeplink

现在飞书告警看得到源码，但没有直接跳到 Console 某条错误详情的链接。

### 5. 代码片段权限控制没有做

如果你要上线到更严谨的环境，后续应该加：

- 是否允许在告警中带源码片段
- 片段长度和上下文行数配置
- 环境级开关

## 8. 为什么 SDK 不负责上传 SourceMap

这是一个经常被问到的问题。

答案是：因为 SourceMap 是构建产物，不是运行时采集数据。

把它交给 SDK 会带来几个问题：

1. 浏览器拿不到完整构建产物清单
2. 上传时机和权限都不对
3. 体积大
4. 可能泄露源码

正确职责划分应该是：

- SDK 负责带 `release`
- CI 负责上传 `.map`
- Gateway 负责反查

## 9. 推荐的下一步增强

1. 提供一个官方 CI 上传脚本或插件
2. 增加对象存储版本的 Sourcemap 管理
3. 增加错误详情 deeplink 到飞书告警
4. 做整条 stack 多帧 remap
