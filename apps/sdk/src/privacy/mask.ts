/**
 * @file privacy/mask.ts
 * @description 隐私脱敏配置转换器 — 将 SDK 的隐私配置转换为 rrweb 的遮盖选项
 *
 * 在用户操作录制（rrweb）中，需要对敏感信息进行脱敏处理：
 * 1. 输入框遮盖（maskInputOptions）：
 *    - 密码框（password）：始终遮盖，不可关闭
 *    - 其他输入框（text、email、tel 等）：根据用户配置决定是否遮盖
 * 2. 元素屏蔽（blockSelector）：
 *    - 完全屏蔽指定 CSS 选择器匹配的元素，不录制其内容
 *    - 默认屏蔽带有 [data-no-record] 属性的元素
 *    - 用户可以通过 privacy.blockSelectors 添加额外的屏蔽选择器
 *
 * 设计决策：
 * - 密码框始终遮盖（安全底线），即使用户没有配置 maskInputs
 * - [data-no-record] 作为默认的屏蔽属性选择器，方便业务方在 HTML 中标记不需要录制的区域
 * - 多个 blockSelector 用逗号拼接，符合 CSS 选择器列表的语法
 * - 返回的对象结构与 rrweb.record() 的配置参数兼容
 */

/* 导入 SDK 的隐私配置类型 */
import type { PrivacyConfig } from '../core';

/**
 * rrweb 输入框遮盖选项接口
 *
 * 对应 rrweb 的 maskInputOptions 配置项。
 * 每个属性对应一种 HTML input 类型，true 表示遮盖该类型的输入内容。
 * 遮盖后，录像回放时该输入框的内容会显示为 *** 等占位符。
 */
export interface MaskInputOptions {
  /** 是否遮盖密码输入框（type="password"） */
  password: boolean;
  /** 是否遮盖文本输入框（type="text"） */
  text: boolean;
  /** 是否遮盖邮箱输入框（type="email"） */
  email: boolean;
  /** 是否遮盖电话输入框（type="tel"） */
  tel: boolean;
}

/**
 * getMaskOptions 的返回值接口
 *
 * 包含 rrweb.record() 所需的两个隐私相关配置项：
 * - maskInputOptions：输入框遮盖配置
 * - blockSelector：元素屏蔽的 CSS 选择器字符串
 */
export interface MaskOptionsResult {
  /** rrweb 的输入框遮盖选项 */
  maskInputOptions: MaskInputOptions;
  /** rrweb 的元素屏蔽 CSS 选择器（多个选择器用逗号分隔） */
  blockSelector: string;
}

/**
 * 将 SDK 的隐私配置转换为 rrweb 的遮盖选项
 *
 * 转换逻辑：
 * 1. maskInputOptions：
 *    - password 始终为 true（安全底线，不可关闭）
 *    - text、email、tel 根据 privacy.maskInputs 配置决定
 *    - 如果 privacy.maskInputs 为 true，则遮盖所有输入框类型
 *    - 如果为 false 或未配置，只遮盖密码框
 * 2. blockSelector：
 *    - 默认包含 [data-no-record]（通用的"不录制"标记）
 *    - 将用户配置的 privacy.blockSelectors 数组中的选择器追加到列表中
 *    - 所有选择器用逗号拼接为一个字符串
 *
 * @param {PrivacyConfig} [privacy] - SDK 的隐私配置对象（可选）
 * @returns {MaskOptionsResult} rrweb 兼容的遮盖选项对象
 *
 * @example
 * ```typescript
 * // 最小配置：只遮盖密码框，屏蔽 [data-no-record] 元素
 * getMaskOptions(undefined);
 * // 返回: { maskInputOptions: { password: true, text: false, email: false, tel: false }, blockSelector: '[data-no-record]' }
 *
 * // 完整配置：遮盖所有输入框，屏蔽支付表单和身份证区域
 * getMaskOptions({ maskInputs: true, blockSelectors: ['.payment-form', '#id-card'] });
 * // 返回: { maskInputOptions: { password: true, text: true, email: true, tel: true }, blockSelector: '[data-no-record],.payment-form,#id-card' }
 * ```
 */
export function getMaskOptions(privacy?: PrivacyConfig): MaskOptionsResult {
  /**
   * 判断是否需要遮盖所有输入框
   * 如果 privacy.maskInputs 为 true，则遮盖 text、email、tel 等类型
   * 否则只遮盖密码框（安全底线）
   */
  const shouldMaskAll = privacy?.maskInputs === true;

  /**
   * 构建 rrweb 的 maskInputOptions 配置
   */
  const maskInputOptions: MaskInputOptions = {
    password: true,                                /* 密码框始终遮盖（安全底线，不可关闭） */
    text: shouldMaskAll,                           /* 文本框：根据配置决定 */
    email: shouldMaskAll,                          /* 邮箱框：根据配置决定 */
    tel: shouldMaskAll,                            /* 电话框：根据配置决定 */
  };

  /**
   * 构建 rrweb 的 blockSelector 配置
   *
   * 初始化选择器列表，默认包含 [data-no-record]
   * 这是一个通用的 HTML 属性选择器，业务方可以在不需要录制的元素上添加此属性：
   * <div data-no-record>这个区域不会被录制</div>
   */
  const selectors: string[] = ['[data-no-record]'];

  /**
   * 追加用户配置的屏蔽选择器
   * 如果 privacy.blockSelectors 是一个非空数组，将其中的选择器追加到列表中
   */
  if (privacy?.blockSelectors && Array.isArray(privacy.blockSelectors)) {
    for (const selector of privacy.blockSelectors) {
      /* 只添加非空的选择器字符串 */
      if (selector && typeof selector === 'string') {
        selectors.push(selector);
      }
    }
  }

  /**
   * 将选择器数组用逗号拼接为一个字符串
   * CSS 选择器列表语法：selector1, selector2, selector3
   * rrweb 会匹配任一选择器对应的元素并屏蔽录制
   */
  const blockSelector = selectors.join(',');

  /* 返回 rrweb 兼容的遮盖选项对象 */
  return {
    maskInputOptions,
    blockSelector,
  };
}
