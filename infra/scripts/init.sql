-- ===============================================================
-- OmniSight 数据库初始化脚本
-- 由 docker-compose 挂载到 /docker-entrypoint-initdb.d/ 自动执行
--
-- 表结构说明：
-- 1. projects    — 接入方项目表，每个项目有唯一 api_key 用于 SDK 鉴权
-- 2. events      — 核心事件表，转为 TimescaleDB 超表按时间自动分区
-- 3. replay_sessions — rrweb 录像表，按 session 存储
-- 4. sourcemaps  — SourceMap 索引表，用于错误堆栈还原
-- ===============================================================

-- 启用 TimescaleDB 扩展（timescale/timescaledb 镜像已预装，但需显式启用）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------
-- 1. 项目表
-- 每个接入方对应一个项目，api_key 用于 SDK 上报时的身份校验
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,            -- 项目名称
  api_key    VARCHAR(64) UNIQUE NOT NULL,       -- SDK 上报鉴权密钥
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 2. 事件表（核心）
-- 存储所有类型的采集事件：error / api / vital / resource / behavior / whitescreen
-- 使用 TimescaleDB 超表按时间自动分区，提升时序查询性能
--
-- payload 字段存储完整事件 JSON，不同类型事件有不同字段
-- 这样设计的好处：一张表存所有事件类型，查询时通过 type 字段过滤
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          UUID DEFAULT gen_random_uuid(),
  app_id      VARCHAR(64) NOT NULL,            -- 关联项目 ID
  session_id  VARCHAR(64) NOT NULL,            -- 用户会话 ID
  type        VARCHAR(20) NOT NULL,            -- 事件类型：error/api/vital/...
  ts          TIMESTAMPTZ NOT NULL,            -- 事件发生时间（客户端时间戳）
  fingerprint VARCHAR(64),                     -- 错误去重指纹（仅 error 类型有值）
  payload     JSONB NOT NULL,                  -- 完整事件数据（JSON 格式）
  url         TEXT,                            -- 事件发生时的页面 URL
  ua          TEXT,                            -- User-Agent
  country     VARCHAR(64),                     -- IP 解析后的国家（Worker 富化）
  city        VARCHAR(64),                     -- IP 解析后的城市（Worker 富化）
  PRIMARY KEY (id, ts)                         -- TimescaleDB 超表要求 ts 必须在主键中
);

-- 转为 TimescaleDB 超表（按时间自动分区，默认按 7 天一个分区）
SELECT create_hypertable('events', 'ts', if_not_exists => TRUE);

-- 自动保留策略：90 天后自动删除旧数据，控制存储成本
SELECT add_retention_policy('events', INTERVAL '90 days', if_not_exists => TRUE);

-- 常用查询索引
CREATE INDEX IF NOT EXISTS idx_events_app_type ON events (app_id, type, ts DESC);       -- 按项目+类型查询
CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events (fingerprint, ts DESC);     -- 错误聚合查询
CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id);                   -- 按会话查询

-- ---------------------------------------------------------------
-- 3. 录像表
-- 存储 rrweb 录制的用户操作录像，按 session_id 存储
-- events 字段是 rrweb 事件数组的 JSON
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS replay_sessions (
  session_id  VARCHAR(64) PRIMARY KEY,
  app_id      VARCHAR(64) NOT NULL,
  events      JSONB NOT NULL,                  -- rrweb events 数组
  error_count INT DEFAULT 0,                   -- 关联的错误数量
  duration    INT,                             -- 录像时长（ms）
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 4. SourceMap 索引表
-- CI 构建时上传 .map 文件，查看错误时服务端还原压缩后的堆栈
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sourcemaps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     VARCHAR(64) NOT NULL,
  version    VARCHAR(64) NOT NULL,             -- 应用版本号（如 git sha）
  filename   VARCHAR(256) NOT NULL,            -- 原始 JS 文件名
  map_path   TEXT NOT NULL,                    -- .map 文件存储路径
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (app_id, version, filename)           -- 同一版本同一文件只有一份 map
);

-- ---------------------------------------------------------------
-- 插入默认项目，便于本地开发调试
-- api_key = 'dev-api-key-omnisight'，SDK init 时使用此 key
-- ---------------------------------------------------------------
INSERT INTO projects (name, api_key)
VALUES ('Default', 'dev-api-key-omnisight')
ON CONFLICT (api_key) DO NOTHING;
