---
name: codebase-memory
description: Use codebase-memory-mcp's code knowledge graph for fast structural code discovery and architecture understanding. Use this skill whenever the user asks to explore or understand a codebase, find functions/classes/modules, trace callers/callees, analyze dependencies, assess impact of changes, find dead code/refactor candidates, or search Genshin-TS compiler/runtime architecture. Prefer this over broad rg scans for structural questions, then fall back to rg/read for exact text and verification.
compatibility: Requires /home/h/.local/bin/codebase-memory-mcp or codebase-memory-mcp on PATH. Pi can use it through the bash tool via `codebase-memory-mcp cli <tool> '<json>'`.
---

# Codebase Memory

Use the `codebase-memory-mcp` CLI as a local knowledge graph for code exploration. Pi does not need native MCP support for this skill: run the tool through `bash` in one-shot CLI mode.

## Command Form

Prefer the absolute binary when available:

```bash
/home/h/.local/bin/codebase-memory-mcp cli <tool> '<json>'
```

If that path is missing, try:

```bash
codebase-memory-mcp cli <tool> '<json>'
```

Keep the JSON argument single-quoted in shell commands. For the current repository, use this project identity:

```json
{"project":"home-h-genshin-ts","repo_path":"/home/h/genshin-ts"}
```

Most graph query tools require `project: "home-h-genshin-ts"`. `index_repository` uses `repo_path` when the project needs to be created or refreshed.

## First Checks

Before relying on graph results in a session, check that the project is indexed:

```bash
/home/h/.local/bin/codebase-memory-mcp cli list_projects '{}'
/home/h/.local/bin/codebase-memory-mcp cli index_status '{"project":"home-h-genshin-ts"}'
```

If the project is absent or stale, index or refresh it:

```bash
/home/h/.local/bin/codebase-memory-mcp cli index_repository '{"repo_path":"/home/h/genshin-ts"}'
```

For changed code, prefer a refresh before impact analysis:

```bash
/home/h/.local/bin/codebase-memory-mcp cli detect_changes '{"project":"home-h-genshin-ts","repo_path":"/home/h/genshin-ts"}'
```

## Decision Matrix

| User question | Prefer |
| --- | --- |
| What exists around X? | `search_graph` |
| Where is X defined? | `search_graph`, then `get_code_snippet` or `read` |
| Who calls X? | `trace_path` with `direction: "inbound"` |
| What does X call? | `trace_path` with `direction: "outbound"` |
| What is the full call context? | `trace_path` with `direction: "both"` |
| High-level architecture | `get_architecture` |
| Complex graph pattern | `query_graph` |
| Exact literal, error string, config key, docs text | `rg`, then `read` |

## Common Workflows

### Explore A Feature Or Symbol

1. Search the graph by name pattern:

```bash
/home/h/.local/bin/codebase-memory-mcp cli search_graph '{"project":"home-h-genshin-ts","name_pattern":".*irToGia.*","limit":20}'
```

2. Fetch the precise snippet when the result has a `qualified_name`:

```bash
/home/h/.local/bin/codebase-memory-mcp cli get_code_snippet '{"qualified_name":"<qualified_name_from_search>"}'
```

3. Use `read` on the returned file for surrounding context before editing.

### Trace Callers And Callees

1. Discover the exact symbol name first:

```bash
/home/h/.local/bin/codebase-memory-mcp cli search_graph '{"project":"home-h-genshin-ts","name_pattern":".*buildServerGraphRegistriesIRDocuments.*","limit":10}'
```

2. Trace with a bounded depth:

```bash
/home/h/.local/bin/codebase-memory-mcp cli trace_path '{"project":"home-h-genshin-ts","function_name":"buildServerGraphRegistriesIRDocuments","direction":"both","depth":3}'
```

Use inbound traces for impact and outbound traces for implementation understanding.

### Understand Architecture

Use this before reading many files for broad questions:

```bash
/home/h/.local/bin/codebase-memory-mcp cli get_architecture '{"project":"home-h-genshin-ts","repo_path":"/home/h/genshin-ts","aspects":["all"]}'
```

Then follow up with targeted `search_graph`, `trace_path`, `get_code_snippet`, and normal `read` calls.

### Run Cypher For Complex Patterns

Use `query_graph` when the built-in filters are not enough:

```bash
/home/h/.local/bin/codebase-memory-mcp cli query_graph '{"project":"home-h-genshin-ts","query":"MATCH (f:Function) WHERE f.name =~ \\".*Composite.*\\" RETURN f.name, f.file_path LIMIT 25"}'
```

Useful edge types include `CALLS`, `IMPORTS`, `DEFINES`, `DEFINES_METHOD`, `USAGE`, `CONTAINS_FILE`, `CONTAINS_FOLDER`, `FILE_CHANGES_WITH`, `SIMILAR_TO`, and `CONFIGURES`.

## Genshin-TS Search Hints

For this repository, good starting terms are:

- Compiler pipeline: `ts_to_gs`, `gs_to_ir`, `ir_to_gia`, `injector`, `gstsServer`
- Runtime: `MetaCallRegistry`, `buildServerGraphRegistriesIRDocuments`, `globalThis.gsts`, `ServerExecutionFlowFunctions`
- IR and GIA: `IRDocument`, `FlowIR`, `GiaNode`, `resolveGiaNodeId`, `node_pin_records`, `gia.proto`
- Composite support: `defineComposite`, `callComposite`, `CompositeRegistry`, `CompositeDefIR`, `compositePins`
- CLI: `compileCommand`, `dev`, `gsts.config`, `_GSTS_`

## When To Fall Back

Use `rg`/`read` instead of graph tools when:

- Searching literal text, diagnostics, comments, Markdown, JSON values, or generated output.
- The graph result is missing, stale, or ambiguous.
- You need exact line-level context for an edit.
- You are verifying behavior before changing code.

Graph results are an accelerator, not a substitute for reading the code you will modify.

## Response Style

When using this skill for the user, mention the graph query result briefly, then cite concrete files inspected with `read`. For implementation tasks, use the graph to narrow the search, but base final edits on actual source context.
