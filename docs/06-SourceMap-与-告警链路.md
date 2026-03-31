# SourceMap 与告警链路

## 1. 当前实现目标

当前 SourceMap 链路的目标不是“SDK 在浏览器里上传构建产物”，而是：

1. 构建阶段自动生成并注入 `release`
2. 构建完成后自动上传当前版本的 SourceMap 到 Gateway
3. Gateway 在错误详情和告警时做主错误定位和多帧 stack 反查

这是目前更合理的职责划分。

## 2. 当前实际流程

### 业务项目侧

SDK 初始化示例：

```ts
OmniSight.init({
  appId: '10002',
  dsn: 'http://localhost:3000',
  apiKey: 'dev-api-key-omnisight',
  sampleRate: 1,
  enableReplay: true,
});
```

如果已经接入 `@omnisight/build-tools` 的 Vite 插件，通常不需要手写 `release`。

### 构建工具侧

Vite 插件示例：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { omniSightVitePlugin } from '@omnisight/build-tools';

export default defineConfig({
  plugins: [
    react(),
    omniSightVitePlugin({
      appId: '10002',
      dsn: 'http://localhost:3000',
      apiKey: 'dev-api-key-omnisight',
    }),
  ],
});
```

### CI / CLI 侧

构建后也可以显式调用 CLI 上传 Sourcemap：

```bash
npx omnisight-upload-sourcemaps \
  --app-id 10002 \
  --dsn http://localhost:3000 \
  --api-key dev-api-key-omnisight \
  --dir dist
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

`SourcemapService.resolveLocation()` 当前返回主错误位置摘要：

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

`SourcemapService.resolveStack()` 当前返回结构化多帧映射结果：

- `raw`
- `functionName`
- `compiledFile / compiledLine / compiledColumn`
- `originalFile / originalLine / originalColumn`
- `artifact`
- `release`
- `mapped`

## 5. Console 错误详情现在能看到什么

1. Release
2. Artifact
3. 压缩后位置
4. 命中的源码位置
5. 命中的代码片段
6. 结构化多帧映射栈
7. 关联 Git 信息（通过 tags 暴露）

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
11. 错误详情 deeplink
12. Replay deeplink（如果该错误关联到了有效录像）

这比只发一句“某页面报错”更接近可执行的排障消息。

## 7. 当前链路没做满的地方

### 1. 还原已经覆盖常见浏览器栈，但还不是所有运行时格式

当前已支持 Chrome / Node / Firefox 常见 stack 帧的多帧 remap。  
但像 `eval`、`native`、非常规运行时格式，仍然会降级保留原始帧。

### 2. Sourcemap 存本地文件系统

当前是：

- `uploads/sourcemaps/...`

不是：

- S3 / OSS / MinIO

### 3. 代码片段权限控制没有做

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

1. 补 Webpack 官方插件
2. 增加对象存储版本的 Sourcemap 管理
3. 做更精确的资产映射（manifest 驱动）
4. 做源码片段权限开关与脱敏策略
