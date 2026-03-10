# OmniSight 本地运行指南

> 本文档面向首次运行本项目的开发者，从零开始，一步一步把整个系统跑起来。

---

## 目录

- [一、环境准备](#一环境准备)
  - [1.1 安装 Node.js 18+](#11-安装-nodejs-18)
  - [1.2 安装 pnpm 9](#12-安装-pnpm-9)
  - [1.3 安装 Docker Desktop](#13-安装-docker-desktop)
- [二、启动项目（5 步）](#二启动项目5-步)
- [三、验证是否启动成功](#三验证是否启动成功)
- [四、各服务端口与地址](#四各服务端口与地址)
- [五、常用命令速查](#五常用命令速查)
- [六、常见问题排查](#六常见问题排查)
- [七、项目架构速览](#七项目架构速览)
- [八、停止与清理](#八停止与清理)

---

## 一、环境准备

### 1.1 安装 Node.js 18+

本项目要求 Node.js >= 18。推荐使用 nvm 管理多版本：

```bash
# 安装 nvm（macOS / Linux）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 关闭并重新打开终端，然后执行：
nvm install 18
nvm use 18

# 验证版本
node --version
# 期望输出：v18.x.x 或更高
```

如果你用的是 Windows，可以去 https://nodejs.org 直接下载 v18 LTS 安装包。

### 1.2 安装 pnpm 9

```bash
# 方式一：通过 corepack（Node.js 自带）
corepack enable
corepack prepare pnpm@9.0.0 --activate

# 方式二：通过 npm 全局安装
npm install -g pnpm@9

# 验证版本
pnpm --version
# 期望输出：9.x.x
```

### 1.3 安装 Docker Desktop

PostgreSQL（TimescaleDB）和 Redis 通过 Docker 容器运行，无需手动安装数据库。

- **macOS**：https://www.docker.com/products/docker-desktop/ 下载安装
- **Windows**：同上，安装后需启用 WSL2 后端
- **Linux**：`sudo apt install docker.io docker-compose-plugin`

安装后启动 Docker Desktop，等待状态栏图标变为绿色（表示 Docker Engine 已就绪）。

验证：

```bash
docker --version
# 期望输出：Docker version 24.x.x 或更高

docker compose version
# 期望输出：Docker Compose version v2.x.x
```

---

## 二、启动项目（5 步）

打开终端，进入项目根目录：

```bash
cd /Users/liuliuwenbo/WebstormProjects/OmniSight
```

### 第 1 步：启动 PostgreSQL + Redis

```bash
docker compose up -d
```

首次运行会拉取镜像（timescale/timescaledb + redis），大约需要 1~3 分钟。

等待容器就绪：

```bash
docker compose ps
```

期望看到两个容器状态都是 `running (healthy)`：

```
NAME                    STATUS
omnisight-postgres-1    Up ... (healthy)
omnisight-redis-1       Up ... (healthy)
```

> **说明**：`init.sql` 会在 PostgreSQL 首次启动时自动执行，创建 `projects`、`events`、`replay_sessions`、`sourcemaps` 四张表，并插入一条默认项目（api_key = `dev-api-key-omnisight`）。

### 第 2 步：配置环境变量

```bash
cp .env.example .env
```

默认配置已经与 docker-compose.yml 中的数据库/Redis 地址匹配，**不需要修改任何内容**就能直接使用。

### 第 3 步：安装依赖

```bash
pnpm install
```

pnpm 会根据 `pnpm-workspace.yaml` 自动识别所有子包（apps/* 和 packages/*），一次性安装全部依赖。大约需要 1~2 分钟。

### 第 4 步：构建共享包

```bash
pnpm --filter @omnisight/shared-types build
pnpm --filter @omnisight/ui-components build
```

这两个包是被 SDK、Gateway、Console 共同依赖的，必须先构建，否则其他包找不到类型定义。

### 第 5 步：启动服务

**方式 A — 一键启动所有服务（推荐）：**

```bash
pnpm dev
```

Turborepo 会并行启动 Gateway 和 Console。

**方式 B — 分别启动（方便查看各自日志）：**

终端 1 — 启动 Gateway（后端）：

```bash
pnpm --filter @omnisight/gateway dev
```

终端 2 — 启动 Console（前端）：

```bash
pnpm --filter @omnisight/console dev
```

---

## 三、验证是否启动成功

按以下顺序检查：

### 3.1 检查数据库连通性

浏览器打开 http://localhost:3000/health

期望返回：

```json
{
  "status": "ok",
  "postgres": "connected",
  "redis": "connected"
}
```

如果看到这个 JSON，说明 Gateway 已成功连接 PostgreSQL 和 Redis。

### 3.2 查看 API 文档

浏览器打开 http://localhost:3000/api-docs

这是 Swagger 自动生成的接口文档，可以在页面上直接测试每个接口。

### 3.3 打开控制台

浏览器打开 http://localhost:5173

你会看到 OmniSight 控制台界面。因为还没有上报数据，各页面会显示空状态。

### 3.4 （可选）构建并测试 SDK

```bash
# 构建 SDK（输出 ESM/CJS/IIFE 三种格式到 apps/sdk/dist/）
pnpm --filter @omnisight/sdk build

# 运行 SDK 单元测试
pnpm --filter @omnisight/sdk test
```

---

## 四、各服务端口与地址

| 服务 | 地址 | 说明 |
|------|------|------|
| **Console 前端** | http://localhost:5173 | React 控制台，Vite 开发服务器 |
| **Gateway 后端** | http://localhost:3000 | NestJS API 服务 |
| **Swagger 文档** | http://localhost:3000/api-docs | 接口文档（仅开发环境） |
| **健康检查** | http://localhost:3000/health | PG + Redis 连通性检查 |
| **PostgreSQL** | localhost:5432 | 数据库：omnisight，用户：postgres，密码：postgres |
| **Redis** | localhost:6379 | 无密码 |

---

## 五、常用命令速查

```bash
# ==================== 日常开发 ====================

# 启动所有服务
pnpm dev

# 单独启动 Gateway
pnpm --filter @omnisight/gateway dev

# 单独启动 Console
pnpm --filter @omnisight/console dev

# SDK 监听模式（修改源码自动重新构建）
pnpm --filter @omnisight/sdk dev

# ==================== 构建 ====================

# 构建所有包
pnpm build

# 只构建 SDK
pnpm --filter @omnisight/sdk build

# 只构建 Gateway（生产部署用）
pnpm --filter @omnisight/gateway build

# ==================== 测试 ====================

# 运行所有测试
pnpm test

# 只运行 SDK 测试
pnpm --filter @omnisight/sdk test

# SDK 测试监听模式
pnpm --filter @omnisight/sdk test:watch

# ==================== 数据库 ====================

# 启动 PG + Redis
docker compose up -d

# 查看容器状态
docker compose ps

# 查看 PG 日志
docker compose logs postgres

# 连接 PG 命令行
docker compose exec postgres psql -U postgres -d omnisight

# 重置数据库（删除所有数据，重新执行 init.sql）
docker compose down -v && docker compose up -d

# ==================== 清理 ====================

# 清理所有构建产物
pnpm clean

# 清理 node_modules（需要重新 pnpm install）
pnpm clean
```

---

## 六、常见问题排查

### Q1：`pnpm install` 报错 "This version of pnpm requires at least Node.js v18.12"

**原因**：Node.js 版本过低。

**解决**：

```bash
nvm install 18
nvm use 18
node --version  # 确认是 v18+
pnpm install    # 重新安装
```

### Q2：`docker compose up -d` 报错 "Cannot connect to the Docker daemon"

**原因**：Docker Desktop 未启动。

**解决**：打开 Docker Desktop 应用，等待状态栏图标变绿后重试。

### Q3：Gateway 启动报错 "connect ECONNREFUSED 127.0.0.1:5432"

**原因**：PostgreSQL 容器未就绪。

**解决**：

```bash
# 检查容器状态
docker compose ps

# 如果状态不是 healthy，等待几秒后重试
# 如果容器未运行，重新启动
docker compose up -d

# 查看 PG 日志排查问题
docker compose logs postgres
```

### Q4：Gateway 启动报错 "connect ECONNREFUSED 127.0.0.1:6379"

**原因**：Redis 容器未就绪。

**解决**：同 Q3，检查 Redis 容器状态：

```bash
docker compose logs redis
```

### Q5：Console 页面打开后接口全部 404 或 Network Error

**原因**：Gateway 未启动，或 Vite 代理未生效。

**解决**：

1. 确认 Gateway 已启动并监听 3000 端口
2. 确认浏览器访问的是 http://localhost:5173（Vite 代理只在开发服务器上生效）
3. 直接访问 http://localhost:3000/health 确认 Gateway 可达

### Q6：`pnpm --filter @omnisight/gateway dev` 报错找不到 `@omnisight/shared-types`

**原因**：共享包未构建。

**解决**：

```bash
pnpm --filter @omnisight/shared-types build
pnpm --filter @omnisight/ui-components build
```

### Q7：端口被占用（Address already in use）

**解决**：

```bash
# 查找占用 3000 端口的进程
lsof -i :3000

# 杀掉对应进程
kill -9 <PID>

# 或者修改 .env 中的 PORT 为其他端口
```

### Q8：数据库表不存在（relation "events" does not exist）

**原因**：`init.sql` 未执行（通常是因为 PG 数据卷已存在，Docker 不会重复执行初始化脚本）。

**解决**：

```bash
# 删除数据卷并重新创建容器
docker compose down -v
docker compose up -d
```

---

## 七、项目架构速览

```
请求流向：

  浏览器用户
      │
      ▼
  ┌─────────┐    采集事件     ┌─────────────┐
  │  SDK    │ ──────────────▶ │  Gateway    │
  │ (浏览器) │   POST /v1/    │  (NestJS)   │
  └─────────┘   ingest/batch  └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │  Bull Queue │
                              │  (Redis)    │
                              └──────┬──────┘
                                     │ 异步消费
                              ┌──────┴──────┐
                              │   Worker    │
                              │ (去重+入库)  │
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │ PostgreSQL  │
                              │ (TimescaleDB)│
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
  ┌─────────┐    查询数据     │  Gateway    │
  │ Console │ ◀────────────── │  查询接口   │
  │ (React) │   GET /v1/*    └─────────────┘
  └─────────┘
```

| 模块 | 目录 | 技术栈 | 职责 |
|------|------|--------|------|
| SDK | `apps/sdk/` | TypeScript + Rollup | 浏览器端采集：错误、API、性能、行为、白屏、录像 |
| Gateway | `apps/gateway/` | NestJS + Bull + pg | 数据接入、队列消费、查询接口、鉴权 |
| Console | `apps/console/` | React 18 + ECharts | 可视化控制台：错误列表、性能图表、录像回放 |
| shared-types | `packages/shared-types/` | TypeScript | 全链路共享类型定义 |
| ui-components | `packages/ui-components/` | React + ECharts | 控制台公共 UI 组件 |

---

## 八、停止与清理

```bash
# 停止 Gateway 和 Console：在对应终端按 Ctrl+C

# 停止数据库容器（保留数据）
docker compose stop

# 停止并删除容器（保留数据卷）
docker compose down

# 停止并删除容器 + 数据卷（彻底清理，下次启动会重新初始化数据库）
docker compose down -v

# 清理项目构建产物
pnpm clean
```

---

> **提示**：本项目每个源文件都有详细的中文注释，建议按 SDK → Gateway → Console 的顺序阅读代码学习。
