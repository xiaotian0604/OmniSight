/**
 * @file collectors/behavior.ts
 * @description 用户行为采集器 — 采集用户的点击操作和路由变化
 *
 * 采集两类行为：
 * 1. 点击事件：
 *    - 使用捕获阶段（capture phase）监听，确保在任何 stopPropagation 之前捕获到事件
 *    - 记录点击的元素标签名、class 列表、id、文本内容
 *    - 使用 getAttribute('class') 而非 className，避免 SVG 元素的兼容性问题
 *      （SVG 元素的 className 返回 SVGAnimatedString 对象而非字符串）
 * 2. 路由变化：
 *    - popstate 事件：监听浏览器前进/后退按钮
 *    - pushState/replaceState 劫持：监听 SPA 框架的编程式导航
 *    - hashchange 事件：监听 hash 路由变化（兼容老式 hash 路由）
 *
 * 设计决策：
 * - 点击事件在捕获阶段监听（第三个参数为 true），因为：
 *   1. 某些 UI 库会在冒泡阶段调用 stopPropagation()，导致事件无法到达 window
 *   2. 捕获阶段在冒泡阶段之前执行，不受 stopPropagation 影响
 * - pushState/replaceState 劫持通过重写 history 方法实现，
 *   因为这两个方法不会触发任何事件，必须主动劫持才能监听到
 * - 返回 cleanup 函数，恢复所有劫持并移除所有监听器
 */

/* 导入 Core 类型 */
import type { Core } from '../core';

/**
 * 初始化用户行为采集器
 *
 * 注册点击事件监听和路由变化监听，将用户行为通过 core.capture() 提交给 SDK 核心。
 * 这些行为数据会作为"面包屑"（breadcrumbs）展示在错误详情页中，
 * 帮助开发者还原错误发生前的用户操作路径。
 *
 * @param {Core} core - SDK 核心实例，用于提交捕获到的事件
 * @returns {() => void} cleanup 函数，调用后移除所有行为监听
 */
export function initBehaviorCollector(core: Core): () => void {
  /* 获取调试模式标志 */
  const debug = core.getConfig().debug;

  /* ---------------------------------------------------------------
   * 1. 点击事件监听
   * --------------------------------------------------------------- */

  /**
   * 点击事件处理函数
   *
   * 从点击的目标元素中提取有用的信息：
   * - 标签名（tagName）：如 BUTTON、A、INPUT 等
   * - CSS 类名（class）：用于定位具体的 UI 组件
   * - 元素 ID：用于精确定位元素
   * - 文本内容（textContent）：截取前 50 个字符，帮助理解用户点击了什么
   *
   * @param {MouseEvent} event - 浏览器原生的鼠标点击事件
   */
  const onClickCapture = (event: MouseEvent): void => {
    /* 获取点击的目标元素 */
    const target = event.target as HTMLElement;

    /* 如果目标不是 HTMLElement（极少见），跳过 */
    if (!target || !target.tagName) {
      return;
    }

    /**
     * 使用 getAttribute('class') 而非 target.className 获取 CSS 类名
     *
     * 原因：SVG 元素的 className 属性返回的是 SVGAnimatedString 对象，
     * 而非普通字符串，直接使用会导致 "[object SVGAnimatedString]" 这样的无意义输出。
     * getAttribute('class') 在所有元素类型上都返回字符串或 null，行为一致。
     */
    const className = target.getAttribute('class') || '';

    /* 获取元素的 id 属性 */
    const id = target.id || '';

    /**
     * 获取元素的文本内容，截取前 50 个字符
     * 使用 trim() 去除首尾空白，避免记录大量空白字符
     * 截取长度限制为 50 个字符，防止文本内容过长占用过多上报带宽
     */
    const text = (target.textContent || '').trim().slice(0, 50);

    /* 通过 core.capture() 提交点击行为事件 */
    core.capture({
      type: 'behavior',                            /* 事件类型：用户行为 */
      subType: 'click',                            /* 行为子类型：点击 */
      data: {                                      /* 行为数据（嵌套在 data 字段中，与 BehaviorEvent 接口一致） */
        tagName: target.tagName.toLowerCase(),     /* 元素标签名（转小写，如 button、a、div） */
        className,                                 /* CSS 类名列表 */
        id,                                        /* 元素 ID */
        text,                                      /* 元素文本内容（截取前 50 字符） */
      },
    });
  };

  /**
   * 在捕获阶段注册点击事件监听器
   * 第三个参数 true 表示使用捕获阶段，确保在冒泡阶段的 stopPropagation 之前捕获到事件
   */
  window.addEventListener('click', onClickCapture, true);

  /* ---------------------------------------------------------------
   * 2. 路由变化监听
   * --------------------------------------------------------------- */

  /**
   * 记录上一次的 URL，用于在路由变化时对比
   * 初始值为当前页面的 URL
   */
  let lastUrl = location.href;

  /**
   * 路由变化处理函数
   *
   * 当检测到 URL 发生变化时，提交路由变化事件。
   * 记录变化前的 URL（from）和变化后的 URL（to），
   * 帮助开发者还原用户的导航路径。
   */
  const onRouteChange = (): void => {
    /* 获取当前的 URL */
    const currentUrl = location.href;

    /* 如果 URL 没有变化，跳过（防止重复触发） */
    if (currentUrl === lastUrl) {
      return;
    }

    /* 保存变化前的 URL */
    const from = lastUrl;

    /* 更新 lastUrl 为当前 URL */
    lastUrl = currentUrl;

    /* 通过 core.capture() 提交路由变化事件 */
    core.capture({
      type: 'behavior',                            /* 事件类型：用户行为 */
      subType: 'route-change',                     /* 行为子类型：路由变化 */
      data: {                                      /* 行为数据（嵌套在 data 字段中，与 BehaviorEvent 接口一致） */
        from,                                      /* 变化前的 URL */
        to: currentUrl,                            /* 变化后的 URL */
      },
    });
  };

  /**
   * 监听 popstate 事件
   * popstate 在用户点击浏览器的前进/后退按钮时触发
   * 注意：pushState/replaceState 不会触发 popstate
   */
  window.addEventListener('popstate', onRouteChange);

  /**
   * 监听 hashchange 事件
   * hashchange 在 URL 的 hash 部分（# 后面的内容）变化时触发
   * 兼容使用 hash 路由的老式 SPA（如 Vue Router 的 hash 模式）
   */
  window.addEventListener('hashchange', onRouteChange);

  /**
   * 劫持 history.pushState 方法
   *
   * pushState 是 SPA 框架（React Router、Vue Router 等）进行编程式导航的核心方法。
   * 调用 pushState 不会触发任何事件，因此必须劫持此方法才能监听到路由变化。
   *
   * 劫持策略：保存原始方法引用，替换为包装函数，在调用原始方法后触发路由变化处理。
   */
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (
    state: unknown,                                /* 状态对象 */
    title: string,                                 /* 页面标题（大多数浏览器忽略此参数） */
    url?: string | URL | null,                     /* 新的 URL */
  ): void {
    /* 先调用原始的 pushState 方法，完成实际的 URL 变更 */
    originalPushState(state, title, url);
    /* 然后触发路由变化处理，采集路由变化事件 */
    onRouteChange();
  };

  /**
   * 劫持 history.replaceState 方法
   *
   * replaceState 与 pushState 类似，但不会在历史记录中创建新条目，
   * 而是替换当前的历史记录条目。
   * 同样不会触发任何事件，需要劫持才能监听。
   */
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (
    state: unknown,                                /* 状态对象 */
    title: string,                                 /* 页面标题 */
    url?: string | URL | null,                     /* 新的 URL */
  ): void {
    /* 先调用原始的 replaceState 方法 */
    originalReplaceState(state, title, url);
    /* 然后触发路由变化处理 */
    onRouteChange();
  };

  /* 调试模式下输出初始化信息 */
  if (debug) {
    console.log('[OmniSight] 用户行为采集器已初始化（点击 + 路由变化）');
  }

  /* ---------------------------------------------------------------
   * 返回 cleanup 函数
   * --------------------------------------------------------------- */

  /**
   * cleanup 函数 — 移除所有行为监听器并恢复 history 方法
   *
   * 调用时机：SDK 销毁时由 Core.destroy() 统一调用
   */
  return (): void => {
    /* 移除点击事件监听器（注意第三个参数 true 要与注册时一致） */
    window.removeEventListener('click', onClickCapture, true);

    /* 移除 popstate 事件监听器 */
    window.removeEventListener('popstate', onRouteChange);

    /* 移除 hashchange 事件监听器 */
    window.removeEventListener('hashchange', onRouteChange);

    /* 恢复原始的 history.pushState 方法 */
    history.pushState = originalPushState;

    /* 恢复原始的 history.replaceState 方法 */
    history.replaceState = originalReplaceState;
  };
}
