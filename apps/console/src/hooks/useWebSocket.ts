/**
 * @file WebSocket 连接 Hook
 * @description 管理与 Gateway 的 WebSocket 长连接，接收实时告警推送
 *
 * 工作原理：
 * 1. Gateway 的 Worker 在处理事件时，如果检测到异常（错误率突增等），
 *    会通过 Redis Pub/Sub 发布告警消息
 * 2. Gateway 的 WebSocket 网关订阅 Redis 频道，将告警推送给已连接的控制台客户端
 * 3. 本 hook 建立 WebSocket 连接，解析收到的告警消息，写入 alert store
 * 4. 页面右上角的告警通知组件订阅 alert store，实时展示新告警
 *
 * 连接管理：
 * - 自动重连：连接断开后，使用指数退避策略自动重连（1s → 2s → 4s → ... → 30s）
 * - 心跳检测：定期发送 ping 消息，检测连接是否存活
 * - 组件卸载时自动断开连接，防止内存泄漏
 *
 * WebSocket 消息格式（由 Gateway 定义）：
 *   { type: 'alert', payload: { title, message, level } }
 *
 * 使用方式：
 *   // 在 App 组件或顶层组件中调用，建立全局 WebSocket 连接
 *   function App() {
 *     useWebSocket();
 *     return <div>...</div>;
 *   }
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAlertStore } from '@/store/alert.store';

/**
 * WebSocket 服务器地址
 *
 * 开发环境：ws://localhost:3000/ws（通过 Vite proxy 代理）
 * 生产环境：wss://your-domain.com/ws（通过 Nginx 反向代理）
 *
 * 使用相对路径 '/ws'，由 Vite proxy 或 Nginx 自动处理协议和域名
 * 这里根据当前页面协议动态生成 WebSocket URL
 */
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

/**
 * WebSocket 消息类型定义
 * Gateway 推送的消息遵循此格式
 */
interface WsMessage {
  /** 消息类型：目前仅支持 'alert'，未来可扩展 'metric_update' 等 */
  type: 'alert';
  /** 消息载荷，根据 type 不同有不同结构 */
  payload: {
    title: string;
    message: string;
    level: 'error' | 'warning' | 'info';
  };
}

/**
 * 重连配置常量
 */
/** 初始重连延迟（毫秒） */
const INITIAL_RECONNECT_DELAY = 1000;
/** 最大重连延迟（毫秒），指数退避的上限 */
const MAX_RECONNECT_DELAY = 30000;
/** 心跳间隔（毫秒），每 30 秒发送一次 ping */
const HEARTBEAT_INTERVAL = 30000;

/**
 * WebSocket 连接管理 Hook
 *
 * 核心逻辑：
 * 1. 组件挂载时建立 WebSocket 连接
 * 2. 收到消息时解析并写入 alert store
 * 3. 连接断开时使用指数退避策略自动重连
 * 4. 定期发送心跳保持连接存活
 * 5. 组件卸载时清理所有资源（连接、定时器）
 *
 * 指数退避策略：
 *   第 1 次重连等待 1s，第 2 次 2s，第 3 次 4s，...直到最大 30s
 *   成功连接后重置延迟为 1s
 *   这样可以在网络恢复时快速重连，同时避免频繁重连给服务器造成压力
 */
export function useWebSocket() {
  /** WebSocket 实例引用，用于在回调中访问和操作连接 */
  const wsRef = useRef<WebSocket | null>(null);

  /** 当前重连延迟，使用指数退避递增 */
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  /** 重连定时器 ID，用于在组件卸载时清除 */
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 心跳定时器 ID */
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 组件是否已卸载的标记，防止卸载后仍然尝试重连 */
  const isMountedRef = useRef(true);

  /**
   * 从 alert store 获取 addAlert 方法
   * 使用 useRef 包装避免引用变化导致 useCallback 重建和 WebSocket 频繁重连
   */
  const addAlertRef = useRef(useAlertStore.getState().addAlert);
  useEffect(() => {
    addAlertRef.current = useAlertStore.getState().addAlert;
  });

  /**
   * 启动心跳检测
   * 定期发送 'ping' 消息，如果服务器无响应，WebSocket 会自动触发 onclose
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  /**
   * 停止心跳检测
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  /**
   * 建立 WebSocket 连接
   *
   * 事件处理：
   * - onopen: 连接成功，重置重连延迟，启动心跳
   * - onmessage: 收到消息，解析后写入 alert store
   * - onclose: 连接关闭，停止心跳，触发自动重连
   * - onerror: 连接错误，记录日志（实际的重连由 onclose 处理）
   */
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      /**
       * 连接成功回调
       * 重置重连延迟为初始值，确保下次断开后能快速重连
       */
      ws.onopen = () => {
        console.info('[OmniSight WS] 连接已建立');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        startHeartbeat();
      };

      /**
       * 消息接收回调
       * 解析 JSON 消息，根据 type 字段分发处理
       * 目前仅处理 'alert' 类型，未来可扩展其他消息类型
       */
      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === 'alert' && msg.payload) {
            addAlertRef.current({
              title: msg.payload.title,
              message: msg.payload.message,
              level: msg.payload.level,
            });
          }
        } catch {
          console.warn('[OmniSight WS] 无法解析消息:', event.data);
        }
      };

      /**
       * 连接关闭回调
       * 停止心跳，使用指数退避策略安排重连
       */
      ws.onclose = () => {
        console.info('[OmniSight WS] 连接已关闭，准备重连...');
        stopHeartbeat();

        if (isMountedRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 2,
              MAX_RECONNECT_DELAY,
            );
            connect();
          }, reconnectDelayRef.current);
        }
      };

      /**
       * 连接错误回调
       * 仅记录日志，实际的重连逻辑由 onclose 处理
       * （WebSocket 错误后一定会触发 close 事件）
       */
      ws.onerror = () => {
        console.warn('[OmniSight WS] 连接错误');
      };
    } catch (err) {
      console.error('[OmniSight WS] 创建连接失败:', err);
    }
  }, [startHeartbeat, stopHeartbeat]);

  /**
   * Effect：组件挂载时建立连接，卸载时清理资源
   *
   * 清理逻辑：
   * 1. 标记组件已卸载，防止后续重连
   * 2. 清除重连定时器
   * 3. 停止心跳
   * 4. 关闭 WebSocket 连接
   */
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      stopHeartbeat();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, stopHeartbeat]);
}
