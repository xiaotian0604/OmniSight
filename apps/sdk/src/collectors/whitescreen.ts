/**
 * @file collectors/whitescreen.ts
 * @description 白屏检测器 — 检测 SPA 应用是否出现白屏（页面渲染失败）
 *
 * 检测原理：
 * 1. 在页面加载后等待 3 秒（给 SPA 框架足够的渲染时间）
 * 2. 检查 #root 或 #app 容器元素的子元素数量
 * 3. 如果容器存在但子元素数为 0，判定为白屏
 *
 * 设计决策：
 * - 检查 #root 或 #app 而非 document.body，原因：
 *   1. SPA 应用通常将内容渲染到 #root（React）或 #app（Vue）容器中
 *   2. body 下可能有 script 标签等非内容元素，检查 body 会产生误判
 *   3. 如果两个容器都不存在，说明不是标准 SPA 结构，跳过检测
 * - 3 秒超时的选择：
 *   1. 太短（如 1s）：SPA 可能还在加载数据和渲染，产生误报
 *   2. 太长（如 10s）：用户已经离开页面，检测失去意义
 *   3. 3s 是一个合理的折中，大多数 SPA 应该在 3s 内完成首屏渲染
 * - 返回 cleanup 函数（clearTimeout），供 SDK 销毁时取消未执行的检测
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * SPA 应用常用的根容器元素 ID 列表
 * React 默认使用 #root，Vue 默认使用 #app
 * 按优先级排列，找到第一个存在的容器即停止
 */
const ROOT_SELECTORS = ['#root', '#app'];

/**
 * 白屏检测的延迟时间（毫秒）
 * 在页面加载后等待此时间再进行检测，给 SPA 框架足够的渲染时间
 */
const CHECK_DELAY_MS = 3000;

/**
 * 初始化白屏检测器
 *
 * 在页面加载 3 秒后检查 SPA 根容器是否有子元素，
 * 如果没有子元素则判定为白屏，通过 core.capture() 上报。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件
 * @returns {() => void} cleanup 函数，调用后取消未执行的白屏检测
 */
export function initWhitescreenCollector(core: Core): () => void {
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;

  /**
   * 定时器引用
   * 保存 setTimeout 的返回值，供 cleanup 函数取消定时器
   */
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 设置 3 秒后执行白屏检测
   *
   * 使用 setTimeout 而非 requestIdleCallback，原因：
   * 1. requestIdleCallback 的执行时机不确定，可能延迟很久
   * 2. setTimeout 能精确控制检测时间点
   * 3. 白屏检测本身开销极小（只是读取 DOM 属性），不需要等待空闲时间
   */
  timer = setTimeout(() => {
    /* 标记定时器已执行，清空引用 */
    timer = null;

    /**
     * 查找 SPA 根容器元素
     * 遍历预定义的选择器列表，返回第一个找到的元素
     */
    let rootElement: Element | null = null;
    for (const selector of ROOT_SELECTORS) {
      /* 尝试查找当前选择器对应的元素 */
      rootElement = document.querySelector(selector);
      /* 找到第一个存在的容器即停止 */
      if (rootElement) {
        break;
      }
    }

    /**
     * 如果没有找到任何根容器元素，跳过白屏检测
     *
     * 可能的原因：
     * 1. 页面不是 SPA 应用（传统多页应用）
     * 2. SPA 使用了自定义的容器 ID（非 #root 或 #app）
     * 在这些情况下，白屏检测不适用，直接返回
     */
    if (!rootElement) {
      if (debug) {
        console.log('[OmniSight] 未找到 SPA 根容器（#root 或 #app），跳过白屏检测');
      }
      return;
    }

    /**
     * 检查根容器的子元素数量
     *
     * 使用 children.length 而非 childNodes.length，原因：
     * - children 只包含 Element 节点（真正的 DOM 元素）
     * - childNodes 包含文本节点、注释节点等，可能产生误判
     *   （例如容器中只有一个空白文本节点，childNodes.length > 0 但实际是白屏）
     */
    const childCount = rootElement.children.length;

    /**
     * 如果子元素数为 0，判定为白屏
     * 正常情况下，SPA 框架在 3 秒内应该已经渲染出至少一个子元素
     */
    if (childCount === 0) {
      /* 通过 core.capture() 上报白屏事件（字段与 WhitescreenEvent 接口一致） */
      core.capture({
        type: 'whitescreen',                       /* 事件类型：白屏 */
        /**
         * 检测到的根元素标签名
         * 记录检查的根容器选择器，方便排查问题
         * 例如："DIV#root" 或 "DIV#app"
         */
        rootElement: rootElement.id
          ? `${rootElement.tagName}#${rootElement.id}`
          : rootElement.tagName,
        /**
         * 采样点中空白点的数量
         * 当前简化实现：子元素数为 0 时视为全部采样点为空
         * 使用 18 作为默认采样点总数（业界常用值）
         */
        emptyPoints: 18,
        /**
         * 页面可见区域的宽度（像素）
         */
        viewportWidth: document.documentElement.clientWidth,
        /**
         * 页面可见区域的高度（像素）
         */
        viewportHeight: document.documentElement.clientHeight,
      });

      /* 调试模式下输出白屏检测结果 */
      if (debug) {
        console.warn(
          `[OmniSight] 检测到白屏！根容器 #${rootElement.id} 在 ${CHECK_DELAY_MS}ms 后仍无子元素`,
        );
      }
    } else {
      /* 调试模式下输出正常检测结果 */
      if (debug) {
        console.log(
          `[OmniSight] 白屏检测通过，根容器 #${rootElement.id} 有 ${childCount} 个子元素`,
        );
      }
    }
  }, CHECK_DELAY_MS);

  /* 调试模式下输出初始化信息 */
  if (debug) {
    console.log(`[OmniSight] 白屏检测器已初始化，将在 ${CHECK_DELAY_MS}ms 后执行检测`);
  }

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 取消未执行的白屏检测定时器
   *
   * 如果 SDK 在 3 秒内被销毁（例如 SPA 路由切换导致组件卸载），
   * 需要取消定时器，避免在 SDK 已销毁后还执行检测逻辑。
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用
   */
  return (): void => {
    /* 如果定时器尚未执行，取消它 */
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
