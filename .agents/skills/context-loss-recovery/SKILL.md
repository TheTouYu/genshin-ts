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
   - Current session file: `$DSH_SESSION_JSONL` or `$DSH_SESSION_ID`; project root normally `~/.dsh/sessions/--home-h-genshin-ts--` for this repo.
   - **Do not immediately scan other sessions.** Check first whether the loss happened inside this same session (compaction/summary events exist in `$DSH_SESSION_JSONL`). The history tool excludes the current session by default, so a scan can show a different session as “latest” and mislead you.
   - Only when the current session has no recoverable previous round (e.g., a fresh session) should you search other sessions.

2. **Same-session compaction: locate the previous round in this same session first.**
   - The current session file is zstd JSONL. Find the latest compaction marker:
     ```bash
     zstd -dc "$DSH_SESSION_JSONL" 2>/dev/null | grep -n '"type":"compaction/summary"' | tail -5
     ```
   - The previous round is the **events immediately before the latest `compaction/summary`**, ending with the last user message and the assistant/tool evidence that preceded it.
   - To read the current session (bypassing the default current-session exclusion), unset the env vars and use `show`:
     ```bash
     env -u DSH_SESSION_ID -u DSH_SESSION_JSONL python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show "$(dirname "$DSH_SESSION_JSONL")" --tail 120
     ```
   - Or extract user messages directly:
     ```bash
     zstd -dc "$DSH_SESSION_JSONL" 2>/dev/null | python3 -c '
     import sys,json,datetime
     for i,line in enumerate(sys.stdin, start=1):
         if not line.startswith("{\"type\":\"user/message\""): continue
         o=json.loads(line); d=o.get("data",{})
         src=d.get("source",{})
         if isinstance(src,dict) and src.get("kind")!="user": continue
         t=d.get("time") or o.get("time") or 0
         if isinstance(t,(int,float)): t=datetime.datetime.fromtimestamp(t/1000).strftime("%H:%M:%S")
         content=d.get("content") or []
         txt=" ".join(x.get("text","") for x in content if isinstance(x,dict)) if isinstance(content,list) else str(content)
         if txt.startswith("<system-reminder>") or txt.startswith("This is an automatically generated checkpoint"): continue
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
