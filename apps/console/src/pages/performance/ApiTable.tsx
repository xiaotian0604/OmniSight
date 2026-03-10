/**
 * @file 接口耗时排行表格组件
 * @description 展示各 API 端点的性能分位数统计（P50/P75/P99）
 *
 * 数据来源：
 *   useApiMetrics hook → GET /v1/metrics/api
 *   返回 ApiMetricItem[] 数组，按 P99 降序排列
 *
 * 表格列说明：
 * - 接口路径 (endpoint): API 端点 URL
 * - P50 (中位数): 50% 的请求在此耗时内完成
 * - P75: 75% 的请求在此耗时内完成
 * - P99: 99% 的请求在此耗时内完成（关注长尾延迟）
 * - 请求数 (count): 时间范围内的总请求次数
 * - 错误率 (errorRate): 4xx + 5xx 响应的占比
 *
 * 分位数的意义（面试重点）：
 * - P50（中位数）：代表"典型"用户的体验
 * - P75：代表"较慢"用户的体验
 * - P99：代表"最慢 1%"用户的体验（长尾问题）
 * - 关注 P99 而非平均值，因为平均值会被极端值拉偏
 * - P99 > 3s 通常意味着需要优化
 *
 * 后端 SQL：
 *   使用 PostgreSQL 的 percentile_cont() 窗口函数计算分位数
 *   percentile_cont(0.99) WITHIN GROUP (ORDER BY duration) AS p99
 */
import { useApiMetrics } from '@/hooks/useMetrics';
import { EmptyState } from '@/components/EmptyState';

/**
 * 格式化耗时数值
 * 根据数值大小选择合适的单位和精度
 *
 * @param ms - 耗时（毫秒）
 * @returns 格式化后的字符串（如 "123ms"、"1.5s"）
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 根据 P99 耗时判断健康状态
 * 用于给 P99 列添加颜色标识
 *
 * @param p99 - P99 耗时（毫秒）
 * @returns CSS 类名
 */
function getP99Class(p99: number): string {
  if (p99 < 500) return 'text-success';
  if (p99 < 2000) return 'text-warning';
  return 'text-error';
}

/**
 * ApiTable 接口耗时排行表格组件
 *
 * 渲染逻辑：
 * 1. 调用 useApiMetrics hook 获取数据
 * 2. 加载中 → 显示加载提示
 * 3. 无数据 → 显示 EmptyState
 * 4. 有数据 → 渲染表格
 *    - P99 列根据数值大小着色（绿/黄/红）
 *    - 错误率 > 5% 时用红色标识
 *
 * 交互行为：
 * - 纯展示组件，无点击交互
 * - 数据随全局 timeRange 变更自动刷新
 */
export function ApiTable() {
  const { data: metrics, isLoading } = useApiMetrics();

  /* 加载状态 */
  if (isLoading) {
    return (
      <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
        加载中...
      </div>
    );
  }

  /* 空状态 */
  if (!metrics || metrics.length === 0) {
    return (
      <EmptyState
        icon="🌐"
        title="暂无接口数据"
        description="选定时间范围内没有 API 请求记录"
      />
    );
  }

  /* 数据表格 */
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>接口路径</th>
            <th style={{ textAlign: 'right' }}>P50</th>
            <th style={{ textAlign: 'right' }}>P75</th>
            <th style={{ textAlign: 'right' }}>P99</th>
            <th style={{ textAlign: 'right' }}>请求数</th>
            <th style={{ textAlign: 'right' }}>错误率</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((item) => (
            <tr key={item.endpoint}>
              {/*
                接口路径列
                使用等宽字体，截断过长的 URL
              */}
              <td>
                <span
                  className="font-mono truncate"
                  style={{ maxWidth: '200px', display: 'inline-block', fontSize: '12px' }}
                  title={item.endpoint}
                >
                  {item.endpoint}
                </span>
              </td>

              {/* P50 列 */}
              <td style={{ textAlign: 'right' }} className="font-mono">
                {formatDuration(item.p50)}
              </td>

              {/* P75 列 */}
              <td style={{ textAlign: 'right' }} className="font-mono">
                {formatDuration(item.p75)}
              </td>

              {/*
                P99 列
                根据数值大小着色：
                - < 500ms: 绿色（健康）
                - 500ms ~ 2s: 黄色（需关注）
                - > 2s: 红色（需优化）
              */}
              <td style={{ textAlign: 'right' }} className={`font-mono ${getP99Class(item.p99)}`}>
                {formatDuration(item.p99)}
              </td>

              {/* 请求数列 */}
              <td style={{ textAlign: 'right' }}>
                {item.count.toLocaleString()}
              </td>

              {/*
                错误率列
                > 5% 时用红色标识，提示需要关注
              */}
              <td style={{ textAlign: 'right' }}>
                <span className={item.errorRate > 5 ? 'text-error' : 'text-muted'}>
                  {item.errorRate.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
