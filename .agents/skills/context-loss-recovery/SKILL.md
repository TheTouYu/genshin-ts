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
- The fastest signal is usually the **most recent session of this project**, not an old generic session.
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
   - Current session file: `$DSH_SESSION_JSONL` or `$DSH_SESSION_ID`.
   - Project session root is normally `~/.dsh/sessions/--home-h-genshin-ts--` for this repo; for another repo use `~/.dsh/sessions/<encoded-cwd>--`.
   - Exclude the current session when searching for history to avoid reading your own in-progress actions.

2. **Scan the latest sessions first.**
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py scan ~/.dsh/sessions/--home-h-genshin-ts-- --limit 20
   ```
   Look for the session whose title/time matches the current task or is immediately before the checkpoint.

3. **Locate the “previous session” and open its tail.**
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py show <session-dir> --tail 60
   ```
   Read the last user messages and final assistant conclusions first; that is usually the “last round” you need to continue.

4. **Find exact user messages and key assistant statements.**
   - Use `scan` to see user-message summaries.
   - Use `search` with exact tokens from the task: file names, effect IDs, hashes, commands, or phrases the user actually said.
   ```bash
   python3 ~/.agents/skills/dsh-session-history/scripts/search_dsh_sessions.py search "590001|禁用跳跃|beyondRoleStatusService" ~/.dsh/sessions/--home-h-genshin-ts-- --max-hits 20 --context 400
   ```

5. **Fetch tool evidence only when needed.**
   - If a conclusion mentions a command/result, search the same session for the relevant `tool/call` and `tool/result`.
   - If an error occurred, use `errors` to see the failure; if a task was interrupted, use `todos`.
   - Do not re-run large scans or full repo searches just to “refresh”; the history should point you to the precise file/path/command.

6. **Cross-validate details before continuing.**
   - Check `git log --oneline -10` for the latest commits.
   - Read the handoff/manifest/status file named by the previous session if one exists (e.g., `HANDOFF-CONTEXT.md`, `PROGRESS.md`, `manifest.md`).
   - If the task touches real game data, verify current file hashes/paths instead of trusting a memory.
   - If a number/path appears in two places (session + file), confirm they match; if they conflict, trust file/git evidence and mark the conflict.

## Detail recovery techniques

- **Search with the exact literal**, not just a concept:
  ```bash
  ... search "2120001|1739984627|ticket01-disablejump-v27" ...
  ```
- **Open a range around a user message** to see that round’s tool calls and results:
  ```bash
  ... show <session-dir> <start> <end>
  ```
- **Look for tool/result payloads** containing file content, hashes, JSON, hex dumps, or command outputs; these are primary evidence.
- **Use `errors`** to recover exact failure messages (they often explain why a route was abandoned).
- **Use `todos`** to find unfinished steps and their wording.
- **Quote user messages** in the recovery summary so intent is not paraphrased away.

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

- Do not start by listing all sessions or grepping the whole repo; use `scan --limit` and targeted `search`.
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
