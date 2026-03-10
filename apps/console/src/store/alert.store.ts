/**
 * @file 实时告警状态管理 Store
 * @description 使用 Zustand 管理 WebSocket 推送的实时告警数据
 *
 * 工作流程：
 * 1. useWebSocket hook 建立与 Gateway 的 WebSocket 连接
 * 2. 当 Gateway 检测到异常（如错误率突增、接口超时等），通过 Redis Pub/Sub 推送告警
 * 3. WebSocket 收到告警消息后，调用 addAlert 将告警添加到 store
 * 4. 页面右上角的告警通知组件订阅此 store，实时展示新告警
 * 5. 告警会在指定时间后自动消失，或用户手动关闭
 *
 * 为什么用独立的 store 而不是放在 global.store 中？
 * - 关注点分离：告警是实时推送的临时数据，与全局配置（appId/timeRange）性质不同
 * - 更新频率不同：告警可能频繁更新，独立 store 避免不必要的组件重渲染
 * - 便于测试：可以独立测试告警逻辑
 *
 * 使用方式：
 *   // 添加告警（通常由 useWebSocket hook 调用）
 *   useAlertStore.getState().addAlert({ title: '错误率突增', message: '...' });
 *
 *   // 在组件中读取告警列表
 *   const { alerts, clearAlerts } = useAlertStore();
 */
import { create } from 'zustand';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 告警数据结构
 *
 * @property id - 告警唯一标识（自动生成的时间戳 + 随机数）
 * @property title - 告警标题（如 "错误率突增"、"接口超时"）
 * @property message - 告警详细描述（如 "最近 5 分钟错误率达到 15%，超过阈值 10%"）
 * @property level - 告警级别：
 *                   - 'error': 严重告警（红色），如错误率突增
 *                   - 'warning': 警告（黄色），如接口耗时上升
 *                   - 'info': 信息（蓝色），如新版本部署通知
 * @property timestamp - 告警产生时间（毫秒时间戳）
 */
export interface Alert {
  id: string;
  title: string;
  message: string;
  level: 'error' | 'warning' | 'info';
  timestamp: number;
}

/**
 * 告警 Store 的状态和操作接口
 *
 * 状态（State）：
 * @property alerts - 当前活跃的告警列表（按时间倒序，最新的在前）
 *
 * 操作（Actions）：
 * @property addAlert - 添加新告警，自动生成 ID 和时间戳
 * @property removeAlert - 移除指定 ID 的告警（用户手动关闭或自动过期）
 * @property clearAlerts - 清空所有告警
 */
interface AlertStore {
  alerts: Alert[];
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp'>) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
}

/**
 * 告警列表最大长度
 * 超过此数量时，最旧的告警会被自动移除
 * 避免内存无限增长
 */
const MAX_ALERTS = 50;

/* ================================================================
   Store 定义
   ================================================================ */

/**
 * 告警状态 Store
 *
 * 设计要点：
 * - 告警列表有最大长度限制（50 条），防止内存泄漏
 * - 新告警插入到数组头部（最新的在前），便于 UI 展示
 * - 自动生成唯一 ID（Date.now + random），无需外部传入
 */
export const useAlertStore = create<AlertStore>((set) => ({
  /**
   * 当前活跃的告警列表
   * 初始为空数组，WebSocket 连接建立后开始接收告警
   */
  alerts: [],

  /**
   * 添加新告警
   *
   * 执行逻辑：
   * 1. 自动生成唯一 ID（时间戳 + 4 位随机数，足够避免碰撞）
   * 2. 记录当前时间戳
   * 3. 将新告警插入数组头部（unshift 语义）
   * 4. 如果告警总数超过 MAX_ALERTS，截断数组尾部
   *
   * @param alert - 告警数据（不含 id 和 timestamp，由 store 自动生成）
   */
  addAlert: (alert) => {
    const newAlert: Alert = {
      ...alert,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };

    set((state) => ({
      alerts: [newAlert, ...state.alerts].slice(0, MAX_ALERTS),
    }));
  },

  /**
   * 移除指定 ID 的告警
   *
   * 使用场景：
   * - 用户点击告警通知上的关闭按钮
   * - 告警自动过期（由 useWebSocket hook 中的 setTimeout 触发）
   *
   * @param id - 要移除的告警 ID
   */
  removeAlert: (id) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    }));
  },

  /**
   * 清空所有告警
   *
   * 使用场景：
   * - 用户点击"全部已读"按钮
   * - 切换项目时清空旧项目的告警
   */
  clearAlerts: () => {
    set({ alerts: [] });
  },
}));
