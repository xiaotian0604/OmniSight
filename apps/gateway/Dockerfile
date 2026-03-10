# ===============================================================
# OmniSight Gateway — 多阶段 Docker 构建文件
# ===============================================================
#
# 多阶段构建的优势：
# 1. 最终镜像只包含运行时依赖，不包含 devDependencies 和构建工具
# 2. 镜像体积更小（约 200MB vs 单阶段的 500MB+）
# 3. 攻击面更小（不含编译器、构建工具等）
#
# 构建命令：
#   docker build -t omnisight-gateway -f apps/gateway/Dockerfile .
#   （注意：context 是项目根目录，因为 pnpm workspace 需要访问根目录的配置）
#
# 运行命令：
#   docker run -p 3000:3000 \
#     -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/omnisight \
#     -e REDIS_URL=redis://host.docker.internal:6379 \
#     omnisight-gateway
#
# 阶段说明：
# 1. base — 基础镜像，安装 pnpm
# 2. deps — 安装所有依赖（包括 devDependencies，用于编译 TypeScript）
# 3. build — 编译 TypeScript 为 JavaScript
# 4. production — 最终运行镜像，只包含生产依赖和编译产物
# ===============================================================

# ---------------------------------------------------------------
# 阶段 1: base — 基础镜像
# 使用 Node.js 18 Alpine 版本（体积小，约 50MB）
# 安装 pnpm 包管理器
# ---------------------------------------------------------------
FROM node:18-alpine AS base

# 安装 pnpm（全局安装，所有后续阶段都可以使用）
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 设置工作目录
WORKDIR /app

# ---------------------------------------------------------------
# 阶段 2: deps — 安装依赖
# 复制 package.json 和 lock 文件，利用 Docker 缓存层
# 只有这些文件变化时才会重新安装依赖
# ---------------------------------------------------------------
FROM base AS deps

# 复制 pnpm workspace 配置和根 package.json
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./

# 复制 gateway 的 package.json
# 注意：pnpm workspace 需要知道所有包的 package.json 才能正确解析依赖
COPY apps/gateway/package.json apps/gateway/

# 安装所有依赖（包括 devDependencies，因为需要 TypeScript 编译器）
# --frozen-lockfile: 确保使用 lock 文件中的精确版本，不自动更新
RUN pnpm install --frozen-lockfile || pnpm install

# ---------------------------------------------------------------
# 阶段 3: build — 编译 TypeScript
# 将 TypeScript 源码编译为 JavaScript
# ---------------------------------------------------------------
FROM deps AS build

# 复制 gateway 的源代码和配置文件
COPY apps/gateway/ apps/gateway/

# 在 gateway 目录下执行 NestJS 构建
# nest build 会读取 nest-cli.json 和 tsconfig.json 进行编译
# 输出目录：apps/gateway/dist/
WORKDIR /app/apps/gateway
RUN npx nest build

# ---------------------------------------------------------------
# 阶段 4: production — 最终运行镜像
# 只包含生产依赖和编译产物，不包含源码和 devDependencies
# ---------------------------------------------------------------
FROM base AS production

# 设置 Node.js 环境为生产模式
# 这会影响 NestJS 和其他库的行为（如禁用 Swagger、优化性能）
ENV NODE_ENV=production

# 复制 pnpm workspace 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/gateway/package.json apps/gateway/

# 只安装生产依赖（不包含 devDependencies）
# --prod: 跳过 devDependencies
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# 从 build 阶段复制编译产物
COPY --from=build /app/apps/gateway/dist apps/gateway/dist

# 切换到 gateway 目录
WORKDIR /app/apps/gateway

# 暴露端口（文档性质，实际端口由 PORT 环境变量控制）
EXPOSE 3000

# 健康检查：每 30 秒检查一次 /health 接口
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令：直接运行编译后的 JavaScript
# 不使用 nest start，因为生产环境不需要 NestJS CLI
CMD ["node", "dist/main.js"]
