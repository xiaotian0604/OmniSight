/**
 * @file 时间范围选择器组件
 * @description 全局时间范围选择器，控制所有数据查询的时间窗口
 *
 * 功能说明：
 * 1. 预设选项 — 提供常用的时间范围快捷选择（最近 1h/6h/24h/7d）
 * 2. 自定义范围 — 支持用户手动输入起止时间（TODO: 后续可接入日期选择器组件）
 * 3. 全局联动 — 选择的时间范围写入 Zustand 全局 store，
 *    所有使用 useMetrics 等 hook 的组件会自动响应变更并重新请求数据
 *
 * 布局位置：
 *   固定在顶部 Header 的右侧，始终可见
 *   使用按钮组（Button Group）样式，当前选中项高亮
 *
 * 数据联动原理：
 *   TimeRangePicker → setTimeRange(store) → timeRange 变化
 *   → useQuery 的 queryKey 包含 timeRange → React Query 自动重新 fetch
 *   → 图表/列表组件自动更新
 *
 * Props: 无（直接从全局 store 读写状态）
 */
import { useCallback, useState } from 'react';
import { useGlobalStore } from '@/store/global.store';
import type { TimeRange } from '@/store/global.store';

/**
 * 预设时间范围选项配置
 *
 * @property label - 显示文本（如 "1h"、"6h"）
 * @property value - 选项标识符，用于判断当前选中项
 * @property getRange - 生成对应时间范围的工厂函数
 *                      每次调用都基于当前时间计算，确保时间范围是"最近 N 小时"
 */
interface PresetOption {
  label: string;
  value: string;
  getRange: () => TimeRange;
}

/**
 * 预设时间范围列表
 *
 * 设计考虑：
 * - 1h: 最细粒度，适合排查刚发生的问题
 * - 6h: 适合查看半天内的趋势
 * - 24h: 一天的完整视图，最常用
 * - 7d: 一周趋势，适合观察周期性规律
 *
 * 每个选项的 getRange 函数都是惰性计算的（调用时才计算），
 * 确保每次点击都基于当前时间生成范围
 */
const PRESET_OPTIONS: PresetOption[] = [
  {
    label: '1h',
    value: '1h',
    getRange: () => ({
      start: new Date(Date.now() - 1 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    label: '6h',
    value: '6h',
    getRange: () => ({
      start: new Date(Date.now() - 6 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    label: '24h',
    value: '24h',
    getRange: () => ({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    label: '7d',
    value: '7d',
    getRange: () => ({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
];

/**
 * TimeRangePicker 组件
 *
 * 渲染逻辑：
 * 1. 渲染一组按钮，每个按钮对应一个预设时间范围
 * 2. 当前选中的按钮添加 'active' 类名，显示蓝色高亮背景
 * 3. 点击按钮时：
 *    a. 调用对应选项的 getRange() 生成新的时间范围
 *    b. 通过 setTimeRange 写入全局 store
 *    c. 更新本地 activePreset 状态以高亮当前选项
 *
 * 交互行为：
 * - 点击预设按钮：立即切换时间范围，所有数据图表自动刷新
 * - 默认选中 "1h"（与 global.store 的默认值一致）
 */
export function TimeRangePicker() {
  /**
   * 从全局 store 获取 setTimeRange 方法
   * 不需要读取 timeRange 状态，因为本组件只负责"写"
   */
  const setTimeRange = useGlobalStore((state) => state.setTimeRange);

  /**
   * 当前选中的预设选项标识
   * 用于控制按钮的高亮状态
   * 默认值 '1h' 与 global.store 中的默认时间范围一致
   */
  const [activePreset, setActivePreset] = useState('1h');

  /**
   * 处理预设选项点击
   *
   * @param option - 被点击的预设选项配置
   */
  const handlePresetClick = useCallback(
    (option: PresetOption) => {
      const range = option.getRange();
      setTimeRange(range);
      setActivePreset(option.value);
    },
    [setTimeRange],
  );

  return (
    <div className="time-range-picker">
      {PRESET_OPTIONS.map((option) => (
        <button
          key={option.value}
          /**
           * 动态类名：
           * - 'time-range-option': 基础样式
           * - 'active': 当前选中项，添加蓝色高亮背景
           */
          className={`time-range-option ${activePreset === option.value ? 'active' : ''}`}
          onClick={() => handlePresetClick(option)}
          /**
           * type="button" 防止在 form 中触发表单提交
           * 虽然当前不在 form 中，但这是良好的编码习惯
           */
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
