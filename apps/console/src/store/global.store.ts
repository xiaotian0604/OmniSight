/**
 * @file 全局状态管理 Store
 * @description 使用 Zustand 管理控制台的全局状态
 *
 * 管理的状态：
 * 1. appId — 当前选中的项目 ID，所有 API 请求都会携带此 ID
 * 2. timeRange — 全局时间范围（start/end），所有数据查询都受此范围约束
 *
 * 为什么选择 Zustand？
 * - 极简 API：不需要 Provider 包裹（虽然我们仍在 main.tsx 中使用了 Provider 模式）
 * - 体积小：< 1KB gzip，不增加 bundle 负担
 * - 无 boilerplate：相比 Redux，不需要 action/reducer/dispatch 等概念
 * - 支持 React 外部访问：可以在 axios 拦截器等非组件代码中读取状态
 * - TypeScript 友好：类型推导完善
 *
 * 持久化策略：
 * - appId 持久化到 localStorage，刷新页面后保持选中的项目
 * - timeRange 不持久化，每次打开默认显示最近 1 小时的数据
 *
 * 使用方式：
 *   // 在 React 组件中
 *   const { appId, timeRange, setTimeRange } = useGlobalStore();
 *
 *   // 在非 React 代码中（如 axios 拦截器）
 *   const appId = useGlobalStore.getState().appId;
 */
import { create } from 'zustand';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 时间范围类型
 * 用于约束所有数据查询的时间窗口
 *
 * @property start - 起始时间（Date 对象）
 * @property end - 结束时间（Date 对象）
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * 全局 Store 的状态和操作接口
 *
 * 状态（State）：
 * @property appId - 当前项目 ID（对应 projects 表的 api_key 或 id）
 * @property timeRange - 全局时间范围，影响所有数据查询
 *
 * 操作（Actions）：
 * @property setAppId - 切换当前项目，同时持久化到 localStorage
 * @property setTimeRange - 更新时间范围，触发所有依赖此范围的查询重新执行
 */
interface GlobalStore {
  appId: string;
  timeRange: TimeRange;
  setAppId: (appId: string) => void;
  setTimeRange: (range: TimeRange) => void;
}

/* ================================================================
   辅助函数
   ================================================================ */

/**
 * 获取默认时间范围：最近 1 小时
 *
 * 为什么默认 1 小时？
 * - 监控场景下，用户最关心的是"刚刚发生了什么"
 * - 1 小时的数据量适中，查询速度快，图表不会太密也不会太稀疏
 * - 如果有异常，1 小时内大概率能看到
 *
 * @returns 包含 start 和 end 的 TimeRange 对象
 */
function getDefaultTimeRange(): TimeRange {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  return { start, end };
}

/**
 * 从 localStorage 读取持久化的 appId
 * 如果没有存储过，返回默认值 'default'
 *
 * @returns 持久化的 appId 或默认值
 */
function getPersistedAppId(): string {
  return localStorage.getItem('omnisight-app-id') || 'default';
}

/* ================================================================
   Store 定义
   ================================================================ */

/**
 * 全局状态 Store
 *
 * 使用 Zustand 的 create 函数创建 store，
 * set 函数用于更新状态，Zustand 会自动通知订阅了相关状态的组件重新渲染。
 *
 * 注意：Zustand 使用浅比较（shallow equality）来判断状态是否变化，
 * 所以 setTimeRange 传入新的对象引用就会触发重新渲染。
 */
export const useGlobalStore = create<GlobalStore>((set) => ({
  /**
   * 当前项目 ID
   * 初始值从 localStorage 读取，确保刷新页面后保持选中状态
   */
  appId: getPersistedAppId(),

  /**
   * 全局时间范围
   * 初始值为最近 1 小时
   * TimeRangePicker 组件和各页面的数据查询 hook 都会读取此值
   */
  timeRange: getDefaultTimeRange(),

  /**
   * 切换当前项目
   *
   * 执行逻辑：
   * 1. 更新 Zustand store 中的 appId
   * 2. 同步写入 localStorage 持久化
   * 3. axios 请求拦截器会从 localStorage 读取最新的 appId 注入到请求头
   *
   * @param appId - 新的项目 ID
   */
  setAppId: (appId: string) => {
    localStorage.setItem('omnisight-app-id', appId);
    set({ appId });
  },

  /**
   * 更新全局时间范围
   *
   * 当用户在 TimeRangePicker 中选择新的时间范围时调用
   * 所有使用 useMetrics / useQuery 并依赖 timeRange 的组件会自动重新请求数据
   *
   * React Query 的自动刷新机制：
   *   组件中 useQuery 的 queryKey 包含 timeRange，
   *   当 timeRange 变化时，queryKey 变化，React Query 自动重新 fetch
   *
   * @param range - 新的时间范围（start + end）
   */
  setTimeRange: (range: TimeRange) => {
    set({ timeRange: range });
  },
}));
