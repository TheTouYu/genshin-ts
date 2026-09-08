import fs from 'node:fs'
import path from 'node:path'

// src 与 dist 目录深度不同（src/compiler vs dist/src/compiler），不能写死相对层级；
// 从模块位置向上找到仓库根的 tsconfig.tsx.json。
export function resolveTsxConfigPath(fromDir: string): string {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, 'tsconfig.tsx.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`[error] cannot locate tsconfig.tsx.json above ${fromDir}`)
    }
    dir = parent
  }
}
