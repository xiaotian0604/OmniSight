/**
 * @file 项目列表 API
 * @description 获取控制台可选的 appId 列表及其聚合统计
 *
 * 对应 Gateway 接口：
 * - GET /v1/apps → 返回每个 appId 的错误次数、总事件数和最近活跃时间
 *
 * 统计口径：
 * - errorCount: 按错误 occurrences 聚合后的真实发生次数
 * - totalCount: 总事件数，其中错误事件同样按 occurrences 计权
 */
import { apiClient } from './client';

/**
 * 项目概览信息
 */
export interface AppInfo {
  /** 项目标识 */
  appId: string;
  /** 按 occurrences 聚合后的错误次数 */
  errorCount: number;
  /** 总事件数，错误事件按 occurrences 计权 */
  totalCount: number;
  /** 最近活跃时间 */
  lastSeen: string;
}

interface RawAppInfo {
  appId: string;
  errorCount: number | string;
  totalCount: number | string;
  lastSeen: string;
}

function normalizeAppInfo(item: RawAppInfo): AppInfo {
  return {
    appId: item.appId,
    errorCount: Number(item.errorCount),
    totalCount: Number(item.totalCount),
    lastSeen: item.lastSeen,
  };
}

/**
 * 获取 appId 列表
 */
export async function getApps(): Promise<AppInfo[]> {
  const { data } = await apiClient.get<RawAppInfo[]>('/apps');
  return data.map(normalizeAppInfo);
}
