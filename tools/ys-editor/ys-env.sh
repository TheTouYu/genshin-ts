#!/bin/bash
# ys-env.sh — 千星桌面会话环境发现（被所有 ys-* 工具 source）
#
# 存在理由（2026-10-17 重启后踩坑）：本机是 Wayland(KWin) + Xwayland :1，
# X11 访问需要 `XAUTHORITY=/run/user/<uid>/xauth_XXXX`（每次会话随机名）。
# 工具此前只硬编码 `export DISPLAY=:1`，重启/换会话后 **X 授权失败** →
# wmctrl/import 全部报 “Authorization required” → 被误读成「窗口不存在 / 游戏没开」。
# 表现与「原神窗消失」完全一样（实测一次），所以判据类工具必须自己把环境找对。
#
# 用法: 在工具里 `. "$HERE/ys-env.sh"`（须先定义 HERE 或传入路径）
#       ys-env.sh --print   # 只打印发现结果（自检用）
#
# 策略（成本 ≤120ms）：DISPLAY 候选取 :1 → :0 → 现有一切；
#   XAUTHORITY 候选 = /run/user/<uid>/xauth_* + 从运行中的原神/编辑器进程 environ 抄一份。
#   第一个能跑通 `wmctrl -m` 的组合胜出，写进 /tmp/ys-env.cache 供后续调用秒读。

YS_ENV_CACHE="${YS_ENV_CACHE:-/tmp/ys-env.cache}"

_ys_env_ok() {  # $1=display $2=xauth ; 成功则 0
  if [ -n "${2:-}" ]; then
    DISPLAY="$1" XAUTHORITY="$2" timeout 2 wmctrl -m >/dev/null 2>&1
  else
    DISPLAY="$1" timeout 2 wmctrl -m >/dev/null 2>&1
  fi
}

_ys_env_discover() {
  local uid d a
  uid="$(id -u)"
  # 候选 XAUTHORITY：先抄运行中客户端的 environ（最权威），再扫 /run/user/<uid>
  local -a auths=()
  local pid
  for pid in $(pgrep -f -u "$uid" 'YuanShen.exe|BeyondEditor.exe' 2>/dev/null | head -3); do
    a="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^XAUTHORITY=//p' | head -1)"
    [ -n "$a" ] && [ -r "$a" ] && auths+=("$a")
  done
  for a in /run/user/"$uid"/xauth_*; do [ -r "$a" ] && auths+=("$a"); done
  [[ ${#auths[@]} -eq 0 ]] && auths+=("")

  for d in :1 :0 ${DISPLAY:-}; do
    [ -z "$d" ] && continue
    for a in "${auths[@]}"; do
      if _ys_env_ok "$d" "$a"; then
        printf 'DISPLAY=%s\nXAUTHORITY=%s\n' "$d" "$a" > "$YS_ENV_CACHE" 2>/dev/null
        printf '%s\n%s\n' "$d" "$a"
        return 0
      fi
    done
  done
  return 1
}

ys_env_load() {
  # 已有可用环境（继承来的）就不折腾
  if [ -n "${DISPLAY:-}" ] && _ys_env_ok "$DISPLAY" "${XAUTHORITY:-}"; then return 0; fi
  # 缓存命中且仍可用 → 秒读
  if [ -r "$YS_ENV_CACHE" ]; then
    local d a
    d="$(sed -n 's/^DISPLAY=//p' "$YS_ENV_CACHE")"
    a="$(sed -n 's/^XAUTHORITY=//p' "$YS_ENV_CACHE")"
    if [ -n "$d" ] && _ys_env_ok "$d" "$a"; then
      export DISPLAY="$d"; [ -n "$a" ] && export XAUTHORITY="$a"
      return 0
    fi
  fi
  local out
  out="$(_ys_env_discover)" || return 1
  export DISPLAY="$(printf '%s\n' "$out" | sed -n 1p)"
  local a; a="$(printf '%s\n' "$out" | sed -n 2p)"
  [ -n "$a" ] && export XAUTHORITY="$a"
  return 0
}

export YDOTOOL_SOCKET="${YDOTOOL_SOCKET:-/run/user/$(id -u)/.ydotool_socket}"

# ── 项目事实（地图/存档/窗口）——单独一份，见 ys-game-env.sh 顶部的存在理由
[ -f "${BASH_SOURCE[0]%/*}/ys-game-env.sh" ] && . "${BASH_SOURCE[0]%/*}/ys-game-env.sh"

if [ "${1:-}" = "--print" ]; then
  ys_env_load && { declare -F ys_resolve_wins >/dev/null && ys_resolve_wins; }; printf 'DISPLAY=%s\nXAUTHORITY=%s\nYDOTOOL_SOCKET=%s\nMAP=%s\nGIL=%s\nSANDBOX=%s\n' \
    "$DISPLAY" "${XAUTHORITY:-<none>}" "$YDOTOOL_SOCKET" "${YS_MAP_ID:-}" "${YS_GIL:-}" "${WIN_SANDBOX:-}"
  _ys_rc=$?
  # 被 source 时 return（exit 会连父 shell 一起杀——本文件踩过一次）
  case "${BASH_SOURCE[0]}" in "$0") exit $_ys_rc;; *) return $_ys_rc;; esac
fi

ys_env_load

# 末尾：环境就绪后再解析窗口 id（窗口标题查询需要活着的 DISPLAY）
declare -F ys_resolve_wins >/dev/null && ys_resolve_wins
