#!/bin/bash
# layer-selftest.sh — ys-layer 的离线自测（4 帧 + 1 负样本）
# 断言原则：只断言**站得住**的判据；关闭控件坐标不精确，改为"右上象限"口径（写进 md 说明）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"; cd "$ROOT" || exit 3
FX=tools/ys-editor/tests/fixtures/unknown
T=_tmp_layer; rm -rf "$T"; mkdir -p "$T"
pass=0; fail=0; n=0
ok(){ n=$((n+1)); pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ n=$((n+1)); fail=$((fail+1)); echo "  ✗ $1"; echo "      期望: $2"; echo "      实测: $3"; }
json(){ ./tools/ys-layer "$FX/$1" --json 2>/dev/null; }

V=$(json rules-panel.png)
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["scrim"]["present"]))')" = 1 ] \
  && ok "rules-panel: 检出 scrim（模态压暗活动页）" || bad "rules-panel: scrim" "scrim=1" "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["scrim"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["modal"]["present"]))')" = 1 ] \
  && ok "rules-panel: 检出 modal（居中面板）" || bad "rules-panel: modal" "modal=1" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["modal"])')"

V=$(json events-teams.png)
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["scrim"]["present"]))')" = 0 ] \
  && ok "events-teams（负样本）: 无 scrim —— 不假阳性" || bad "events-teams: 无 scrim" "scrim=0" "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["scrim"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["modal"]["present"]))')" = 0 ] \
  && ok "events-teams: 不把基础层当 modal" || bad "events-teams: modal" "modal=0" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["modal"])')"

V=$(json yingying-play.png)
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(int(bool(d["panels"]) and d["panels"][0]["full_screen"]))')" = 1 ] \
  && ok "yingying-play: 识别为全屏面板（羊皮纸式）" || bad "yingying-play: 全屏面板" "panels[0].full_screen=1" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["panels"])')"
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["scrim"]["present"]))')" = 0 ] \
  && ok "yingying-play: 不当成 scrim（全屏面板≠压暗层）" || bad "yingying-play: scrim" "scrim=0" "scrim=1"

V=$(json claim-before.png)
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["modal"]["present"]))')" = 1 ] \
  && ok "claim-before: 检出奖励面板 modal" || bad "claim-before: modal" "modal=1" "modal=0"
[ "$(echo "$V" | python3 -c 'import sys,json;d=json.load(sys.stdin);c=d["close_controls"];print(int(bool(c) and c[0]["cx"]>0.7*d["size"][0] and c[0]["cy"]<0.2*d["size"][1]))')" = 1 ] \
  && ok "claim-before: 关闭控件在右上象限" || bad "claim-before: close" "close_controls[0] 在右上象限" "$(echo "$V" | python3 -c 'import sys,json;print(json.load(sys.stdin)["close_controls"])')"

V=$(json battle-report.png)
[ "$(echo "$V" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["scrim"]["present"]))')" = 0 ] \
  && ok "battle-report（负样本）: 战报视频画面无 scrim" || bad "battle-report: scrim" "scrim=0" "scrim=1"

echo "──────────────────────────────"
echo "LAYER-RESULT frames=5 assert=$n pass=$pass fail=$fail verdict=$([ $fail -eq 0 ] && echo PASS || echo FAIL)"
rm -rf "$T"
[ $fail -eq 0 ]
