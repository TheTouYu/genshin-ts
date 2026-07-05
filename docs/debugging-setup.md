# 使用 omp debug 工具调试 TypeScript 代码

本文档说明如何在本项目（genshin-ts）中使用 omp 内置的 `debug` 工具进行 TypeScript/JavaScript 调试。

## 原理

```
┌──────────────────────────────────────────────────────┐
│                   omp coding agent                    │
│  ┌────────────────────────────────────────────┐       │
│  │              debug 工具 (DAP 协议)           │       │
│  │  stdin/stdout ←──→  node-dap.js (适配器)    │       │
│  │                                │             │       │
│  │                     WebSocket (CDP 协议)     │       │
│  │                                │             │       │
│  │                    node --inspect-brk        │       │
│  │                    (目标进程)                  │       │
│  └────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────┘
```

- omp 的 `debug` 工具走 **DAP（Debug Adapter Protocol）**
- 本项目安装了一个自定义适配器 `node-dap.js`，将 DAP 转为 **Chrome DevTools Protocol（CDP）**
- CDP 通过 WebSocket 连接到 Node.js 内置的 `--inspect` 调试接口

## 当前状态

| 能力 | 状态 | 说明 |
|------|------|------|
| `debug launch` | ✅ | 启动带 `--inspect-brk` 的 Node.js 进程 |
| `debug attach` | ✅ | 连接到已有 `--inspect` 进程 |
| `debug set_breakpoint` | ✅ | 设置源码断点 |
| `debug continue` | ✅ | 继续执行 |
| `debug step_over / step_in / step_out` | ✅ | 单步调试 |
| `debug evaluate` | ✅ | 运行时求值表达式 |
| `debug stack_trace` | ⚠️ | 有限支持（从暂停事件缓存） |
| `debug variables / scopes` | ⚠️ | 有限支持 |
| `debug terminate` | ✅ | 终止调试会话 |

## 文件清单

- **`~/.local/bin/node-dap.js`** — DAP↔CDP 桥接适配器（stdin/stdout）
- **`~/.local/lib/js-debug/`** — vscode-js-debug DAP 服务器（被桥接器使用）
- **`.omp/dap.json`** — omp DAP 适配器配置
- **`.omp/config.yml`** — 项目级 omp 设置（含 `debug.enabled: true`）

## 使用方法

### 1. 调试编译后的 CLI

```bash
# 先构建
npm run build

# 启动调试（停在第一行）
debug launch --adapter node-dap --program "dist/src/cli/gsts.js" --args ["-c","gsts.test.config.ts"]
```

### 2. 调试 tsx 源码（无需预先 build）

```bash
debug launch --adapter node-dap --program "node_modules/.bin/tsx" --args ["src/cli/gsts.ts","-c","gsts.test.config.ts"]
```

### 3. 设置断点并查看

```bash
# 在编译管道的特定位置设断点
debug set_breakpoint --file "src/compiler/ts_to_gs_transform/expr.ts" --line 50

# 继续执行到断点
debug continue

# 查看当前位置的变量
debug evaluate --expression "node"

# 查看调用栈
debug stack_trace

# 单步
debug step_over
debug step_in
debug step_out
```

### 4. 调试测试

```bash
# 调试测试生成脚本
debug launch --adapter node-dap --program "node_modules/.bin/tsx" --args ["scripts/generate-node-gia-tests.ts"]

# 或调试编译器测试运行
debug launch --adapter node-dap --program "dist/src/cli/gsts.js" --args ["-c","gsts.test.config.ts"]
```

### 5. 附加到已有进程

```bash
# 终端 1：启动带 inspect 的进程
node --inspect-brk dist/src/cli/gsts.js -c gsts.test.config.ts

# omp 中：附加
debug attach --adapter node-dap --port 9229
```

### 6. 常用调试技巧

**加 `debugger` 语句**直接在源码中插入 `debugger;`，然后 `node --inspect` 运行：

```bash
# 在源码中加 debugger; 语句
# 然后直接运行（不要用 --inspect-brk）
node --inspect dist/src/cli/gsts.js -c gsts.test.config.ts

# omp attach
debug attach --adapter node-dap --port 9229
```

**结合浏览器 DevTools**：`--inspect-brk` 启动后，在 Chrome 打开 `chrome://inspect`，可以同时使用图形化调试器。

## 常见问题

### "DAP adapter exited (code 0)"

适配器启动后立即退出。通常是因为：
- 目标程序路径不存在
- Node.js inspector 端口被占用
- 环境变量问题

解决：检查 `program` 路径是否正确，确认端口 9229 未被占用。

### "The operation timed out" on continue

`continue` 超时表示调试器未收到 paused/exited 事件。原因：
- 目标程序已在 CDP 连接建立前跑完（小脚本）
- 断点未及时设置到 V8

解决：使用 `--inspect-brk`（默认），确保在 `continue` 前 CDP 已连接（用 `evaluate` 验证）。

### "Unknown command: XXXX"

适配器未实现某个 DAP 命令。`node-dap.js` 实现了基本命令子集：
`initialize`, `launch`, `attach`, `setBreakpoints`, `continue`, `next/stepOver`, `stepIn`, `stepOut`, `pause`, `threads`, `stackTrace`, `scopes`, `variables`, `evaluate`, `disconnect`, `terminate`

### evaluate 返回 "<not connected>"

CDP 连接尚未建立。等待几秒再试，或检查目标进程是否仍在运行。

## 维护

### 重新生成适配器

如果修改了 `node-dap.js`，重新启动调试会话即可生效（不需重启 omp）。

### 清除残留进程

```bash
# 强制清理所有残留的 inspect 进程
pkill -f "node --inspect"
pkill -f "node-dap.js"
```
