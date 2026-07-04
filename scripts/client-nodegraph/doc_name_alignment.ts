/**
 * Align zh-cn and en-us node entries of resources/node_definitions.json for the
 * client_* / detail_* categories.
 *
 * The official zh and en page arrays are misordered relative to each other, so
 * index-based pairing is forbidden (see docs/maintenance/routine-node-maintenance.md).
 * Alignment uses, per section pair:
 *   1. parameter fingerprint matches unique on both sides
 *   2. seed dictionary entries validated against the unmatched en pool
 *   3. elimination (a fingerprint group reduced to 1v1 by earlier rounds)
 * repeated until a fixpoint. Results are aggregated globally with conflicts
 * reported instead of guessed.
 */
import fs from 'node:fs'

export type DocParam = {
  io: 'in' | 'out' | 'other'
  name: string
  dataType: string
  description: string
}

export type DocNodeEntry = {
  page: string
  section: number
  name: string
  functions: string[]
  params: DocParam[]
}

export type AlignedDocNode = {
  zhName: string
  enName: string
  provenance: 'fingerprint' | 'seed' | 'elimination'
  pages: string[]
  zh: DocNodeEntry
  en: DocNodeEntry
}

export type DocAlignmentReport = {
  pagePairs: number
  zhEntries: number
  matched: number
  matchRate: string
  provenance: Record<string, number>
  conflicts: Array<{ zhName: string; enNames: string[]; chosen: string }>
  unresolved: Array<{ page: string; section: number; zhName: string; fingerprint: string }>
  /** per section with unresolved zh entries: the leftover en candidate pool */
  sectionLeftovers: Array<{ page: string; section: number; zh: string[]; en: string[] }>
  seedMisses: Array<{ zhName: string; expectedEn: string; page: string }>
}

export type DocAlignment = {
  /** official zh node name -> aligned doc info */
  byZhName: Map<string, AlignedDocNode>
  /**
   * official zh node name -> all distinct doc variants (primary first). Some
   * names describe different nodes per graph family (e.g. 获取实体位置 takes an
   * entity in skill/filter graphs but a target-selector enum in creation
   * status graphs); consumers pick the variant matching their pin evidence.
   */
  variantsByZhName: Map<string, AlignedDocNode[]>
  report: DocAlignmentReport
}

/**
 * Developer-confirmed zh -> en pairs for fingerprint-identical clusters
 * (comparators, logic ops, trig, list min/max...). Every entry is validated
 * against the unmatched en pool of the same section: a seed whose en name is
 * absent fails the build instead of silently mis-mapping.
 */
const SEED_ZH_TO_EN: Record<string, string> = {
  // comparators / logic / trig / math clusters (identical fingerprints)
  是否大于: 'Greater Than',
  是否小于: 'Less Than',
  是否大于等于: 'Greater Than or Equal To',
  是否小于等于: 'Less Than or Equal To',
  是否相等: 'Equal',
  枚举匹配: 'Enumeration Match',
  逻辑与运算: 'Logical AND Operation',
  逻辑或运算: 'Logical OR Operation',
  逻辑异或运算: 'Logical XOR Operation',
  正弦函数: 'Sine Function',
  余弦函数: 'Cosine Function',
  正切函数: 'Tangent Function',
  反正弦函数: 'Arcsine Function',
  反余弦函数: 'Arccosine Function',
  反正切函数: 'Arctangent Function',
  弧度转角度: 'Radians to Degrees',
  角度转弧度: 'Degrees to Radians',
  绝对值运算: 'Absolute Value Operation',
  加法运算: 'Addition',
  减法运算: 'Subtraction',
  乘法运算: 'Multiplication',
  除法运算: 'Division',
  获取列表最大值: 'Get Maximum Value From List',
  获取列表最小值: 'Get Minimum Value From List',
  拼装列表: 'Assembly List',
  拼装字典: 'Assembly Dictionary',
  建立字典: 'Create Dictionary',
  // vectors
  三维向量加法: '3D Vector Addition',
  三维向量减法: '3D Vector Subtraction',
  三维向量内积: '3D Vector Dot Product',
  三维向量外积: '3D Vector Cross Product',
  三维向量夹角: '3D Vector Angle',
  三维向量旋转: '3D Vector Rotation',
  三维向量归一化: '3D Vector Normalization',
  方向向量转旋转: 'Direction Vector to Rotation',
  朝向转旋转: 'Orientation to Rotation',
  // flow
  双分支: 'Double Branch',
  多分支: 'Multiple Branches',
  // exec cluster: skill / aiming / behavior
  重置技能目标: 'Reset Skill Target',
  强制退出瞄准状态: 'Force Exit Aiming State',
  打断当前技能: 'Interrupt Current Skill',
  清空关键行为记录面板: 'Clear Key Behavior Log Panel',
  设置技能变量: 'Set Skill Variable',
  增加技能变量值: 'Increase Skill Variable Value',
  定点发射投射物: 'Fixed-Point Projectile Launch',
  玩家转向: 'Player Turning',
  移除指定角色扰动装置: 'Remove Specified Character Disruptor Device',
  // exec cluster: hitboxes (fingerprints unreliable across languages here)
  特定位置打攻击盒: 'Trigger Hitbox at Specific Location',
  特定位置打矩形攻击盒: 'Trigger Rectangular Hitbox at Specific Location',
  特定位置打球形攻击盒: 'Trigger Spherical Hitbox at Specific Location',
  特定位置打扇形攻击盒: 'Trigger Sector Hitbox at Specific Location',
  指定挂接点打矩形攻击盒: 'Trigger Rectangular Hitbox at Specified Attachment Point',
  指定挂接点打球形攻击盒: 'Trigger Spherical Hitbox at Specified Attachment Point',
  指定挂接点打扇形攻击盒: 'Trigger Sector Hitbox at Specified Attachment Point',
  // exec cluster: aggro
  设置指定实体的仇恨值: 'Set the Aggro Value of the Specified Entity',
  增加指定实体的仇恨值: 'Increase the Aggro Value of the Specified Entity',
  将目标实体移除出仇恨列表: 'Remove Target Entity From Aggro List',
  嘲讽目标: 'Taunt Target',
  // query cluster: entities
  获取自身实体: 'Get Self Entity',
  获取目标实体: 'Get Target Entity',
  获取关卡实体: 'Get Stage Entity',
  获取实体位置: 'Get Entity Location',
  获取实体旋转: 'Get Entity Rotation',
  获取目标挂接点位置: 'Get Target Attachment Point Location',
  获取目标挂接点旋转: 'Get Target Attachment Point Rotation',
  获取实体类型列表: 'Get Entity Type List',
  获取射线筛选类型列表: 'Get Ray Filter Type List',
  获取指定玩家的角色实体: 'Get Character Entity of Specified Player',
  获取角色归属的玩家实体: 'Get Player Entity to Which the Character Belongs',
  获取指定玩家的前台角色: 'Get Active Character of Specified Player',
  获取玩家的角色列表: "Get Player's Character List",
  获取玩家移动输入: 'Get Player Movement Input',
  获取子实体列表: 'Get Sub-Entity List',
  获取单位攻击目标: 'Get Unit Attack Target',
  获取造物当前目标: "Get Creation's Current Target",
  // query cluster: dictionaries
  查询字典是否包含特定键: 'Query If Dictionary Contains Specific Key',
  查询字典是否包含特定值: 'Query If Dictionary Contains Specific Value',
  获取字典中键组成的列表: 'Get List of Keys From Dictionary',
  获取字典中值组成的列表: 'Get List of Values From Dictionary',
  // query cluster: creation status self-checks
  查询自身距离目标的水平距离: 'Check the Horizontal Distance From Self to Target',
  查询自身距离目标的垂直距离: 'Check the Vertical Distance From Self to Target',
  查询自身距离目标的距离: 'Check the Distance From Self to Target',
  查询自身距离目标的水平角度: 'Check the Horizontal Angle From Self to Target',
  查询自身距离目标的垂直角度: 'Check the Vertical Angle From Self to Target',
  查询目标点是否寻路可达: 'Check Target Position Pathfinding Availability',
  查询自身是否处于交战中: 'Check Whether Self Is in Battle',
  查询自身是否在领地中: 'Check If Self Is in the Territory',
  查询入战时的坐标点: 'Check the Coordinates When Entering Battle',
  获取出生点位置信息: 'Get Spawn Point Location Information',
  // creation cooldown cluster
  设置造物冷却组的时间: 'Set the Time of the Creation Cooldown Group',
  设置造物冷却组的当前时间: 'Set the Current Time of the Creation Cooldown Group',
  设置造物技能的冷却时间: 'Set the CD of the Creation Skill',
  设置造物技能的当前冷却时间: 'Set the Current CD of the Creation Skill',
  // tactics
  '战术：地面追击': 'Tactic: Ground Pursuit',
  获取前一帧执行状态: 'Get Previous Frame Execution Status'
}

/**
 * Sample-derived display names (from vendor sample file names) that differ from
 * the official doc zh node names. Bridges metadata displayName -> doc zh name.
 * Keys may be family-qualified (`subType:displayName`) when the official docs
 * name the same generic node differently per graph family.
 */
export const METADATA_ZH_TO_DOC_ZH: Record<string, string> = {
  查询字典中值组成的列表: '获取字典中值组成的列表',
  查询字典中键组成的列表: '获取字典中键组成的列表',
  获取复杂造物当前释放的技能: '获取复杂造物当前施放的技能',
  // same generic node (200075); official docs name it per family
  'character_skill:恢复生命值': '角色恢复生命值',
  'creation_skill:恢复生命值': '造物恢复生命值'
}

/** metadata displayName (+ family) -> aligned doc node, applying the bridges */
export function lookupDocNode(
  alignment: DocAlignment,
  subType: string,
  displayName: string
): AlignedDocNode | undefined {
  const docZh =
    METADATA_ZH_TO_DOC_ZH[`${subType}:${displayName}`] ??
    METADATA_ZH_TO_DOC_ZH[displayName] ??
    displayName
  return alignment.byZhName.get(docZh)
}

/** all doc shape variants for a metadata displayName (primary variant first) */
export function lookupDocNodeVariants(
  alignment: DocAlignment,
  subType: string,
  displayName: string
): AlignedDocNode[] {
  const docZh =
    METADATA_ZH_TO_DOC_ZH[`${subType}:${displayName}`] ??
    METADATA_ZH_TO_DOC_ZH[displayName] ??
    displayName
  return alignment.variantsByZhName.get(docZh) ?? []
}

const TYPE_TAGS: Array<[RegExp, string]> = [
  [/布尔值?列表|boolean list/gi, 'BL'],
  [/整数列表|integer list/gi, 'IL'],
  [/浮点数?列表|float(?:ing point)? (?:number )?list|floating point list/gi, 'FL'],
  [/字符串列表|string list/gi, 'SL'],
  [/三维向量列表|3d vector list/gi, 'VL'],
  [/实体列表|entity list/gi, 'EL'],
  [/枚举列表|enumerations? list|enumerationd list/gi, 'NL'],
  [/配置ID列表|config(?:uration)? id list/gi, 'CL'],
  [/GUID列表|guid list/gi, 'UL'],
  [/布尔值?|boolean/gi, 'B'],
  [/整数|integer/gi, 'I'],
  [/浮点数?|float(?:ing point numbers?)?/gi, 'F'],
  [/字符串|string/gi, 'S'],
  [/三维向量|3d vector/gi, 'V'],
  [/实体|entity|emtity/gi, 'E'],
  [/枚举|enumerations?|enumerationd|enum/gi, 'N'],
  [/泛型|generic/gi, 'G'],
  [/列表|list/gi, 'L'],
  [/字典|dictionary/gi, 'D'],
  [/GUID/gi, 'U'],
  [/配置ID|config(?:uration)? id/gi, 'C'],
  [/预制体ID|prefab id/gi, 'P'],
  [/局部变量|local variable/gi, 'W'],
  [/自定义变量快照|custom variable snapshot/gi, 'X'],
  [/结构体?|structure/gi, 'T'],
  [/阵营|faction/gi, 'A']
]

/** doc data_type text -> single-letter tag ('' empty, '?' unknown) */
export function docTypeTag(dataType: string): string {
  return typeTag(dataType)
}

function typeTag(dataType: string): string {
  let s = String(dataType ?? '').trim()
  for (const [re, tag] of TYPE_TAGS) {
    if (re.test(s)) {
      re.lastIndex = 0
      return tag
    }
    re.lastIndex = 0
  }
  return s ? '?' : ''
}

function ioTag(io: string): DocParam['io'] {
  // tolerate doc typos like "Input Paraneter"
  if (/入参|input/i.test(io)) return 'in'
  if (/出参|output/i.test(io)) return 'out'
  return 'other'
}

function fingerprint(params: DocParam[]): string {
  // docs sometimes mislabel io (bare "Parameter", named labels); everything not
  // explicitly an output is treated as an input for matching purposes
  return params.map((p) => `${p.io === 'out' ? 'o' : 'i'}${typeTag(p.dataType)}`).join(',')
}

/** normalize curly quotes/whitespace so spelling variants collapse to one form */
function canonicalEnName(name: string): string {
  return name
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseEntries(page: unknown, slug: string): DocNodeEntry[] {
  const out: DocNodeEntry[] = []
  const sections = (page as { sections?: Array<{ nodes?: unknown[] }> }).sections ?? []
  sections.forEach((section, sectionIndex) => {
    for (const rawNode of section.nodes ?? []) {
      const node = rawNode as {
        name?: string
        functions?: string[]
        parameters?: Array<{ io?: string; name?: string; data_type?: string; description?: string }>
      }
      const name = node.name?.trim()
      if (!name) continue
      out.push({
        page: slug,
        section: sectionIndex,
        name,
        functions: (node.functions ?? []).map((f) => String(f).trim()).filter(Boolean),
        params: (node.parameters ?? []).map((p) => ({
          io: ioTag(p.io ?? ''),
          name: (p.name ?? '').trim(),
          dataType: (p.data_type ?? '').trim(),
          description: (p.description ?? '').trim()
        }))
      })
    }
  })
  return out
}

type SectionMatch = {
  zh: DocNodeEntry
  en: DocNodeEntry
  provenance: AlignedDocNode['provenance']
}

function alignSection(
  zhNodes: DocNodeEntry[],
  enNodes: DocNodeEntry[],
  seedMisses: DocAlignmentReport['seedMisses']
): { matches: SectionMatch[]; unresolvedZh: DocNodeEntry[]; unresolvedEn: DocNodeEntry[] } {
  const matches: SectionMatch[] = []
  let zhPool = [...zhNodes]
  let enPool = [...enNodes]

  const take = (zh: DocNodeEntry, en: DocNodeEntry, provenance: AlignedDocNode['provenance']) => {
    matches.push({ zh, en, provenance })
    zhPool = zhPool.filter((n) => n !== zh)
    enPool = enPool.filter((n) => n !== en)
  }

  let changed = true
  let firstRound = true
  while (changed) {
    changed = false

    // round A: fingerprints unique on both sides
    const zhByFp = new Map<string, DocNodeEntry[]>()
    for (const n of zhPool) {
      const k = fingerprint(n.params)
      zhByFp.set(k, [...(zhByFp.get(k) ?? []), n])
    }
    const enByFp = new Map<string, DocNodeEntry[]>()
    for (const n of enPool) {
      const k = fingerprint(n.params)
      enByFp.set(k, [...(enByFp.get(k) ?? []), n])
    }
    for (const [fp, zhGroup] of zhByFp) {
      const enGroup = enByFp.get(fp) ?? []
      if (zhGroup.length === 1 && enGroup.length === 1) {
        take(zhGroup[0], enGroup[0], firstRound ? 'fingerprint' : 'elimination')
        changed = true
      }
    }

    // round B: seed entries against the remaining en pool
    for (const zh of [...zhPool]) {
      const expectedEn = SEED_ZH_TO_EN[zh.name]
      if (!expectedEn) continue
      const candidates = enPool.filter((en) => canonicalEnName(en.name) === canonicalEnName(expectedEn))
      if (candidates.length === 1) {
        take(zh, candidates[0], 'seed')
        changed = true
      } else if (candidates.length === 0 && firstRound) {
        seedMisses.push({ zhName: zh.name, expectedEn, page: zh.page })
      }
    }

    firstRound = false
  }

  return { matches, unresolvedZh: zhPool, unresolvedEn: enPool }
}

export function buildDocNameAlignment(
  defsPath = 'resources/node_definitions.json'
): DocAlignment {
  const defs = JSON.parse(fs.readFileSync(defsPath, 'utf8')) as Record<string, unknown>

  const seedMisses: DocAlignmentReport['seedMisses'] = []
  const allMatches: SectionMatch[] = []
  const unresolved: DocAlignmentReport['unresolved'] = []
  const sectionLeftovers: DocAlignmentReport['sectionLeftovers'] = []
  let pagePairs = 0
  let zhEntries = 0

  for (const [slug, page] of Object.entries(defs)) {
    if (slug === '__summary__' || !slug.endsWith('_zh-cn')) continue
    if (!/^(client_|detail_)/.test(slug)) continue
    const enPage = defs[slug.replace(/_zh-cn$/, '_en-us')]
    if (!enPage) continue
    pagePairs++

    const zhAll = parseEntries(page, slug)
    const enAll = parseEntries(enPage, slug.replace(/_zh-cn$/, '_en-us'))
    zhEntries += zhAll.length
    const sectionCount = Math.max(
      ...zhAll.map((n) => n.section + 1),
      ...enAll.map((n) => n.section + 1),
      0
    )
    for (let s = 0; s < sectionCount; s++) {
      const { matches, unresolvedZh, unresolvedEn } = alignSection(
        zhAll.filter((n) => n.section === s),
        enAll.filter((n) => n.section === s),
        seedMisses
      )
      allMatches.push(...matches)
      for (const zh of unresolvedZh) {
        unresolved.push({
          page: slug,
          section: s,
          zhName: zh.name,
          fingerprint: fingerprint(zh.params)
        })
      }
      if (unresolvedZh.length || unresolvedEn.length) {
        sectionLeftovers.push({
          page: slug,
          section: s,
          zh: unresolvedZh.map((n) => `${n.name} [${fingerprint(n.params)}]`),
          en: unresolvedEn.map((n) => `${n.name} [${fingerprint(n.params)}]`)
        })
      }
    }
  }

  // global aggregation; official pages carry spelling variants of the same en
  // name (casing, Query/Check drift), resolved by majority vote with client_*
  // pages preferred, and every variant group reported for review. Matches are
  // first split by zh parameter fingerprint: some zh names describe different
  // node shapes per graph family (e.g. 获取实体位置 entity vs selector-enum).
  const matchesByZh = new Map<string, SectionMatch[]>()
  for (const match of allMatches) {
    const list = matchesByZh.get(match.zh.name) ?? []
    list.push(match)
    matchesByZh.set(match.zh.name, list)
  }

  const byZhName = new Map<string, AlignedDocNode>()
  const variantsByZhName = new Map<string, AlignedDocNode[]>()
  const conflicts: DocAlignmentReport['conflicts'] = []
  for (const [zhName, matches] of matchesByZh) {
    const byFingerprint = new Map<string, SectionMatch[]>()
    for (const m of matches) {
      const key = fingerprint(m.zh.params)
      byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), m])
    }
    const groups = [...byFingerprint.values()].sort((a, b) => b.length - a.length)

    const variants: AlignedDocNode[] = []
    for (const [groupIndex, group] of groups.entries()) {
      const votes = new Map<string, { count: number; clientPage: boolean; matches: SectionMatch[] }>()
      for (const m of group) {
        const enName = canonicalEnName(m.en.name)
        const vote = votes.get(enName) ?? { count: 0, clientPage: false, matches: [] }
        vote.count++
        vote.clientPage ||= m.zh.page.startsWith('client_')
        vote.matches.push(m)
        votes.set(enName, vote)
      }
      const ranked = [...votes.entries()].sort(
        (a, b) =>
          b[1].count - a[1].count ||
          Number(b[1].clientPage) - Number(a[1].clientPage) ||
          a[0].localeCompare(b[0])
      )
      const [enName, vote] = ranked[0]
      if (ranked.length > 1 && groupIndex === 0) {
        conflicts.push({ zhName, enNames: ranked.map(([n]) => n), chosen: enName })
      }
      const representative = vote.matches.reduce((best, m) =>
        m.zh.functions.length > best.zh.functions.length ? m : best
      )
      variants.push({
        zhName,
        enName,
        provenance: representative.provenance,
        pages: group.map((m) => m.zh.page),
        zh: representative.zh,
        en: representative.en
      })
    }
    variantsByZhName.set(zhName, variants)
    byZhName.set(zhName, variants[0])
  }

  const provenance: Record<string, number> = {}
  for (const info of byZhName.values()) {
    provenance[info.provenance] = (provenance[info.provenance] ?? 0) + 1
  }

  const report: DocAlignmentReport = {
    pagePairs,
    zhEntries,
    matched: allMatches.length,
    matchRate: `${allMatches.length}/${zhEntries}`,
    provenance,
    conflicts,
    unresolved,
    sectionLeftovers,
    seedMisses
  }

  return { byZhName, variantsByZhName, report }
}
