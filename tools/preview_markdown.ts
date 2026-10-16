// tools/preview_markdown.ts — 在终端预览 Markdown（经 src/cli/markdown_render.ts 渲染成 ANSI），供人读文档时快速查看。

import fs from 'node:fs'

import { renderMarkdownToAnsi } from '../src/cli/markdown_render.js'

function usage() {
  console.log(
    [
      'usage:',
      '  npx tsx tools/preview_markdown.ts <file.md>',
      '  cat <file.md> | npx tsx tools/preview_markdown.ts',
      '',
      'examples:',
      '  npx tsx tools/preview_markdown.ts ./README.md',
      '  echo "# hi" | npx tsx tools/preview_markdown.ts'
    ].join('\n')
  )
}

function readStdin(): string {
  return fs.readFileSync(0, 'utf8')
}

function main() {
  const [arg] = process.argv.slice(2)
  if (arg === '--help' || arg === '-h') {
    usage()
    return
  }
  const md = arg ? fs.readFileSync(arg, 'utf8') : readStdin()
  process.stdout.write(renderMarkdownToAnsi(md) + '\n')
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
