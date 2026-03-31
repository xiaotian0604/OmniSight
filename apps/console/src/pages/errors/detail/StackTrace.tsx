/**
 * @file 堆栈信息展示组件
 * @description 优先展示 Gateway 返回的结构化多帧 SourceMap 结果，必要时回退到原始 stack
 */
import { useMemo, useState } from 'react';
import type { MappedStackFrame } from '@/api/errors';

interface StackTraceProps {
  stack?: string;
  rawStack?: string;
  mappedFrames?: MappedStackFrame[];
}

interface ParsedStackFrame {
  raw: string;
  functionName?: string;
  fileName?: string;
  line?: number;
  column?: number;
}

function parseRawStack(stack: string): ParsedStackFrame[] {
  return stack.split('\n').map((line) => {
    const trimmed = line.trim();

    const chromeMatch = trimmed.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (chromeMatch) {
      return {
        raw: trimmed,
        functionName: chromeMatch[1] || '<anonymous>',
        fileName: chromeMatch[2],
        line: parseInt(chromeMatch[3], 10),
        column: parseInt(chromeMatch[4], 10),
      };
    }

    const firefoxMatch = trimmed.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
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

function formatLocation(file?: string, line?: number, column?: number): string {
  if (!file) {
    return '未知位置';
  }

  return `${file}:${line ?? '?'}:${column ?? '?'}`;
}

export function StackTrace({ stack, rawStack, mappedFrames }: StackTraceProps) {
  const [showRawStack, setShowRawStack] = useState(false);
  const structuredFrames = mappedFrames?.length ? mappedFrames : undefined;
  const fallbackFrames = useMemo(() => {
    if (structuredFrames || !stack) {
      return [];
    }
    return parseRawStack(stack);
  }, [structuredFrames, stack]);

  if (!structuredFrames && !stack && !rawStack) {
    return (
      <div className="text-muted" style={{ padding: '16px', textAlign: 'center' }}>
        无堆栈信息
      </div>
    );
  }

  return (
    <div>
      {structuredFrames ? (
        <div className="stack-trace">
          {structuredFrames.map((frame, index) => {
            if (!frame.compiledFile) {
              return (
                <div key={`${frame.raw}-${index}`} style={{ marginBottom: index === 0 ? '8px' : '0' }}>
                  {frame.raw.trim() || frame.raw}
                </div>
              );
            }

            const primaryLocation = frame.mapped
              ? formatLocation(frame.originalFile, frame.originalLine, frame.originalColumn)
              : formatLocation(frame.compiledFile, frame.compiledLine, frame.compiledColumn);
            const secondaryLocation = frame.mapped
              ? formatLocation(frame.compiledFile, frame.compiledLine, frame.compiledColumn)
              : undefined;

            return (
              <div key={`${frame.raw}-${index}`} style={{ marginBottom: '10px' }}>
                <div>
                  {'  at '}
                  <span className="stack-frame-func">{frame.functionName || '<anonymous>'}</span>
                  {' ('}
                  <span className="stack-frame-file">{primaryLocation}</span>
                  {')'}
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e', paddingLeft: '24px' }}>
                  {frame.mapped
                    ? `映射自 ${secondaryLocation}`
                    : '未命中 SourceMap'}
                  {frame.release ? ` | release: ${frame.release}` : ''}
                  {frame.artifact ? ` | artifact: ${frame.artifact}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="stack-trace">
          {fallbackFrames.map((frame, index) => {
            if (!frame.fileName) {
              return (
                <div key={index} style={{ marginBottom: index === 0 ? '8px' : '0' }}>
                  {frame.raw}
                </div>
              );
            }

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
      )}

      {structuredFrames && rawStack && (
        <div style={{ marginTop: '16px' }}>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setShowRawStack((prev) => !prev)}
          >
            {showRawStack ? '隐藏原始堆栈' : '查看原始堆栈'}
          </button>

          {showRawStack && (
            <pre
              style={{
                marginTop: '12px',
                marginBottom: 0,
                padding: '12px',
                overflowX: 'auto',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#e6edf3',
                borderRadius: '8px',
                fontSize: '12px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {rawStack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
