/**
 * @file 概览仪表盘页面
 * @description OmniSight 控制台的默认首页，展示系统整体健康状况
 *
 * 页面布局：
 * ┌─────────────────────────────────────────────────┐
 * │  页面标题：概览仪表盘                              │
 * ├─────────────────────────────────────────────────┤
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  ErrorRateChart — 错误率趋势折线图       │    │
 * │  │  （占据整行宽度，最重要的指标）            │    │
 * │  └─────────────────────────────────────────┘    │
 * │                                                 │
 * │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
 * │  │ LCP  │ │ CLS  │ │ TTFB │ │ INP  │          │
 * │  │评分卡│ │评分卡│ │评分卡│ │评分卡│          │
 * │  └──────┘ └──────┘ └──────┘ └──────┘          │
 * │                                                 │
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  TopErrors — Top 10 高频错误列表         │    │
 * │  └─────────────────────────────────────────┘    │
 * └─────────────────────────────────────────────────┘
 *
 * 数据来源：
 * - ErrorRateChart: useErrorRateSeries hook → GET /v1/metrics/error-rate
 * - VitalsScore: useVitalsSeries hook → GET /v1/metrics/vitals
 * - TopErrors: useQuery → GET /v1/errors (limit=10, sort=count)
 *
 * 所有数据查询都受全局 timeRange 约束，用户切换时间范围时自动刷新
 */
import { ErrorRateChart } from './ErrorRateChart';
import { VitalsScore } from './VitalsScore';
import { TopErrors } from './TopErrors';

/**
 * 概览仪表盘页面组件
 *
 * 渲染逻辑：
 * 1. 页面标题区域 — 显示"概览仪表盘"标题和简要描述
 * 2. 错误率趋势图 — 最重要的指标，占据整行宽度
 *    展示选定时间范围内的错误率变化趋势
 * 3. Vitals 评分卡 — 四列网格布局，展示 LCP/CLS/TTFB/INP 的当前评分
 *    每个指标用颜色标识健康状态（绿色/黄色/红色）
 * 4. Top 10 高频错误 — 表格形式展示发生频次最高的错误
 *    点击可跳转到错误详情页
 *
 * 面试演示要点：
 * - 这是打开控制台后的第一个页面，第一印象很重要
 * - 错误率趋势图能直观展示系统健康状况
 * - Vitals 评分卡体现了对 Web 性能指标的理解
 * - Top 错误列表展示了数据聚合和交互跳转能力
 */
export default function OverviewPage() {
  return (
    <div>
      {/* 页面标题区域 */}
      <div className="page-header">
        <div className="page-header-info">
          <h2>概览仪表盘</h2>
          <p>系统整体健康状况一览，包含错误率趋势、性能评分和高频错误</p>
        </div>
      </div>

      {/* 错误率趋势折线图 — 最重要的指标，独占一行 */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">错误率趋势</span>
          <span className="card-subtitle">展示选定时间范围内的错误率变化</span>
        </div>
        <ErrorRateChart />
      </div>

      {/* Web Vitals 评分卡 — 四列网格布局 */}
      <div className="mb-6">
        <VitalsScore />
      </div>

      {/* Top 10 高频错误列表 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Top 10 高频错误</span>
          <span className="card-subtitle">按发生频次排序的错误聚合列表</span>
        </div>
        <TopErrors />
      </div>
    </div>
  );
}
