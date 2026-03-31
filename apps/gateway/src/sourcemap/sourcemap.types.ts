/**
 * ===============================================================
 * OmniSight Gateway — SourceMap 共享类型
 * ===============================================================
 *
 * 这组类型用于在 SourceMap 解析服务、错误详情接口和告警模块之间共享
 * “源码定位结果”的结构定义，避免各处自己拼对象导致字段漂移。
 * ===============================================================
 */

/**
 * 一行源码上下文
 *
 * 用于在 console 错误详情页和飞书告警里展示命中的源码片段。
 */
export interface SourceContextLine {
  /** 源文件中的真实行号（从 1 开始） */
  lineNumber: number;
  /** 这一行的源码内容 */
  content: string;
  /** 是否为命中的目标行 */
  isTarget: boolean;
}

/**
 * SourceMap 解析后的源码定位信息
 *
 * 设计原则：
 * - 先返回“命中的 sourcemap 元数据”（release / artifact / git）
 * - 如果还原到了源码位置，再补 originalFile / originalLine / sourceContext
 *
 * 这样即使 map 文件存在但没有 sourcesContent，也仍然能返回定位和版本信息。
 */
export interface ResolvedSourceLocation {
  /** 命中的发布版本，通常等于 sourcemaps.version */
  release: string;
  /** 命中的打包产物名，例如 app.abc123.js */
  artifact: string;
  /** 原始源码文件路径 */
  originalFile?: string;
  /** 原始源码行号（从 1 开始） */
  originalLine?: number;
  /** 原始源码列号（人类可读，按 1 开始返回） */
  originalColumn?: number;
  /** 源码上下文，默认截取目标行前后若干行 */
  sourceContext?: SourceContextLine[];
  /** 关联的 Git 元信息 */
  gitCommit?: string;
  gitAuthor?: string;
  gitMessage?: string;
  gitBranch?: string;
}

/**
 * 结构化的 stack 帧映射结果
 *
 * 用途：
 * - 错误详情页逐帧展示编译后位置与源码位置
 * - 保留无法命中的帧，避免“只返回成功帧”导致调用链断裂
 */
export interface MappedStackFrame {
  /** 原始 stack 行文本 */
  raw: string;
  /** 解析出的函数名（如果存在） */
  functionName?: string;
  /** 编译后文件路径 */
  compiledFile?: string;
  /** 编译后行号 */
  compiledLine?: number;
  /** 编译后列号 */
  compiledColumn?: number;
  /** 命中的打包产物名 */
  artifact?: string;
  /** 命中的发布版本 */
  release?: string;
  /** 原始源码文件路径 */
  originalFile?: string;
  /** 原始源码行号（从 1 开始） */
  originalLine?: number;
  /** 原始源码列号（从 1 开始） */
  originalColumn?: number;
  /** 是否成功完成 SourceMap 命中 */
  mapped: boolean;
}
