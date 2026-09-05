#!/usr/bin/env bash
# 安装 doc_health pre-commit 门禁到当前仓库 .git/hooks/
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
install -m 0755 scripts/git-hooks/pre-commit .git/hooks/pre-commit
echo "✅ 已安装 .git/hooks/pre-commit"
ls -l .git/hooks/pre-commit
