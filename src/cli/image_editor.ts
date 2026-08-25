/**
 * `gsts image:*` — author and convert Miliastra image scenes.
 *
 * - image:import  CSS / JSON / SVG → SceneDocument (JSON)
 * - image:export  SceneDocument → CSS / SVG / JSON / GIA (image mode)
 *
 * These commands are pure file conversions; they never touch .gil maps,
 * game directories or inject anything. GIA output is the image editor
 * format (kind=8, class=15) usable as game image material.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  parseCssScene,
  parseJsonScene,
  parseSvgScene,
  sceneToCss,
  sceneToGiaDocument,
  sceneToJson,
  sceneToSvg,
  type SceneDocumentModel
} from '../image-editor/index.js'
import {
  convertImageModeDocumentToGiaBytes,
  type ImageModeDocument
} from '../image-editor/gia/image_mode.js'
import { loadDefaultImageTemplate } from '../image-editor/gia/template.js'
import { injectAssetsToExportDir, startImageServer } from '../image-editor/server.js'
import { listBeyondLocalExportDirs } from './gil_paths.js'

type Command = 'import' | 'export' | 'serve' | 'games' | 'inject'
type Format = 'json' | 'css' | 'svg' | 'gia'
type SourceType = 'json' | 'css' | 'svg'

interface ImageEditorArgs {
  command: Command
  input: string
  sourceType: SourceType | undefined
  format: Format
  output: string | undefined
  groupName: string | undefined
  template: string | undefined
  verbose: boolean
  port: number | undefined
  assetsDir: string | undefined
  game: string | undefined
}

function usage(exitCode = 1): never {
  const output = [
    'Author and convert Miliastra image scenes (SceneDocument).',
    '',
    'Usage: gsts image:import <input> --source-type <css|json|svg> [--output <scene.json>]',
    '       gsts image:export <scene.json> --format <css|svg|json|gia> [options]',
    '       gsts image:games',
    '       gsts image:inject <asset-file|asset-dir> [--game <id|path>] [options]',
    '       gsts image:serve [--port <port>] [--assets-dir <dir>]',
    '',
    '  image:import: parse a CSS/JSON/SVG source into a normalized SceneDocument JSON.',
    '  image:export: render a SceneDocument JSON to CSS/SVG/JSON or GIA (image mode).',
    '  image:games:  scan and list every detected game Beyond_Local_Export dir.',
    '  image:inject: convert asset file(s) to GIA and write them into a game',
    '                Beyond_Local_Export (group name = asset stem by default).',
    '  image:serve:  start the local web editor (preview + edit + export GIA + import to game).',
    '',
    'Options:',
    '  --source-type <css|json|svg>   input format (image:import)',
    '  --format <css|svg|json|gia>    output format (image:export)',
    '  --output <file>                write to file (defaults to stdout)',
    '  --group-name <name>            GIA group name (default: today YYYYMMDD; for',
    '                                 image:inject single file: the asset stem)',
    '  --template <file>              custom image-mode GIA template (default: vendored)',
    '  --game <id|path>               target game for image:inject: an id from',
    '                                 `image:games` (e.g. china:110170759) or a path',
    '                                 to a Beyond_Local_Export dir (default: the only',
    '                                 detected candidate, or error listing them)',
    '  --port <port>                  web editor port (default: 8510)',
    '  --assets-dir <dir>             asset library dir auto-scanned by the web UI',
    '                                 (default: <cwd>/assets/images; drop CSS/SVG/JSON',
    '                                 files there and the page refreshes automatically)',
    '  --verbose                      print conversion details to stderr',
    '  -h, --help                     show help',
    '',
    'GIA output writes the game image editor format (kind=8, class=15).'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function parseArgs(argv: readonly string[]): ImageEditorArgs {
  let command: Command = 'import'
  let index = 0
  if (
    argv[0] === 'import' ||
    argv[0] === 'export' ||
    argv[0] === 'serve' ||
    argv[0] === 'games' ||
    argv[0] === 'inject'
  ) {
    command = argv[0]
    index++
  } else if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === undefined) {
    usage(0)
  }
  let input: string | undefined
  let sourceType: SourceType | undefined
  let format: Format = 'json'
  let output: string | undefined
  let groupName: string | undefined
  let template: string | undefined
  let verbose = false
  let port: number | undefined
  let assetsDir: string | undefined
  let game: string | undefined
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--port') {
      port = Number(value(argv, index++))
      if (!Number.isFinite(port) || port < 0 || port > 65535) {
        throw new Error('[error] --port must be a valid port number')
      }
    } else if (arg === '--assets-dir') {
      assetsDir = value(argv, index++)
    } else if (arg === '--game') {
      game = value(argv, index++)
    } else if (arg === '--source-type') {
      const raw = value(argv, index++)
      if (raw !== 'json' && raw !== 'css' && raw !== 'svg') {
        throw new Error('[error] --source-type must be css, json or svg')
      }
      sourceType = raw
    } else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'json' && raw !== 'css' && raw !== 'svg' && raw !== 'gia') {
        throw new Error('[error] --format must be json, css, svg or gia')
      }
      format = raw
    } else if (arg === '--output') output = value(argv, index++)
    else if (arg === '--group-name') groupName = value(argv, index++)
    else if (arg === '--template') template = value(argv, index++)
    else if (arg === '--verbose') verbose = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else if (input === undefined) input = arg
    else usage()
  }
  if (command !== 'serve' && command !== 'games' && input === undefined) {
    throw new Error(`[error] ${command} requires an input file`)
  }
  if (command === 'import' && sourceType === undefined) {
    throw new Error('[error] image:import requires --source-type <css|json|svg>')
  }
  return {
    command,
    input: input ?? '',
    sourceType,
    format,
    output,
    groupName,
    template,
    verbose,
    port,
    assetsDir,
    game
  }
}

function readInput(input: string): string {
  return fs.readFileSync(path.resolve(input), 'utf-8')
}

function writeOutput(output: string | undefined, text: string, bytes?: Uint8Array): void {
  if (output === undefined) {
    if (bytes !== undefined) {
      // binary stdout only makes sense when redirected; still write raw bytes
      process.stdout.write(Buffer.from(bytes))
    } else {
      process.stdout.write(text)
    }
    return
  }
  const absolute = path.resolve(output)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  if (bytes !== undefined) fs.writeFileSync(absolute, Buffer.from(bytes))
  else fs.writeFileSync(absolute, text, 'utf-8')
}

function loadScene(input: string): SceneDocumentModel {
  const content = readInput(input)
  return parseJsonScene(content)
}

function runImport(args: ImageEditorArgs): void {
  const content = readInput(args.input)
  const scene: SceneDocumentModel =
    args.sourceType === 'css'
      ? parseCssScene(content)
      : args.sourceType === 'svg'
        ? parseSvgScene(content)
        : parseJsonScene(content)
  if (args.verbose) {
    for (const warning of scene.meta.warnings) process.stderr.write(`warning: ${warning}\n`)
  }
  writeOutput(args.output, sceneToJson(scene))
}

function runExport(args: ImageEditorArgs): void {
  const scene = loadScene(args.input)
  if (args.format === 'json') {
    writeOutput(args.output, sceneToJson(scene))
    return
  }
  if (args.format === 'css') {
    writeOutput(args.output, sceneToCss(scene))
    return
  }
  if (args.format === 'svg') {
    writeOutput(args.output, sceneToSvg(scene))
    return
  }
  const document = sceneToGiaDocument(scene, args.groupName)
  const template = args.template ? fs.readFileSync(path.resolve(args.template)) : loadDefaultImageTemplate()
  const bytes = convertImageModeDocumentToGiaBytes(document, template, {
    verbose: args.verbose
  })
  writeOutput(args.output, '', bytes)
}

function runGames(): void {
  const found = listBeyondLocalExportDirs()
  if (found.length === 0) {
    console.error(
      '[error] 未扫描到任何游戏 Beyond_Local_Export 目录。\n' +
        '  若游戏已安装，请检查 GSTS_LOCALLOW_DIR / GSTS_BEYOND_LOCAL_ROOT；\n' +
        '  或直接注入时用 --game <绝对路径> 指定导出目录。'
    )
    process.exit(1)
  }
  console.log(`已扫描到 ${found.length} 个游戏导出目录:`)
  for (const dir of found) {
    const label = dir.uid === null ? '根级' : `UID ${dir.uid}`
    console.log(`  [${dir.id}]  ${dir.region} · ${label}\n      ${dir.path}`)
  }
  console.log('用法: gsts image:inject <资产文件或目录> --game <上方 id 或路径>')
}

function resolveInjectExportDir(game: string | undefined): string {
  if (game) {
    if (fs.existsSync(game) && fs.statSync(game).isDirectory()) return path.resolve(game)
    const found = listBeyondLocalExportDirs()
    const match = found.find((d) => d.id === game)
    if (match) return match.path
    throw new Error(
      `[error] --game "${game}" 未匹配到任何游戏目录；先运行 gsts image:games 查看可用 id`
    )
  }
  const envDir = process.env.GSTS_BEYOND_LOCAL_EXPORT_DIR
  if (envDir && fs.existsSync(envDir)) return path.resolve(envDir)
  const found = listBeyondLocalExportDirs()
  if (found.length === 1) return found[0].path
  if (found.length === 0) {
    throw new Error(
      '[error] 未扫描到游戏导出目录；用 --game <绝对路径> 指定，或设置 GSTS_BEYOND_LOCAL_EXPORT_DIR'
    )
  }
  throw new Error(
    `[error] 检测到 ${found.length} 个游戏导出目录，请用 --game 指定一个（gsts image:games 查看）：\n` +
      found.map((d) => `  [${d.id}]  ${d.path}`).join('\n')
  )
}

function runInject(args: ImageEditorArgs): void {
  const input = path.resolve(args.input)
  const exportDir = resolveInjectExportDir(args.game)
  let names: string[]
  let assetsDir: string
  if (fs.statSync(input).isDirectory()) {
    assetsDir = input
    names = fs
      .readdirSync(input, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(css|svg|json)$/i.test(e.name))
      .map((e) => e.name)
      .sort()
    if (names.length === 0) {
      throw new Error(`[error] 目录中没有 .css/.svg/.json 资产文件: ${input}`)
    }
    if (args.groupName) {
      throw new Error('[error] 批量注入（目录）不支持 --group-name；组名统一用资产文件名')
    }
  } else {
    assetsDir = path.dirname(input)
    names = [path.basename(input)]
    if (!/\.(css|svg|json)$/i.test(names[0])) {
      throw new Error('[error] 仅支持 .css/.svg/.json 资产文件')
    }
  }
  const outcome = injectAssetsToExportDir(names, assetsDir, exportDir, args.groupName)
  for (const error of outcome.errors) {
    console.error(`  ✗ ${error.name}: ${error.error}`)
  }
  if (outcome.results.length === 0) {
    throw new Error('[error] 没有资产成功写入')
  }
  console.log(`已写入 ${outcome.results.length} 个 GIA 到 ${exportDir}:`)
  for (const result of outcome.results) {
    const resources = result.resources.map((r) => `${r.name}(${r.guid})`).join(', ')
    console.log(`  · ${result.fileName}  组名 "${result.groupName}"  资源 ${resources}`)
  }
}

export function runImageEditor(argv: readonly string[], _projectConfig?: unknown): void {
  const args = parseArgs(argv)
  if (args.command === 'serve') {
    startImageServer({ port: args.port, assetsDir: args.assetsDir })
    return
  }
  if (args.command === 'games') {
    runGames()
    return
  }
  if (args.command === 'inject') {
    runInject(args)
    return
  }
  if (args.command === 'import') runImport(args)
  else runExport(args)
}
