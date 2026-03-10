/**
 * @file React 错误边界组件
 * @description 捕获子组件树中的 JavaScript 错误，显示友好的降级 UI
 *
 * 为什么需要 ErrorBoundary？
 * React 组件在渲染过程中如果抛出未捕获的错误，会导致整个组件树卸载（白屏）。
 * ErrorBoundary 可以捕获这些错误，显示一个友好的错误提示页面，
 * 而不是让用户看到空白页面。
 *
 * 技术限制：
 * - ErrorBoundary 必须使用 Class Component 实现（React 目前不支持函数组件的错误边界）
 * - 只能捕获渲染阶段的错误（render、生命周期方法、构造函数）
 * - 无法捕获：事件处理器中的错误、异步代码中的错误、服务端渲染的错误
 *
 * 使用位置：
 *   在 main.tsx 中包裹整个 App 组件，作为全局错误兜底
 *   也可以在局部使用，为特定区域提供独立的错误处理
 *
 * 使用方式：
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 *   // 或带自定义 fallback
 *   <ErrorBoundary fallback={<CustomErrorPage />}>
 *     <DangerousComponent />
 *   </ErrorBoundary>
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

/**
 * ErrorBoundary 组件的 Props 类型
 *
 * @property children - 被包裹的子组件树
 * @property fallback - 可选的自定义错误 UI，如果不提供则使用默认的错误提示
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * ErrorBoundary 组件的 State 类型
 *
 * @property hasError - 是否捕获到了错误
 * @property error - 捕获到的错误对象（用于展示错误信息）
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary 类组件
 *
 * 生命周期方法说明：
 *
 * 1. static getDerivedStateFromError(error)
 *    - 在渲染阶段调用（同步）
 *    - 返回新的 state，触发重新渲染以显示降级 UI
 *    - 不应有副作用（如日志上报），因为在渲染阶段
 *
 * 2. componentDidCatch(error, errorInfo)
 *    - 在提交阶段调用（commit phase）
 *    - 适合执行副作用：上报错误日志、发送到监控系统
 *    - errorInfo.componentStack 包含组件堆栈信息
 *
 * 渲染逻辑：
 * - hasError 为 false → 正常渲染 children
 * - hasError 为 true → 渲染 fallback（如果提供）或默认错误 UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    /**
     * 初始状态：无错误
     */
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * 静态方法：从错误中派生状态
   *
   * 当子组件抛出错误时，React 会调用此方法
   * 返回的对象会合并到组件 state 中，触发重新渲染
   *
   * @param error - 子组件抛出的错误对象
   * @returns 新的 state 片段
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * 错误捕获回调
   *
   * 在此方法中执行副作用操作：
   * 1. 在控制台输出详细错误信息（开发调试用）
   * 2. 未来可以在这里将错误上报到 OmniSight 自身的监控系统
   *    （"吃自己的狗粮" — 用自己的产品监控自己）
   *
   * @param error - 错误对象
   * @param errorInfo - 包含 componentStack（组件调用栈）的额外信息
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      '[OmniSight ErrorBoundary] 捕获到渲染错误:',
      error,
      '\n组件堆栈:',
      errorInfo.componentStack,
    );
  }

  /**
   * 重置错误状态
   * 用户点击"重试"按钮时调用，清除错误状态，尝试重新渲染子组件
   */
  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    /**
     * 错误状态：渲染降级 UI
     */
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#0f1117',
            color: '#e6edf3',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          {/* 错误图标 */}
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>⚠️</div>

          {/* 错误标题 */}
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>
            页面出现了问题
          </h1>

          {/* 错误描述 */}
          <p style={{ fontSize: '14px', color: '#8b949e', marginBottom: '8px', maxWidth: '500px' }}>
            控制台遇到了一个未预期的错误。你可以尝试刷新页面或点击下方按钮重试。
          </p>

          {/* 错误详情（开发模式下显示） */}
          {this.state.error && (
            <pre
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#f85149',
                maxWidth: '600px',
                overflow: 'auto',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          {/* 重试按钮 */}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '24px',
              padding: '10px 24px',
              backgroundColor: '#58a6ff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      );
    }

    /**
     * 正常状态：渲染子组件
     */
    return this.props.children;
  }
}
