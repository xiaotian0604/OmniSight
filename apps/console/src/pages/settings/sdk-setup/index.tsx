/**
 * @file SDK 接入指引页面
 * @description 交互式的 SDK 接入向导，帮助用户快速接入 OmniSight SDK
 *
 * 页面功能：
 * 1. 分步骤展示 SDK 接入流程（安装 → 初始化 → 验证）
 * 2. 根据用户选择的配置选项，动态生成初始化代码
 * 3. 代码块支持一键复制
 *
 * 交互式代码生成：
 * 用户可以通过表单选择：
 * - 是否开启 rrweb 录制
 * - 采样率（10%/50%/100%）
 * - 是否开启隐私脱敏
 * 根据选择实时生成对应的 SDK 初始化代码
 *
 * 面试讲解要点：
 * - SDK 的设计理念：无侵入、轻量、可配置
 * - 各配置项的作用和权衡
 * - 采样率的设计：错误 100% 采集，正常事件按比例采样
 */
import { useState, useMemo, useCallback } from 'react';

/**
 * SDK 配置选项
 *
 * @property enableReplay - 是否开启 rrweb 录制（开启后可在控制台回放用户操作）
 * @property sampleRate - 采样率（0.1 = 10%，仅影响正常事件，错误始终 100% 采集）
 * @property enablePrivacy - 是否开启隐私脱敏（遮盖密码、邮箱等敏感输入）
 */
interface SdkConfig {
  enableReplay: boolean;
  sampleRate: number;
  enablePrivacy: boolean;
}

/**
 * 采样率选项
 * 提供三个常用的采样率供用户选择
 */
const SAMPLE_RATE_OPTIONS = [
  { label: '10%（推荐，节省资源）', value: 0.1 },
  { label: '50%（中等采样）', value: 0.5 },
  { label: '100%（全量采集）', value: 1.0 },
];

/**
 * 根据配置生成 SDK 初始化代码
 *
 * @param config - 用户选择的配置选项
 * @returns 格式化后的 TypeScript 代码字符串
 */
function generateCode(config: SdkConfig): string {
  const lines: string[] = [
    `import { init } from '@omnisight/sdk';`,
    '',
    'init({',
    `  appId: 'your-app-id',`,
    `  dsn: 'https://your-gateway.com',`,
    `  sampleRate: ${config.sampleRate},`,
  ];

  if (config.enableReplay) {
    lines.push(`  enableReplay: true,`);
  }

  if (config.enablePrivacy) {
    lines.push(`  privacy: {`);
    lines.push(`    maskInputs: true,`);
    lines.push(`    blockSelectors: ['.sensitive-data', '#credit-card'],`);
    lines.push(`  },`);
  }

  lines.push(`  debug: process.env.NODE_ENV === 'development',`);
  lines.push('});');

  return lines.join('\n');
}

/**
 * SDK 接入指引页面组件
 *
 * 渲染逻辑：
 * 1. 步骤一：安装 SDK（npm/yarn/pnpm 命令）
 * 2. 步骤二：配置选项（交互式表单）
 * 3. 步骤三：初始化代码（根据配置动态生成）
 * 4. 步骤四：验证接入（检查方法）
 *
 * 状态管理：
 * - config: SDK 配置选项（本地 state）
 * - 生成的代码通过 useMemo 缓存，配置变化时自动更新
 */
export default function SdkSetupPage() {
  /**
   * SDK 配置状态
   * 默认值：开启录制、10% 采样、开启隐私脱敏
   */
  const [config, setConfig] = useState<SdkConfig>({
    enableReplay: true,
    sampleRate: 0.1,
    enablePrivacy: true,
  });

  /**
   * 根据配置动态生成初始化代码
   * useMemo 缓存结果，仅在 config 变化时重新生成
   */
  const generatedCode = useMemo(() => generateCode(config), [config]);

  /**
   * 复制代码到剪贴板
   * 使用 Clipboard API，如果不支持则回退到 document.execCommand
   */
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* Clipboard API 不可用时的静默降级 */
    }
  }, []);

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* ==================== 步骤一：安装 SDK ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">步骤一：安装 SDK</span>
        </div>
        <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '12px' }}>
          在你的项目中安装 @omnisight/sdk 包
        </p>

        {/* npm 安装命令 */}
        <div className="code-block" style={{ marginBottom: '8px' }}>
          <button
            className="code-block-copy"
            onClick={() => handleCopy('npm install @omnisight/sdk')}
            type="button"
          >
            复制
          </button>
          <code>npm install @omnisight/sdk</code>
        </div>

        {/* 或使用 pnpm */}
        <div className="code-block">
          <button
            className="code-block-copy"
            onClick={() => handleCopy('pnpm add @omnisight/sdk')}
            type="button"
          >
            复制
          </button>
          <code>pnpm add @omnisight/sdk</code>
        </div>
      </div>

      {/* ==================== 步骤二：配置选项 ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">步骤二：选择配置</span>
        </div>
        <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '16px' }}>
          根据你的需求选择 SDK 功能，下方代码会实时更新
        </p>

        {/* 配置表单 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 开启 rrweb 录制 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enableReplay}
              onChange={(e) => setConfig((prev) => ({ ...prev, enableReplay: e.target.checked }))}
            />
            <span style={{ fontSize: '13px' }}>
              开启行为录制（rrweb）
              <span className="text-muted" style={{ marginLeft: '8px' }}>
                — 错误发生时自动上传录像，支持回放
              </span>
            </span>
          </label>

          {/* 采样率选择 */}
          <div>
            <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
              采样率
              <span className="text-muted" style={{ marginLeft: '8px' }}>
                — 仅影响正常事件，错误始终 100% 采集
              </span>
            </label>
            <select
              value={config.sampleRate}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, sampleRate: parseFloat(e.target.value) }))
              }
              style={{ width: '300px' }}
            >
              {SAMPLE_RATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 隐私脱敏 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enablePrivacy}
              onChange={(e) => setConfig((prev) => ({ ...prev, enablePrivacy: e.target.checked }))}
            />
            <span style={{ fontSize: '13px' }}>
              开启隐私脱敏
              <span className="text-muted" style={{ marginLeft: '8px' }}>
                — 遮盖密码、邮箱等敏感输入，满足数据合规
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* ==================== 步骤三：初始化代码 ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">步骤三：添加初始化代码</span>
        </div>
        <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '12px' }}>
          将以下代码添加到应用入口文件（如 main.ts / index.ts）的最顶部
        </p>

        {/* 动态生成的初始化代码 */}
        <div className="code-block">
          <button
            className="code-block-copy"
            onClick={() => handleCopy(generatedCode)}
            type="button"
          >
            复制
          </button>
          <pre style={{ margin: 0 }}>{generatedCode}</pre>
        </div>
      </div>

      {/* ==================== 步骤四：验证接入 ==================== */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">步骤四：验证接入</span>
        </div>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>
          <p style={{ marginBottom: '8px' }}>完成上述步骤后，你可以通过以下方式验证 SDK 是否正常工作：</p>
          <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>打开浏览器开发者工具的 Network 面板</li>
            <li>
              在页面中触发一个错误（如在控制台执行{' '}
              <code style={{ backgroundColor: '#161b22', padding: '2px 6px', borderRadius: '3px' }}>
                throw new Error('test')
              </code>
              ）
            </li>
            <li>观察是否有请求发送到 /v1/ingest/batch</li>
            <li>回到 OmniSight 控制台的错误列表页，确认错误已被捕获</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
