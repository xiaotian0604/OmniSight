#!/bin/bash

# OmniSight 开发环境清理脚本
# 用于清理占用端口的进程，解决 EADDRINUSE 错误

echo "🧹 开始清理 OmniSight 开发环境..."

# 清理端口 3000 (Gateway)
echo "清理端口 3000 (Gateway)..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✅ 端口 3000 已清理" || echo "ℹ️  端口 3000 无进程"

# 清理端口 5173 (Console)
echo "清理端口 5173 (Console)..."
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "✅ 端口 5173 已清理" || echo "ℹ️  端口 5173 无进程"

# 清理端口 5174 (Console 备用端口)
echo "清理端口 5174 (Console 备用端口)..."
lsof -ti:5174 | xargs kill -9 2>/dev/null && echo "✅ 端口 5174 已清理" || echo "ℹ️  端口 5174 无进程"

# 清理所有 nest 进程
echo "清理所有 nest 进程..."
pkill -f "nest start" && echo "✅ nest 进程已清理" || echo "ℹ️  无 nest 进程"

# 清理所有 turbo 进程
echo "清理所有 turbo 进程..."
pkill -f "turbo run" && echo "✅ turbo 进程已清理" || echo "ℹ️  无 turbo 进程"

# 清理所有 node 进程（可选，谨慎使用）
# echo "清理所有 node 进程..."
# pkill -f node && echo "✅ node 进程已清理" || echo "ℹ️  无 node 进程"

echo ""
echo "✨ 清理完成！现在可以重新运行 npm run dev 了"
