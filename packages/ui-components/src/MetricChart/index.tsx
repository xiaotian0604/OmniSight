/**
 * ---------------------------------------------------------------
 * MetricChart — ECharts 时序折线图封装组件
 *
 * 用于在 OmniSight 控制台中展示各类时序指标数据的折线图。
 * 基于 echarts-for-react 封装，提供统一的主题、Loading 状态和空数据处理。
 *
 * 使用场景：
 *   - 概览仪表盘的错误率趋势图
 *   - 性能页面的 Web Vitals 趋势图
 *   - 接口耗时分布图
 *
 * 数据格式约定：
 *   数据点为 [timestamp, value] 二元组数组，
 *   其中 timestamp 为毫秒级 Unix 时间戳，value 为指标数值。
 *   这是 ECharts 时间轴的标准数据格式。
 *
 * @example
 * ```tsx
 * import { MetricChart } from '@omnisight/ui-components';
 *
 * const data = [
 *   [1705286400000, 0.5],
 *   [1705290000000, 1.2],
 *   [1705293600000, 0.8],
 * ];
 *
 * <MetricChart
 *   title="错误率趋势"
 *   data={data}
 *   yAxisName="错误数"
 *   color="#ef4444"
 *   height={350}
 * />
 * ```
 * ---------------------------------------------------------------
 */

import { type CSSProperties, type FC } from 'react';
/** echarts-for-react 提供的 React 封装组件，自动处理 ECharts 实例的创建和销毁 */
import ReactEChartsCore from 'echarts-for-react/lib/core';
/** 按需引入 ECharts 核心模块，减小打包体积 */
import * as echarts from 'echarts/core';
/** 折线图组件 */
import { LineChart } from 'echarts/charts';
/** ECharts 所需的各功能组件 */
import {
  TitleComponent,     /* 标题组件 */
  TooltipComponent,   /* 提示框组件 */
  GridComponent,      /* 网格组件（坐标系容器） */
  DataZoomComponent,  /* 数据区域缩放组件（支持时间范围刷选） */
} from 'echarts/components';
/** Canvas 渲染器（相比 SVG 渲染器，在大数据量场景下性能更好） */
import { CanvasRenderer } from 'echarts/renderers';

/**
 * 注册 ECharts 所需的组件和渲染器
 * 采用按需引入的方式，只注册实际使用的组件，减小最终打包体积。
 * 这是 ECharts 5.x 推荐的 tree-shaking 友好用法。
 */
echarts.use([
  LineChart,          /* 注册折线图类型 */
  TitleComponent,     /* 注册标题功能 */
  TooltipComponent,   /* 注册提示框功能 */
  GridComponent,      /* 注册网格（坐标系）功能 */
  DataZoomComponent,  /* 注册数据缩放功能 */
  CanvasRenderer,     /* 注册 Canvas 渲染器 */
]);

// ========================= 类型定义 =========================

/**
 * MetricDataPoint — 单个数据点的类型
 *
 * 二元组格式：[时间戳, 数值]
 * - 第一个元素：毫秒级 Unix 时间戳（如 1705286400000）
 * - 第二个元素：指标数值（如错误数、耗时毫秒数、CLS 分数等）
 */
export type MetricDataPoint = [number, number];

/**
 * MetricChartProps — MetricChart 组件的属性接口
 */
export interface MetricChartProps {
  /**
   * 图表标题
   * 显示在图表左上角，描述当前图表展示的指标含义。
   * 示例: "错误率趋势"、"LCP 变化趋势"
   */
  title: string;

  /**
   * 时序数据点数组
   * 每个元素为 [timestamp, value] 二元组。
   * 数据应按时间升序排列，ECharts 会自动处理时间轴的刻度和标签。
   * 传入空数组时，组件会展示空数据占位状态。
   */
  data: MetricDataPoint[];

  /**
   * Y 轴名称（可选）
   * 显示在 Y 轴顶部，说明纵轴的度量单位。
   * 示例: "错误数"、"耗时(ms)"、"分数"
   * 默认值: ""（不显示）
   */
  yAxisName?: string;

  /**
   * 折线颜色（可选）
   * 支持任何合法的 CSS 颜色值（十六进制、RGB、HSL 等）。
   * 同时影响折线颜色和面积填充色（面积填充色会自动添加透明度渐变）。
   * 默认值: "#3b82f6"（蓝色，与 OmniSight 品牌色一致）
   */
  color?: string;

  /**
   * 图表高度（像素，可选）
   * 设置图表容器的高度。宽度默认为 100%（自适应父容器）。
   * 默认值: 300
   */
  height?: number;

  /**
   * 是否显示数据缩放滑块（可选）
   * 开启后在图表底部显示缩放滑块，支持用户拖拽选择时间范围。
   * 适用于数据量较大、需要精细查看某个时间段的场景。
   * 默认值: false
   */
  showDataZoom?: boolean;

  /**
   * 自定义容器样式（可选）
   * 传入额外的 CSS 样式，应用于图表最外层容器。
   */
  style?: CSSProperties;
}

// ========================= 样式常量 =========================

/**
 * 空数据状态的容器样式
 * 当 data 为空数组时展示此占位区域。
 */
const EMPTY_STATE_STYLE: CSSProperties = {
  /** 使用 Flex 布局实现内容居中 */
  display: 'flex',
  /** 垂直居中 */
  alignItems: 'center',
  /** 水平居中 */
  justifyContent: 'center',
  /** 浅灰色背景，与图表区域形成视觉区分 */
  backgroundColor: '#f9fafb',
  /** 圆角边框 */
  borderRadius: '8px',
  /** 1px 虚线边框，暗示此处应有内容 */
  border: '1px dashed #d1d5db',
  /** 灰色文字 */
  color: '#9ca3af',
  /** 适中的字体大小 */
  fontSize: '14px',
};

// ========================= 组件实现 =========================

/**
 * MetricChart — 时序折线图 React 函数组件
 *
 * 封装 ECharts 折线图，提供统一的配置、主题和交互体验。
 * 自动处理空数据状态、tooltip 格式化、时间轴配置等通用逻辑。
 *
 * @param props - 组件属性，详见 MetricChartProps 接口定义
 * @returns 渲染的图表 JSX 元素，或空数据占位
 */
export const MetricChart: FC<MetricChartProps> = ({
  title,
  data,
  yAxisName = '',
  color = '#3b82f6',
  height = 300,
  showDataZoom = false,
  style,
}) => {
  /**
   * 空数据状态处理
   * 当传入的数据为空数组时，不渲染 ECharts 实例，
   * 而是展示一个友好的空状态占位区域，避免空白图表造成困惑。
   */
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          ...EMPTY_STATE_STYLE,
          /** 高度与正常图表保持一致，避免布局跳动 */
          height: `${height}px`,
          ...style,
        }}
      >
        {/* 空数据提示文案 */}
        暂无数据
      </div>
    );
  }

  /**
   * 构建 ECharts 配置项（option）
   *
   * ECharts 的配置是一个声明式的 JSON 对象，
   * 描述了图表的所有视觉和交互属性。
   */
  const option: echarts.EChartsCoreOption = {
    /**
     * 标题配置
     */
    title: {
      /** 主标题文本 */
      text: title,
      /** 标题文字样式 */
      textStyle: {
        fontSize: 14,        /* 适中的标题字号 */
        fontWeight: 500,     /* 中等字重 */
        color: '#374151',    /* 深灰色，不过于突兀 */
      },
      /** 标题距离容器左侧的距离 */
      left: '16px',
      /** 标题距离容器顶部的距离 */
      top: '12px',
    },

    /**
     * 提示框（Tooltip）配置
     * 鼠标悬停在数据点上时显示的浮层信息。
     */
    tooltip: {
      /** 触发类型：axis 表示鼠标移到坐标轴区域时触发 */
      trigger: 'axis',
      /**
       * 自定义提示框内容格式化函数
       *
       * @param params - ECharts 传入的数据参数数组
       * @returns 格式化后的 HTML 字符串
       *
       * 重要说明：
       *   params 中每个元素的 value 是 [timestamp, value] 数组格式，
       *   因此需要用 p.value[1] 来获取实际的指标数值，
       *   而不是直接使用 p.value（那样会显示整个数组）。
       */
      formatter: (params: unknown) => {
        /** 类型断言：ECharts 的 tooltip formatter 参数为数组 */
        const paramList = params as Array<{
          /** 系列标记（带颜色的圆点 HTML） */
          marker: string;
          /** 系列名称 */
          seriesName: string;
          /**
           * 数据值，对于时间轴折线图，格式为 [timestamp, value]
           * value[0] = 时间戳（毫秒）
           * value[1] = 指标数值
           */
          value: [number, number];
        }>;

        /** 如果参数为空，返回空字符串 */
        if (!paramList || paramList.length === 0) return '';

        /** 取第一个数据点的时间戳，格式化为可读的日期时间字符串 */
        const timestamp = paramList[0].value[0];
        const dateStr = new Date(timestamp).toLocaleString('zh-CN', {
          month: '2-digit',    /* 两位数月份 */
          day: '2-digit',      /* 两位数日期 */
          hour: '2-digit',     /* 两位数小时 */
          minute: '2-digit',   /* 两位数分钟 */
        });

        /** 构建提示框的 HTML 内容 */
        let html = `<div style="font-size:12px;color:#6b7280;">${dateStr}</div>`;
        for (const p of paramList) {
          /**
           * 关键：使用 p.value[1] 获取实际数值
           * p.value 是 [timestamp, value] 数组，p.value[1] 才是我们需要的指标值
           */
          const val = typeof p.value[1] === 'number' ? p.value[1].toFixed(2) : p.value[1];
          html += `<div style="margin-top:4px;">${p.marker} ${p.seriesName}: <strong>${val}</strong></div>`;
        }
        return html;
      },
    },

    /**
     * 网格（Grid）配置
     * 定义图表绑定区域（坐标系）在容器中的位置和大小。
     * 通过设置上下左右的边距，为标题、轴标签等留出空间。
     */
    grid: {
      top: 50,       /* 顶部留出空间给标题 */
      right: 24,     /* 右侧留出边距 */
      bottom: showDataZoom ? 60 : 24,  /* 底部：如果有缩放滑块则留更多空间 */
      left: 16,      /* 左侧留出边距 */
      containLabel: true,  /* 网格区域包含坐标轴标签，防止标签被裁切 */
    },

    /**
     * X 轴配置
     * 使用时间轴类型，ECharts 会自动根据数据范围计算合适的刻度和标签。
     */
    xAxis: {
      /** 轴类型：time 表示时间轴，自动处理时间格式化 */
      type: 'time' as const,
      /** 轴线样式 */
      axisLine: {
        lineStyle: {
          color: '#e5e7eb',  /* 浅灰色轴线 */
        },
      },
      /** 轴标签样式 */
      axisLabel: {
        color: '#9ca3af',    /* 灰色标签文字 */
        fontSize: 11,        /* 小号字体 */
      },
      /** 分隔线（网格线）样式 */
      splitLine: {
        show: false,         /* X 轴不显示网格线，保持简洁 */
      },
    },

    /**
     * Y 轴配置
     */
    yAxis: {
      /** 轴类型：value 表示数值轴 */
      type: 'value' as const,
      /** Y 轴名称，显示在轴顶部 */
      name: yAxisName,
      /** Y 轴名称的文字样式 */
      nameTextStyle: {
        color: '#9ca3af',    /* 灰色 */
        fontSize: 11,
      },
      /** 轴线不显示（Y 轴通常不需要轴线） */
      axisLine: { show: false },
      /** 刻度标记不显示 */
      axisTick: { show: false },
      /** 轴标签样式 */
      axisLabel: {
        color: '#9ca3af',
        fontSize: 11,
      },
      /** 分隔线（水平网格线）样式 */
      splitLine: {
        lineStyle: {
          color: '#f3f4f6',  /* 极浅的灰色网格线 */
          type: 'dashed' as const,     /* 虚线样式 */
        },
      },
    },

    /**
     * 数据缩放组件配置（可选）
     * 仅在 showDataZoom 为 true 时渲染。
     * 在图表底部显示一个可拖拽的滑块，允许用户选择查看的时间范围。
     */
    dataZoom: showDataZoom
      ? [
          {
            /** 滑块类型：slider 表示底部滑块 */
            type: 'slider' as const,
            /** 默认显示最后 50% 的数据范围 */
            start: 50,
            end: 100,
            /** 距离容器底部的距离 */
            bottom: 8,
            /** 滑块高度 */
            height: 20,
            /** 边框颜色 */
            borderColor: '#e5e7eb',
            /** 文字样式 */
            textStyle: {
              color: '#9ca3af',
              fontSize: 10,
            },
          },
        ]
      : [],  /* 不显示缩放组件时传空数组 */

    /**
     * 数据系列配置
     * 定义图表中实际展示的数据和视觉样式。
     */
    series: [
      {
        /** 系列名称，显示在 tooltip 中 */
        name: title,
        /** 图表类型：折线图 */
        type: 'line',
        /** 数据点数组，格式为 [[timestamp, value], ...] */
        data,
        /** 启用平滑曲线，使折线更美观 */
        smooth: true,
        /** 不显示数据点的圆形标记（数据密集时更清晰） */
        showSymbol: false,
        /** 折线宽度 */
        lineStyle: {
          width: 2,
          color,  /* 使用传入的颜色 */
        },
        /**
         * 面积填充配置
         * 在折线下方填充一个从上到下的渐变色区域，
         * 增强视觉效果和数据感知。
         */
        areaStyle: {
          /**
           * 线性渐变填充
           * 从折线处（透明度 0.15）渐变到底部（完全透明），
           * 营造柔和的面积效果。
           */
          color: new echarts.graphic.LinearGradient(
            0, 0,  /* 渐变起点：左上角 */
            0, 1,  /* 渐变终点：左下角（垂直方向渐变） */
            [
              { offset: 0, color: `${color}26` },    /* 起始颜色：主色 + 15% 透明度（26 = 0.15 * 255 的十六进制） */
              { offset: 1, color: `${color}00` },    /* 结束颜色：完全透明 */
            ],
          ),
        },
      },
    ],
  };

  return (
    <div style={style}>
      {/**
       * ReactEChartsCore — echarts-for-react 的核心组件
       *
       * 使用 Core 版本而非默认版本，配合按需引入的 echarts 模块，
       * 实现更小的打包体积。
       *
       * 参数说明：
       * - echarts    : 传入按需注册后的 echarts 实例
       * - option     : ECharts 配置项
       * - style      : 容器样式，设置宽度和高度
       * - notMerge   : true 表示每次更新时不合并旧配置，而是完全替换
       * - lazyUpdate : true 表示延迟更新，在频繁数据变化时提升性能
       */}
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ width: '100%', height: `${height}px` }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};
