# @omnisight/sdk

OmniSight 前端采集 SDK — 轻量级、无侵入的全链路可观测性数据采集工具

## 📦 安装

```bash
# 使用 pnpm
pnpm add @omnisight/sdk

# 使用 npm
npm install @omnisight/sdk

# 使用 yarn
yarn add @omnisight/sdk
```

## 🚀 快速开始

### 方式 1：在现代前端项目中使用（推荐）

适用于 Vite、Webpack、Rollup 等构建工具：

```javascript
import OmniSight from '@omnisight/sdk';

const tracker = OmniSight.init({
  appId: 'your-app-id',
  dsn: 'http://localhost:3000/v1/ingest',
  apiKey: 'your-api-key',
  enableError: true,
  enablePerformance: true,
  debug: true,
});

console.log('SDK 已初始化', tracker);
```

### 方式 2：在普通 HTML 文件中使用

直接通过 `<script>` 标签引入 IIFE 版本：

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <!-- 引入 SDK -->
  <script src="./node_modules/@omnisight/sdk/dist/omnisight.iife.js"></script>
  
  <!-- 使用全局变量 OmniSight -->
  <script>
    const tracker = OmniSight.init({
      appId: 'your-app-id',
      dsn: 'http://localhost:3000/v1/ingest',
      apiKey: 'your-api-key',
      debug: true,
    });
    
    console.log('SDK 已初始化', tracker);
  </script>
</body>
</html>
```

### 方式 3：使用 ES 模块（无需构建工具）

使用现代浏览器的 Import Maps：

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
  <script type="importmap">
    {
      "imports": {
        "@omnisight/sdk": "./node_modules/@omnisight/sdk/dist/omnisight.esm.js"
      }
    }
  </script>
</head>
<body>
  <script type="module">
    import OmniSight from '@omnisight/sdk';
    
    const tracker = OmniSight.init({
      appId: 'your-app-id',
      dsn: 'http://localhost:3000/v1/ingest',
      apiKey: 'your-api-key',
    });
    
    console.log('SDK 已初始化', tracker);
  </script>
</body>
</html>
```

## 📚 配置选项

```typescript
OmniSight.init({
  // 应用 ID（必填）
  appId: 'your-app-id',
  
  // 数据接收地址（必填）
  dsn: 'http://localhost:3000/v1/ingest',
  
  // API 密钥（必填）
  // 必须在 Gateway 中注册的项目 api_key
  // Gateway 会通过 ApiKeyGuard 验证此 key 的合法性
  apiKey: 'your-api-key',
  
  // 采样率（可选，默认 0.1）
  sampleRate: 0.1,
  
  // 是否启用录制功能（可选，默认 false）
  enableReplay: false,
  
  // 隐私配置（可选）
  privacy: {
    maskInputs: true,           // 是否遮盖输入框
    blockSelectors: ['.sensitive'],  // 完全屏蔽录制的元素选择器
  },
  
  // 是否开启调试模式（可选，默认 false）
  debug: true,
  
  // 用户 ID（可选）
  userId: 'user-123',
});
```

## 🔐 API Key 身份验证

SDK 使用 API Key 进行身份验证，确保数据安全：

1. **获取 API Key**：在 Gateway 管理后台注册项目，获取唯一的 `apiKey`
2. **配置 API Key**：在 SDK 初始化时传入 `apiKey` 参数
3. **自动验证**：SDK 会在所有请求的 header 中携带 `x-api-key`，Gateway 会自动验证

**重要提示**：
- API Key 是项目唯一标识，请妥善保管，不要泄露
- 每个项目的 API Key 都是独立的，不能混用
- 如果 API Key 泄露，请立即在管理后台重新生成

## 🎯 功能特性

### 1. 错误采集
自动捕获 JavaScript 错误和未处理的 Promise 拒绝：

```javascript
// 自动捕获
window.onerror = ...
window.onunhandledrejection = ...

// 手动捕获
tracker.capture({
  type: 'error',
  message: 'Custom error',
  stack: new Error().stack,
});
```

### 2. 性能采集
自动采集 Web Vitals 指标（需要安装 `web-vitals`）：

```bash
pnpm add web-vitals
```

采集的指标：
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)
- INP (Interaction to Next Paint)

### 3. API 监控
自动监控所有 XHR 和 Fetch 请求：

```javascript
// 自动采集所有 API 请求
// 包括：请求方法、URL、状态码、耗时等
```

### 4. 用户行为
自动采集用户点击和路由变化：

```javascript
// 自动采集：
// - 点击事件
// - 路由变化（hashchange、popstate、pushState、replaceState）
```

### 5. 资源加载
自动监控资源加载性能：

```javascript
// 自动采集所有资源加载：
// - JS、CSS、图片、字体等
// - 包括：加载时间、传输大小等
```

### 6. 白屏检测
检测页面是否出现白屏：

```javascript
// 自动检测 SPA 应用的白屏问题
// 检测 #root 或 #app 容器是否为空
```

### 7. 录制功能
录制用户操作（需要安装 `rrweb`）：

```bash
pnpm add rrweb
```

```javascript
OmniSight.init({
  enableReplay: true,  // 启用录制
  // ... 其他配置
});
```

## 🔧 API 文档

### `OmniSight.init(config)`
初始化 SDK，返回 tracker 实例。

### `tracker.capture(event)`
手动捕获事件：

```javascript
tracker.capture({
  type: 'error',
  message: 'Custom error',
  stack: '...',
});
```

### `tracker.setUserId(userId)`
设置用户 ID：

```javascript
tracker.setUserId('user-123');
```

### `tracker.getConfig()`
获取当前配置：

```javascript
const config = tracker.getConfig();
console.log(config);
```

### `tracker.destroy()`
销毁 SDK 实例：

```javascript
tracker.destroy();
```

## 📝 示例

查看 `example.html` 文件获取完整示例。

## 🔍 常见问题

### Q: 为什么在浏览器中直接使用 `import '@omnisight/sdk'` 会报错？

A: 浏览器不支持裸模块标识符（bare module specifier）。你需要：
1. 使用构建工具（Vite、Webpack 等）
2. 使用 IIFE 版本 + `<script>` 标签
3. 使用 Import Maps

### Q: SDK 支持哪些浏览器？

A: 支持所有现代浏览器（Chrome、Firefox、Safari、Edge）。

### Q: SDK 会影响页面性能吗？

A: 不会。SDK 采用以下优化策略：
- 采样率控制（默认 10%）
- 批量上传（每 5 秒或 20 条）
- 使用 sendBeacon API
- 轻量级设计（核心 < 15KB gzip）

## 📄 License

MIT
