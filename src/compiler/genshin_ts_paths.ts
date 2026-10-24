import fs from 'node:fs'
import path from 'node:path'

/**
 * 编译期 `genshin-ts/*` 模块别名兜底。
 *
 * Stage 1 用 TypeScript checker 做类型驱动的变换（client 枚举字面量、Composite 输出类型等）。
 * 用户项目若**没有 tsconfig.json**（`examples/football` 与 `.scratch/*` 都是这种），
 * `ts_to_gs_pipeline.loadTsConfig` 只能用裸 `{target,module}` 兜底 —— 没有 paths/baseUrl、
 * 也不向上查找，于是所有 `genshin-ts/*` 导入在类型层是 `any`：
 * `RayFilterType.Scene` 不再是枚举 ⇒ 枚举数组被包成 `assemblyList([...])` ⇒ 报
 * `Generic parameter not matched`（issues/27）。这里给出指向「运行中这份 CLI 包」的类型别名，
 * 让没有 tsconfig 的项目也能拿到真实类型。
 *
 * 类型入口优先 `src/`（仓库内开发态，最新），其次 `types/`（发布包根入口），再次 `dist/src/`。
 */

export type TsPaths = Record<string, string[]>

/** 从 `fromDir` 向上找到 `name: "genshin-ts"` 的 package.json 所在目录。 */
export function resolveGenshinTsPackageRoot(fromDir: string): string | undefined {
  let dir = path.resolve(fromDir)
  for (;;) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: unknown }
        if (meta.name === 'genshin-ts') return dir
      } catch {
        // 坏 package.json 不算命中，继续向上
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function firstExisting(candidates: string[]): string[] {
  return candidates.filter((candidate) => fs.existsSync(candidate.replace(/\*$/, '')))
}

/**
 * 生成 `genshin-ts` / `genshin-ts/*` 的 paths 映射（绝对路径，调用方无需设 baseUrl）。
 * 找不到包根时返回空对象，调用方保持原行为。
 */
export function defaultGenshinTsPaths(fromDir: string): TsPaths {
  const packageRoot = resolveGenshinTsPackageRoot(fromDir)
  if (packageRoot === undefined) return {}

  const srcRoot = path.join(packageRoot, 'src')
  const distRoot = path.join(packageRoot, 'dist', 'src')
  const rootEntries = firstExisting([
    path.join(srcRoot, 'index.ts'),
    path.join(packageRoot, 'types', 'gsts', 'index.d.ts'),
    path.join(distRoot, 'index.d.ts')
  ])
  const subEntries = firstExisting([
    path.join(srcRoot, '*'),
    path.join(distRoot, '*')
  ])

  const paths: TsPaths = {}
  if (rootEntries.length > 0) paths['genshin-ts'] = rootEntries
  if (subEntries.length > 0) paths['genshin-ts/*'] = subEntries
  return paths
}

/**
 * 合并兜底 paths：只补用户 tsconfig **没有声明**的键，用户显式映射优先。
 */
export function mergeGenshinTsPaths(
  existing: TsPaths | undefined,
  fallback: TsPaths
): TsPaths | undefined {
  const merged: TsPaths = { ...(existing ?? {}) }
  let added = false
  for (const [alias, targets] of Object.entries(fallback)) {
    if (merged[alias] !== undefined) continue
    merged[alias] = targets
    added = true
  }
  return added || existing !== undefined ? merged : undefined
}
