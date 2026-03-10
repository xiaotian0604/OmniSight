/**
 * @file SourceMap 上传记录页面
 * @description 展示已上传的 SourceMap 文件列表，用于错误堆栈还原
 *
 * SourceMap 的作用（面试重点）：
 * 生产环境的 JavaScript 代码经过压缩混淆后，错误堆栈中的行列号无法对应到源码。
 * SourceMap 文件记录了压缩后代码与源码之间的映射关系。
 * 上传 SourceMap 后，查看错误详情时后端可以自动还原为源码级的堆栈信息。
 *
 * 上传流程：
 * 1. CI/CD 构建时，webpack/vite 生成 .map 文件
 * 2. 构建脚本调用 POST /v1/sourcemap 接口上传 .map 文件
 *    请求参数：appId（项目 ID）、version（版本号，通常为 git sha）、file（.map 文件）
 * 3. Gateway 将 .map 文件存储到文件系统，索引信息写入 sourcemaps 表
 * 4. 查看错误详情时，后端根据 appId + version 找到对应的 .map 文件
 * 5. 使用 source-map 库还原压缩后的行列号为源码位置
 *
 * 页面功能：
 * 1. 展示已上传的 SourceMap 文件列表
 * 2. 每条记录显示：版本号、文件名、上传时间
 * 3. 提供上传命令示例
 *
 * 数据来源：
 *   TODO: useQuery → GET /v1/sourcemaps
 *   目前使用占位数据展示页面结构
 */
import { EmptyState } from '@/components/EmptyState';

/**
 * SourceMap 记录类型
 *
 * @property id - 记录 ID
 * @property version - 应用版本号（通常为 git commit sha 的前 8 位）
 * @property filename - 原始 JS 文件名（如 "main.js"、"vendor.js"）
 * @property mapPath - .map 文件的存储路径
 * @property createdAt - 上传时间
 */
interface SourcemapRecord {
  id: string;
  version: string;
  filename: string;
  mapPath: string;
  createdAt: string;
}

/**
 * 占位数据
 * 展示页面结构和样式，后续替换为真实 API 数据
 *
 * TODO: 接入 GET /v1/sourcemaps API
 */
const MOCK_RECORDS: SourcemapRecord[] = [];

/**
 * SourceMap 管理页面组件
 *
 * 渲染逻辑：
 * 1. 上传命令示例（curl 命令）
 * 2. 已上传的 SourceMap 列表（表格或空状态）
 *
 * 面试讲解要点：
 * - SourceMap 的工作原理
 * - CI/CD 集成上传的流程
 * - 安全考虑：.map 文件不应部署到生产环境的 CDN
 */
export default function SourcemapPage() {
  const records = MOCK_RECORDS;

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* ==================== 上传指引 ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">上传 SourceMap</span>
          <span className="card-subtitle">在 CI/CD 构建流程中添加上传步骤</span>
        </div>

        <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '12px' }}>
          构建完成后，使用以下命令上传 .map 文件到 OmniSight：
        </p>

        {/* curl 上传命令示例 */}
        <div className="code-block">
          <pre style={{ margin: 0 }}>{`# 上传 SourceMap 文件
# 在 CI/CD 的构建步骤之后执行

# 获取当前 git commit sha 作为版本号
VERSION=$(git rev-parse --short HEAD)

# 遍历 dist 目录下的所有 .map 文件并上传
for mapfile in dist/assets/*.map; do
  curl -X POST \\
    -H "x-api-key: your-api-key" \\
    -F "appId=your-app-id" \\
    -F "version=$VERSION" \\
    -F "file=@$mapfile" \\
    https://your-gateway.com/v1/sourcemap
done

# 上传完成后，删除 .map 文件（不要部署到 CDN）
rm -f dist/assets/*.map`}</pre>
        </div>

        <p
          style={{
            fontSize: '12px',
            color: '#d29922',
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>⚠️</span>
          安全提示：.map 文件包含源码信息，切勿部署到公开可访问的 CDN
        </p>
      </div>

      {/* ==================== 上传记录列表 ==================== */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">上传记录</span>
          <span className="card-subtitle">已上传的 SourceMap 文件列表</span>
        </div>

        {/* 空状态 */}
        {records.length === 0 && (
          <EmptyState
            icon="🗺️"
            title="暂无 SourceMap"
            description="还没有上传过 SourceMap 文件。上传后，错误详情页将显示源码级的堆栈信息。"
          />
        )}

        {/* 记录表格 */}
        {records.length > 0 && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>版本号</th>
                  <th>文件名</th>
                  <th>存储路径</th>
                  <th>上传时间</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    {/* 版本号：通常是 git sha 前 8 位 */}
                    <td>
                      <span className="font-mono badge badge-info">{record.version}</span>
                    </td>

                    {/* 文件名 */}
                    <td className="font-mono" style={{ fontSize: '12px' }}>
                      {record.filename}
                    </td>

                    {/* 存储路径 */}
                    <td className="font-mono text-muted" style={{ fontSize: '12px' }}>
                      {record.mapPath}
                    </td>

                    {/* 上传时间 */}
                    <td className="text-muted" style={{ fontSize: '12px' }}>
                      {new Date(record.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
