/**
 * @file 堆栈信息展示组件
 * @description 以代码高亮样式展示错误的调用堆栈
 *
 * 功能说明：
 * 1. 解析堆栈字符串，将每一帧拆分为函数名、文件路径、行号、列号
 * 2. 对不同部分应用不同的颜色高亮：
 *    - 函数名：紫色（--accent-purple）
 *    - 文件路径：蓝色（--accent-blue）
 *    - 行号/列号：黄色（--accent-yellow）
 * 3. 如果后端已通过 SourceMap 还原了堆栈，则展示的是源码级的文件路径和行号
 *
 * SourceMap 还原流程（面试重点）：
 * 1. CI 构建时，webpack/vite 生成 .map 文件
 * 2. 构建脚本调用 POST /v1/sourcemap 上传 .map 文件到 Gateway
 * 3. 用户查看错误详情时，后端读取错误事件中的压缩后行列号
 * 4. 后端使用 source-map 库 + 对应版本的 .map 文件还原为源码位置
 * 5. 返回还原后的堆栈字符串和前后 5 行源码上下文
 *
 * Props:
 * @prop stack - 堆栈字符串（可能已经过 SourceMap 还原）
 *              格式示例：
 *              "Error: Cannot read property 'x' of undefined
 *                  at handleClick (src/components/Button.tsx:42:15)
 *                  at onClick (src/pages/Home.tsx:18:7)"
 */

/**
 * StackTrace 组件的 Props 类型
 */
interface StackTraceProps {
  /**
   * 堆栈字符串
   * 如果为空或 undefined，显示"无堆栈信息"提示
   * 如果已通过 SourceMap 还原，则包含源码级的文件路径和行号
   */
  stack?: string;
}

/**
 * 解析后的堆栈帧
 *
 * @property raw - 原始行文本
 * @property functionName - 函数名（如 "handleClick"、"anonymous"）
 * @property fileName - 文件路径（如 "src/components/Button.tsx"）
 * @property line - 行号
 * @property column - 列号
 */
interface StackFrame {
  raw: string;
  functionName?: string;
  fileName?: string;
  line?: number;
  column?: number;
}

/**
 * 解析堆栈字符串为结构化的帧数组
 *
 * 支持的堆栈格式：
 * - Chrome/Node: "    at functionName (fileName:line:column)"
 * - Chrome/Node (anonymous): "    at fileName:line:column"
 * - Firefox: "functionName@fileName:line:column"
 *
 * @param stack - 原始堆栈字符串
 * @returns 解析后的 StackFrame 数组
 */
function parseStack(stack: string): StackFrame[] {
  const lines = stack.split('\n');

  return lines.map((line) => {
    const trimmed = line.trim();

    /**
     * 尝试匹配 Chrome/Node 格式：
     * "at functionName (fileName:line:column)"
     * "at fileName:line:column"
     */
    const chromeMatch = trimmed.match(
      /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/,
    );

    if (chromeMatch) {
      return {
        raw: trimmed,
        functionName: chromeMatch[1] || '<anonymous>',
        fileName: chromeMatch[2],
        line: parseInt(chromeMatch[3], 10),
        column: parseInt(chromeMatch[4], 10),
      };
    }

    /**
     * 尝试匹配 Firefox 格式：
     * "functionName@fileName:line:column"
     */
    const firefoxMatch = trimmed.match(
      /^(.+?)@(.+?):(\d+):(\d+)$/,
    );

    if (firefoxMatch) {
      return {
        raw: trimmed,
        functionName: firefoxMatch[1],
        fileName: firefoxMatch[2],
        line: parseInt(firefoxMatch[3], 10),
        column: parseInt(firefoxMatch[4], 10),
      };
    }

    return { raw: trimmed };
  });
}

/**
 * StackTrace 堆栈展示组件
 *
 * 渲染逻辑：
 * 1. 如果 stack 为空 → 显示"无堆栈信息"提示
 * 2. 解析堆栈字符串为帧数组
 * 3. 第一行（错误消息）直接显示，不做高亮处理
 * 4. 后续每一帧：
 *    - 函数名用紫色高亮
 *    - 文件路径用蓝色高亮
 *    - 行号:列号用黄色高亮
 *    - 未能解析的行保持原样显示
 */
export function StackTrace({ stack }: StackTraceProps) {
  if (!stack) {
    return (
      <div className="text-muted" style={{ padding: '16px', textAlign: 'center' }}>
        无堆栈信息
      </div>
    );
  }

  const frames = parseStack(stack);

  return (
    <div className="stack-trace">
      {frames.map((frame, index) => {
        /**
         * 第一行通常是错误消息（如 "Error: Cannot read property..."）
         * 或者是未能解析的行，直接原样显示
         */
        if (!frame.fileName) {
          return (
            <div key={index} style={{ marginBottom: index === 0 ? '8px' : '0' }}>
              {frame.raw}
            </div>
          );
        }

        /**
         * 已解析的堆栈帧：应用颜色高亮
         * 格式：at <函数名> (<文件路径>:<行号>:<列号>)
         */
        return (
          <div key={index}>
            {'  at '}
            <span className="stack-frame-func">{frame.functionName}</span>
            {' ('}
            <span className="stack-frame-file">{frame.fileName}</span>
            {':'}
            <span className="stack-frame-line">{frame.line}</span>
            {':'}
            <span className="stack-frame-line">{frame.column}</span>
            {')'}
          </div>
        );
      })}
    </div>
  );
}
