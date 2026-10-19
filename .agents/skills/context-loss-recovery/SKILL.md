---
name: context-loss-recovery
description: >
  Recover essential context after context compression, session truncation, or apparent memory loss.
  Use this skill whenever the user says "你失忆了", "上下文压缩", "防失忆", "恢复上下文", "看看上一个会话",
  "之前我们聊到哪", "你忘了", "防止细节丢失", or when a checkpoint/compaction notice appears and you must continue a long-running task.
  It tells you how to locate the latest DSH session for this project, read the last user messages and assistant conclusions,
  then fetch only what is needed—without blindly re-searching the whole repository.
  Pay special attention to recovering fine-grained details: exact IDs, hashes, paths, commands, parameter shapes, and user wording.
---

# Context Loss Recovery（防失忆）

Context compression is expected in long sessions. This skill turns DSH session history into a reliable recovery layer:
instead of guessing from a compaction summary, go back to the **original user messages and the latest assistant/tool evidence**,
then bring forward the minimum needed to continue—while deliberately protecting fine-grained details.

## Why this works

- Compaction summaries can drop nuance, decisions, exact numbers, or commands.
- DSH stores every user/assistant/tool event under `~/.dsh/sessions/`, so the previous turns are still recoverable.
- The fastest signal is usually the **current session’s own pre-compaction tail** when the checkpoint happened in this same session; otherwise the **most recent session of this project**, not an old generic session.
- You should always cross-check recovered claims against git, files, manifests, and current map/data state.

## What counts as “details” that must not be lost

Recover and write down **exact values**, not paraphrases:

- User’s original wording (quote it, especially names like “调整动画速度”, “禁用跳跃”).
- Numeric IDs: effect IDs, asset IDs, map IDs, node graph IDs, config IDs.
- TextMap hashes and other hash values.
- SHA-256 and file sizes.
- Absolute paths (including Windows `/mnt/c` paths).
- Exact commands that worked, including `cmd.exe` / dotnet SDK paths.
- Tool outputs that were the evidence for a conclusion.
- Parameter shapes from GIL diff: e.g., `效果 2120001: {类型10, 类型11}`, `f13.f2=f32(-0.09795895)`.
- Root/field names from wire analysis: `root15`, `root16`, `f21.f1.f3`, etc.
- Constraints and decisions: “不要 XOR 0x95”, “UI 名不在主 TextMap”, “Linux 不能加载 WPF”.
- Next action and the exact `LOCKED_BEFORE`/`LOCKED_HASH`.

If a detail would change the next action if lost, treat it as critical.

## Core recovery loop

1. **Identify the current DSH session and project root.**
   - **本机实测形态（2026-10-17 修正）**：会话是一个**目录** `~/.dsh/sessions/--home-h-genshin-ts--/session-<id>/`，
     转录文件 = `<该目录>/session.v4.jsonl.zstd`。`$DSH_SESSION_JSONL` 在本机**常为 UNSET**，不要依赖它；
     用 `$DSH_SESSION_ID` 找同名目录，或 `ls -t ~/.dsh/sessions/--home-h-genshin-ts--/ | head`。
     ```bash
     BASE=~/.dsh/sessions/--home-h-genshin-ts--
     D="$BASE/${DSH_SESSION_ID:-}"                       # ① 有会话 id 就直接用（本机实测该变量有值）
     [ -d "$D" ] || D=$(ls -dt "$BASE"/session-*/ | head -1)   # ② 否则取**最新**：注意是 `ls -dt`
     F="${D%/}/session.v4.jsonl.zstd"; ls -la "$F"
     ```
     ⚠ **`ls -d ... | head -1` 是按名字排序，会取到错的会话**（2026-10-17 自验证踩到：
     取到的是一周前那个 1.6MB 的会话，压缩点/用户消息全是别人的）——必须 `-t` 或按 id 定位。
     project root normally `~/.dsh/sessions/--home-h-genshin-ts--` for this repo.
   - **Do not immediately scan other sessions.** Check first whether the loss happened inside this same session (compaction/summary events exist in `$DSH_SESSION_JSONL`). The history tool excludes the current session by default, so a scan can show a different session as “latest” and mislead you.
   - Only when the current session has no recoverable previous round (e.g., a fresh session) should you search other sessions.

2. **Same-session compaction: locate the previous round in this same session first.**
   - Find the latest compaction marker **用 JSON 解析，不用 grep**：
     ⚠ 2026-10-17 实测——`grep '"compaction'` 会被**技能正文**命中（本条技能自己的说明里就有 compaction 字样），
     输出被刷成数万字符。正确做法：
     ```bash
     zstd -dc "$F" | python3 -c 'import sys,json
     for l in sys.stdin:
         if not l.startswith("{\"type\":\"compaction"): continue
         o=json.loads(l); print(o.get("seq"), o.get("type"), json.dumps(o.get("data",{}),ensure_ascii=False)[:110])' | tail -8
     ```
   - The previous round is the **events immediately before the latest `compaction/summary`**, ending with the last user message and the assistant/tool evidence that preceded it.
   - To read the current session (bypassing the default current-session exclusion), unset the env vars and use `show`:
     ```bash
     env -u DSH_SESSION_ID -u DSH_SESSION_JSONL python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show "$(dirname "$DSH_SESSION_JSONL")" --tail 120
     ```
   - Or extract user messages directly:
     ```bash
     **更省事：直接跑 `ys-memcheck`**（2026-10-17 落地件，已装 `~/.local/bin`，源码 `scripts/ys-memcheck.py`）——
     它自带会话定位（`$DSH_SESSION_ID` → `ls -dt`）、过滤 `skill-invocation`、标 ★ 指路线索、打印最近压缩点：
     ```bash
     ys-memcheck                  # **缺省全量**（一条不漏）——压缩前默认就用这个
     ys-memcheck -n 8             # 速览用；会保留开头 6 条 + 末尾 8 条，并报告被省略的 seq 区间
     ys-memcheck --since 8300     # 只看某 seq 之后（配合"最近压缩点"用）
     ```
     下面是等价的裸命令（`ys-memcheck` 不可用时用）：
     zstd -dc "$F" 2>/dev/null | python3 -c '
     import sys,json,datetime
     for i,line in enumerate(sys.stdin, start=1):
         if not line.startswith("{\"type\":\"user/message\""): continue
         o=json.loads(line); d=o.get("data",{})
         src=d.get("source",{})
         # ⚠ 只认 kind=="user"：`/skill` 调用会以 kind=="skill-invocation" 的 user/message 出现，
         #   正文数千字会把真正的用户消息冲掉（2026-10-17 实测）
         if isinstance(src,dict) and src.get("kind")!="user": continue
         t=d.get("time") or o.get("time") or 0
         if isinstance(t,(int,float)): t=datetime.datetime.fromtimestamp(t/1000).strftime("%H:%M:%S")
         content=d.get("content") or []
         txt=" ".join(x.get("text","") for x in content if isinstance(x,dict)) if isinstance(content,list) else str(content)
         if txt.startswith("<system-reminder>") or txt.startswith("<skill_content") or txt.startswith("This is an automatically generated checkpoint"): continue
         print(f"[line {i}] {t} {txt[:500]}")
     ' | tail -80
     ```
   - Then open the specific range around that last user message to see its tool calls/results (see “Detail recovery techniques” below).
   - **User-first rule: stay on the user-message list until you know the exact target.** Do not scan/browse assistant messages, tool calls, or tool results broadly—those are huge and will flood context.

3. **Only after step 2 fails, scan the latest sessions.**
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py scan ~/.dsh/sessions/--home-h-genshin-ts-- --limit 20
   ```
   Look for the session whose title/time matches the current task or is immediately before the checkpoint.

4. **Locate the “previous session” and open its tail.**
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <session-dir> --tail 60
   ```
   Read the last user messages and final assistant conclusions first; that is usually the “last round” you need to continue.

5. **Find exact user messages and key assistant statements.**
   - Use `scan` to see user-message summaries.
   - Use `search` with exact tokens from the task: file names, effect IDs, hashes, commands, or phrases the user actually said.
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "590001|禁用跳跃|beyondRoleStatusService" ~/.dsh/sessions/--home-h-genshin-ts-- --max-hits 20 --context 400
   ```

6. **Fetch tool evidence only when needed.**
   - If a conclusion mentions a command/result, search the same session for the relevant `tool/call` and `tool/result`.
   - If an error occurred, use `errors` to see the failure; if a task was interrupted, use `todos`.
   - Do not re-run large scans or full repo searches just to “refresh”; the history should point you to the precise file/path/command.

7. **Cross-validate details before continuing.**
   - Check `git log --oneline -10` for the latest commits.
   - Read the handoff/manifest/status file named by the previous session if one exists (e.g., `HANDOFF-CONTEXT.md`, `PROGRESS.md`, `manifest.md`).
   - If the task touches real game data, verify current file hashes/paths instead of trusting a memory.
   - If a number/path appears in two places (session + file), confirm they match; if they conflict, trust file/git evidence and mark the conflict.

## 读多少条才够（2026-10-19 用户裁决，优先级高于"省 context"）

> 用户原话（2026-10-19）：「这个技能只看这么多消息完全不够用了，而且会给模型错误，最好是多看一点，
> 开始和结尾也不要错过。**加载用户的上下文代价不高，设计为引导模型多看**，更好地恢复用户原意思收益更高。」

**默认读全量用户消息**（一个会话通常 50–150 条 × 150 字 ≈ 4–10K tokens，远低于一次误判的返工成本）。
截断视图会**系统性给出错误**，而不是"信息少一点"：

- **开头定目标**：会话最初的 1–3 条几乎总是根目标（例：本会话 seq=9 才是真正的任务书，
  只看最后 14 条会被"处理好这个 bug"误导成局部修补）；
- **中间定取舍**：用户在中段给的指路（"去 X 桶"/"先 1 后 2"）决定了路线，丢了就会走另一条；
- **结尾定当下**：最后 1–2 条是此刻要做什么。

因此：`ys-memcheck` 缺省全量；任何 `-n N` 视图都会保留开头 6 条并显式打印**被省略的 seq 区间**——
看到该提示就说明"结论可能建在残缺视图上"，必须复看全量再下判断。

## 用户诉求与指路恢复（2026-10-17 实证：**最高价值、最易丢**）

> 事故：一个区间里有 5 条用户指路（"去 plugins 记忆桶，有更优雅的关闭方式"、"找找原因？"、"你的窗口没打开对"），
> 压缩时被折成两句技术结论 ⇒ **指路与未答诉求一起消失**，后续连"该去查什么"都想不起来。
> 教训：**数字好补，指路难补**——数字在文件/日志里能重查，用户指的那条路没人再提醒你。

恢复时按这三条做：

1. **先抽全量用户消息（缺省全量视图，不要用 `-n 14` 之类），逐条判「已满足 / 未满足」**
   （用上面的 user-only 提取器；排掉 skill-invocation 与系统提醒）。
   - 已满足 = 有落盘证据（提交/文档/日记/tool 结果）；
   - 未满足 = 问题没答、路没走、验收没做 ⇒ **进恢复报告的显式清单**。
2. **用户给的指针当场执行**（"去 X 记忆桶 / 看 Y 文件 / 问 Z"）——恢复动作本身就包含这一次查找；
   查到了就把**结论写进持久层**（技能/文档/日记），不要只写在回复里（回复会被下一次压缩吃掉）。
3. **恢复报告必须带「用户未满足诉求」栏**，逐字引用用户原话（转述会把指令变成传闻）。

**压制复发**：压缩前先跑 `task-command-center` 技能里的「压缩前必做四步」（同一教训的另一半：预防侧）。

## Detail recovery techniques

- **Start with a user-only list, not a broad AI search.** Use the compact `user/message` extraction in step 2 to see user wording and exact line numbers first. Only after you have a precise line do you open a narrow range of that round.
- **Search with the exact literal**, not just a concept:
  ```bash
  ... search "2120001|1739984627|ticket01-disablejump-v27" ...
  ```
- **Open a narrow range around a user message** to see that round’s tool calls/results:
  ```bash
  ... show <session-dir> <start> <end>
  ```
  Keep the range small (a few dozen lines), not the whole session.
- **Look for tool/result payloads** containing file content, hashes, JSON, hex dumps, or command outputs; these are primary evidence—but fetch them only after the user line points to the exact round.
- **Use `errors`** to recover exact failure messages (they often explain why a route was abandoned).
- **Use `todos`** to find unfinished steps and their wording.
- **Quote user messages** in the recovery summary so intent is not paraphrased away.
- **Do not dump assistant/tool/search output just to “refresh” memory.** If you already know the needed numbers/paths, go straight to persistent files (git/handoff/manifest) for validation.

## Recovery output template

When you recover context, ALWAYS produce this shape:

```text
当前目标：<one line>
上一轮完成：<what actually happened>
关键细节：
  - 精确 ID/值：...
  - 路径/命令：...
  - 约束/坑：...
下一步：<one concrete action>
待确认：<anything the user must answer>
用户未满足诉求（逐字引用，标注已满足/未满足）：
  - "<用户原话>" → 状态 + 已走的指针 + 结论落盘位置
```

If you created a handoff file, use the same detail categories and commit it. Do not write “大概”, “好像是”, “可能”; if a detail is missing, mark it `UNKNOWN` and search again before proceeding.

## Detail-safe handoff file checklist

- [ ] User original wording/names
- [ ] Exact numeric IDs and hashes
- [ ] SHA-256 + paths
- [ ] Working commands (including Windows `cmd.exe` invocation if applicable)
- [ ] Tool outputs that are evidence
- [ ] Parameter/wire shapes
- [ ] Constraints / failed routes
- [ ] Current `LOCKED_BEFORE` / `LOCKED_HASH` if a diff experiment is active
- [ ] Next action and open questions

## Trigger phrases and priority

Use this skill when any of these appear:

- “你上下文要压缩了”, “你又要失忆”, “防失忆”, “恢复上下文”
- “防止细节丢失”, “特别注意细节”
- “看你自己这个 dsh”, “看项目最新会话”, “上一个会话”, “上一轮”
- A checkpoint/compaction message appears and you must continue without repeating prior work
- The user says “先整理思路”, “交接一下”, “下一步是什么” after a long exploration

Priority order:
1. Latest session for this project (most recent first).
2. User messages in that session.
3. The last assistant/tool turn around those user messages.
4. Targeted `search` for exact keywords/numbers if the above is not enough.
5. Persistent files (git, manifests, handoffs) for validation.

## Pitfalls

- **Do not start by loading other sessions.** If compaction happened in this same session, first locate the last `compaction/summary` in `$DSH_SESSION_JSONL` and read the events just before it. The scan tool excludes the current session, so another session can appear to be the “latest” and send you down the wrong path.
- **Do not search/browse AI messages first.** Directly searching assistant messages, tool calls, or tool results can pull huge chunks and consume the context you are trying to save. First get the compact user-message list; then fetch only a narrow range around the exact user line.
- Do not start by listing all sessions or grepping the whole repo; use targeted commands against the current session first, then `scan --limit` / `search` only when needed.
- Do not treat an assistant summary as the user’s original intent; find the user message and quote it.
- Do not trust a compaction summary that conflicts with git/file evidence; file evidence wins.
- Do not repeat full exploration that previous sessions already completed—search for the conclusion first, then only fill the remaining gap.
- Do not omit exact numbers when writing the recovery summary; if you omit them, they will be lost again in the next compression.

## Example

User: “你刚才是不是压缩了？我们票01做到哪了？特别注意细节。”

Recovery steps:
1. `scan --limit 20` → find the most recent `beyond-semantic-resources` session.
2. `show <session> --tail 40` → see last user messages: “新增效果：禁用跳跃”, “深挖编辑器隐藏目录”.
3. `search "HANDOFF-CONTEXT|DecoderOutput|beyondRoleStatusService|590001"` → recover exact paths and IDs.
4. Read `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/HANDOFF-CONTEXT.md` and the manifest.
5. Verify git log and current map hash.
6. Continue from the next action, preserving the exact sample table and commands.

Same-session compaction example (two compactions, still one session):
1. `zstd -dc "$DSH_SESSION_JSONL" 2>/dev/null | grep -n '"type":"compaction/summary"' | tail -3` → see there are two checkpoints in the *current* session.
2. Do not scan/load other sessions yet; read the events just before the latest checkpoint (`zstd -dc ... | sed -n '...,...p'` or `env -u DSH_SESSION_ID ... show <current-session-dir> --tail 120`).
3. Quote the last real user message before the checkpoint (e.g., “你现在就可以试试还原压缩之前的细节，自我验证并优化这个技能”) and recover the assistant/tool evidence right before it.
4. Only if no checkpoint exists in the current session should you move to other sessions.
