#!/usr/bin/env bash
# 安装 doc_health pre-commit 门禁到当前仓库 .git/hooks/
# 钩子经 scripts/py.mjs 找 Python（GSTS_PYTHON → python3 / python / py -3 → DSH 运行时），Linux 与 Win11 同一条命令。
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
install -m 0755 scripts/git-hooks/pre-commit .git/hooks/pre-commit
echo "✅ 已安装 .git/hooks/pre-commit"
ls -l .git/hooks/pre-commit

# Windows（含 WinBtrfs 挂载的原 Linux 家目录）：文件模式位在这里不生效，core.filemode=true 会把模式差异
# 全报成改动（2026-11-25 实证：数百项噪音）。只在 Windows 平台且尚未关闭时关闭；回到 Linux 用时可改回 true。
case "$(uname -s)" in
  MING*|MSYS*|CYGWIN*|Windows_NT)
    filemode="$(git config --get core.filemode || true)"
    if [ "$filemode" = "true" ]; then
      git config core.filemode false
      echo "ℹ️ 已设 core.filemode=false（Windows 上忽略文件模式位；回到 Linux 用时可执行 git config core.filemode true）"
    fi
    ;;
esac

# 自检：钩子要能在本机找到 Python（找不到时 install 仍算完成，但明说）
if node scripts/py.mjs --check; then
  echo "✅ 钩子可运行"
else
  echo "⚠️ 钩子已安装，但本机找不到 Python：提交会被拦。设 GSTS_PYTHON=<解释器路径> 或安装 Python 3 后重跑本脚本。"
  exit 1
fi
