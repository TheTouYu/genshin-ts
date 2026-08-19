#!/usr/bin/env node
/**
 * dsh-plugin-search — 在 GitHub topic:dsh-plugin 中模糊搜索插件
 *
 * 数据源：
 *   1. GitHub 搜索 API：q=topic:dsh-plugin（结构化、可翻页，搜索 API 上限 1000 条）
 *   2. 可选 --api 模式：额外用关键词跑 GitHub 全文搜索（含 README），结果合并进缓存
 *
 * 模糊匹配：对标题(full_name/name)、描述(description)、话题标签(topics) 做
 *   精确/前缀/子串/编辑距离/子序列 多级打分，按分数排序输出。
 *
 * 用法：
 *   node search.mjs <关键词...>                 # 在缓存数据中模糊搜索
 *   node search.mjs custom model --refresh     # 先重新拉取 GitHub 数据
 *   node search.mjs "api key" --api openrouter # 额外用 GitHub 全文搜索（含 README）并合并
 *   node search.mjs --list                     # 列出缓存的仓库数
 *   node search.mjs x --json                   # JSON 输出
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 数据目录：优先脚本同级 data/，其次上级 data/（技能布局 scripts/search.mjs + 上级 data/）
const DATA_DIR = fs.existsSync(path.join(__dirname, 'data'))
  ? path.join(__dirname, 'data')
  : fs.existsSync(path.join(__dirname, '..', 'data'))
    ? path.join(__dirname, '..', 'data')
    : path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'repos.json');
const TOPIC = 'dsh-plugin';
const PER_PAGE = 100;
const DEFAULT_PAGES = 10; // GitHub 搜索 API 最多返回 1000 条
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 缓存 24 小时
const UA = 'dsh-plugin-search (local tool)';

// ---------------- 工具函数 ----------------

function log(...a) { console.error('[dsh-search]', ...a); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 归一化：小写、NFKC、非字母数字(CJK 保留)替换为空格、压缩空白 */
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasCJK(s) { return /[\u4e00-\u9fff]/.test(s); }

/** Levenshtein 距离（用于 ASCII token 的容错） */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 子序列匹配：q 的每个字符按顺序出现在 t 中（可跳过字符） */
function isSubsequence(q, t) {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) if (q[i] === t[j]) i++;
  return i === q.length;
}

/**
 * 单个 query token 对单个字段 token 的打分（0..1）
 * exact > prefix > substring > 编辑距离 > 子序列
 */
function tokenScore(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1.0;
  if (t.startsWith(q)) return 0.85;                    // 前缀
  if (t.includes(q)) return 0.75;                      // 子串
  if (!hasCJK(q) && t.length >= 4 && q.length >= 3) {
    const d = levenshtein(q, t);
    if (d === 1) return 0.68;
    if (d === 2 && t.length >= 5) return 0.55;
    // 编辑距离比例
    if (t.length >= 6 && d / Math.max(q.length, t.length) <= 0.25) return 0.5;
  }
  if (!hasCJK(q) && q.length >= 3 && isSubsequence(q, t)) return 0.45;
  return 0;
}

/** CJK 查询：整串子串匹配，否则退化为 2-gram 覆盖度 */
function cjkScore(q, field) {
  if (field.includes(q)) return 1.0;
  if (q.length < 2) return 0;
  let hit = 0, total = 0;
  for (let i = 0; i + 1 < q.length; i++) {
    total++;
    if (field.includes(q.slice(i, i + 2))) hit++;
  }
  return total === 0 ? 0 : (hit / total) * 0.8;
}

const FIELD_WEIGHT = { name: 2.0, description: 1.0, topics: 0.8 };

/**
 * 对单个 repo 计算与 query 的模糊匹配分数
 * @returns {score, matched: {field: [tokens]}, snippet}
 */
function scoreRepo(repo, queryTokens, opts) {
  const fields = {
    name: normalize(repo.name),
    description: normalize(repo.description),
    topics: normalize((repo.topics || []).join(' ')),
  };
  if (opts.titleOnly) { delete fields.description; delete fields.topics; }
  if (opts.descOnly) { delete fields.name; delete fields.topics; }
  if (opts.noTopics) delete fields.topics;

  const fullQuery = normalize(queryTokens.join(' '));
  let total = 0;
  let matchedTokens = new Set();

  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    const w = FIELD_WEIGHT[field] ?? 1.0;
    // 整句短语子串：强信号
    if (fullQuery.length >= 3 && text.includes(fullQuery)) {
      total += 1.6 * w * queryTokens.length;
    }
    for (const q of queryTokens) {
      let best = 0;
      if (hasCJK(q)) {
        best = cjkScore(q, text);
      } else {
        for (const t of text.split(' ')) {
          const s = tokenScore(q, t);
          if (s > best) best = s;
        }
      }
      if (best > 0) matchedTokens.add(q);
      total += best * w;
    }
  }

  // 覆盖率乘数：没匹配上的 token 越多，分数越低
  const coverage = queryTokens.length === 0 ? 0 : matchedTokens.size / queryTokens.length;
  const score = total * (0.35 + 0.65 * coverage);

  // 生成命中片段（用于展示）
  let snippet = '';
  for (const field of ['name', 'description']) {
    const raw = repo[field === 'name' ? 'description' : 'description'] ?? '';
    if (raw && /[a-z0-9\u4e00-\u9fff]+/i.test(raw)) {
      const idx = raw.toLowerCase().search(fullQuery.split(' ')[0].slice(0, 8));
      snippet = idx >= 0
        ? '…' + raw.slice(Math.max(0, idx - 30), idx + 60) + '…'
        : raw.slice(0, 90);
      break;
    }
  }

  return { score, coverage, matched: [...matchedTokens], snippet };
}

// ---------------- 数据获取 ----------------

async function apiGet(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA } });
  if (res.status === 403) {
    const reset = res.headers.get('x-ratelimit-reset');
    const wait = reset ? Math.max(0, Number(reset) * 1000 - Date.now()) : 60_000;
    throw new Error(`GitHub 限流(403)，建议等待 ${Math.ceil(wait / 1000)}s 后重试，或使用缓存(--refresh 会触发) `);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function fetchTopicPages(pages, onPage) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const res = await apiGet(
      `https://api.github.com/search/repositories?q=topic:${TOPIC}&per_page=${PER_PAGE}&page=${p}`
    );
    const data = await res.json();
    all.push(...data.items);
    onPage?.(p, all.length, res.headers.get('x-ratelimit-remaining'));
    if (data.items.length < PER_PAGE) break;
    if (p < pages) await sleep(7500); // 未认证搜索 API：10 次/分钟
  }
  return all;
}

function compactRepo(it) {
  return {
    name: it.name,
    full_name: it.full_name,
    description: it.description || '',
    html_url: it.html_url,
    topics: it.topics || [],
    stargazers_count: it.stargazers_count ?? 0,
    language: it.language || '',
    updated_at: it.updated_at || '',
    archived: !!it.archived,
  };
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}

function saveCache(repos) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const cache = { fetchedAt: new Date().toISOString(), source: `topic:${TOPIC}`, count: repos.length, repos };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return cache;
}

async function refreshCache(pages, opts) {
  log(`拉取 topic:${TOPIC} 数据（${pages} 页 × ${PER_PAGE}）…（未认证限流 10 次/分钟，需等待）`);
  const repos = await fetchTopicPages(pages, (p, n, rem) => {
    log(`页 ${p} 完成，累计 ${n} 个仓库，剩余配额 ${rem}`);
  });
  if (opts.apiQuery) {
    log(`额外运行 GitHub 全文搜索：${opts.apiQuery}（含 README）…`);
    const q = encodeURIComponent(`topic:${TOPIC} ${opts.apiQuery} in:name,description,readme`);
    const res = await apiGet(`https://api.github.com/search/repositories?q=${q}&per_page=100`);
    const data = await res.json();
    const seen = new Set(repos.map(r => r.full_name));
    for (const it of data.items) {
      if (!seen.has(it.full_name)) { repos.push(compactRepo(it)); seen.add(it.full_name); }
    }
    log(`全文搜索补充 ${data.items.length} 条，去重后共 ${repos.length} 个仓库`);
  }
  const cache = saveCache(repos);
  log(`缓存已写入 ${CACHE_FILE}（${repos.length} 个仓库）`);
  return cache;
}

// ---------------- CLI ----------------

function parseArgs(argv) {
  const opts = { pages: DEFAULT_PAGES, limit: 15, minScore: 0.4, refresh: false, json: false,
                 titleOnly: false, descOnly: false, noTopics: false, list: false, apiQuery: '' };
  const query = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      switch (k) {
        case '--refresh': opts.refresh = true; break;
        case '--json': opts.json = true; break;
        case '--title-only': opts.titleOnly = true; break;
        case '--desc-only': opts.descOnly = true; break;
        case '--no-topics': opts.noTopics = true; break;
        case '--list': opts.list = true; break;
        case '--pages': opts.pages = Math.min(parseInt(v ?? argv[++i], 10) || DEFAULT_PAGES, 10); break;
        case '--limit': opts.limit = parseInt(v ?? argv[++i], 10) || 15; break;
        case '--min-score': opts.minScore = parseFloat(v ?? argv[++i]) || 0.4; break;
        case '--api': opts.apiQuery = (v ?? argv[++i] ?? '').trim(); break;
        default: log(`未知参数: ${k}`);
      }
    } else {
      query.push(a);
    }
  }
  return { opts, query };
}

async function main() {
  const { opts, query } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (opts.list) {
    const cache = loadCache();
    if (!cache) { log('缓存为空，先运行 node search.mjs --refresh'); return; }
    console.log(`缓存 ${cache.count} 个仓库，抓取于 ${cache.fetchedAt}`);
    return;
  }

  // 缓存判断
  let cache = loadCache();
  const stale = !cache || Date.now() - new Date(cache.fetchedAt).getTime() > CACHE_TTL_MS;
  if (opts.refresh || (stale && !opts.apiQuery)) {
    cache = await refreshCache(opts.pages, opts);
  } else if (stale && opts.apiQuery) {
    // 缓存过期但只想跑 API 关键词：先刷新缓存再合并
    cache = await refreshCache(opts.pages, opts);
  }

  if (!query.length) {
    console.log(`缓存中 ${cache.count} 个仓库（抓取于 ${cache.fetchedAt}）。用法：node search.mjs <关键词...> [--refresh] [--api "额外关键词"]`);
    return;
  }

  // 若指定了 --api 但缓存未刷新过，做一次合并
  if (opts.apiQuery) {
    const q = encodeURIComponent(`topic:${TOPIC} ${opts.apiQuery} in:name,description,readme`);
    log(`运行 GitHub 全文搜索（含 README）：${opts.apiQuery}`);
    const res = await apiGet(`https://api.github.com/search/repositories?q=${q}&per_page=100`);
    const data = await res.json();
    const seen = new Set(cache.repos.map(r => r.full_name));
    let added = 0;
    for (const it of data.items) {
      if (!seen.has(it.full_name)) { cache.repos.push(compactRepo(it)); seen.add(it.full_name); added++; }
    }
    if (added) { saveCache(cache.repos); log(`合并 ${added} 个全文搜索命中的仓库到缓存`); }
    else log('全文搜索命中的仓库已在缓存中');
  }

  const queryTokens = normalize(query.join(' ')).split(' ').filter(Boolean);
  const results = cache.repos
    .map(repo => ({ repo, ...scoreRepo(repo, queryTokens, opts) }))
    .filter(r => r.score >= opts.minScore)
    .sort((a, b) => b.score - a.score || b.repo.stargazers_count - a.repo.stargazers_count);

  if (opts.json) {
    console.log(JSON.stringify(results.slice(0, opts.limit).map(r => ({
      score: +r.score.toFixed(3),
      full_name: r.repo.full_name,
      description: r.repo.description,
      topics: r.repo.topics,
      stars: r.repo.stargazers_count,
      url: r.repo.html_url,
    })), null, 2));
    return;
  }

  if (!results.length) {
    console.log(`未找到匹配「${query.join(' ')}」的仓库（阈值 ${opts.minScore}）。可尝试：更短的关键词 / --api "关键词" 搜 README / --min-score 调低`);
    return;
  }

  console.log(`\n「${query.join(' ')}」模糊匹配 ${results.length} 个候选（展示前 ${Math.min(opts.limit, results.length)}）：\n`);
  for (const r of results.slice(0, opts.limit)) {
    const star = r.repo.stargazers_count ? `⭐${r.repo.stargazers_count}` : '';
    const topics = r.repo.topics?.length ? ` [${r.repo.topics.slice(0, 5).join(', ')}]` : '';
    console.log(`  ${r.score.toFixed(2).padStart(5)}  ${r.repo.full_name} ${star}`);
    if (r.repo.description) console.log(`         ${r.repo.description.slice(0, 120)}`);
    if (topics) console.log(`        ${topics}`);
    console.log(`         ${r.repo.html_url}`);
  }
  console.log('');
}

main().catch(e => { console.error('[dsh-search] 失败:', e.message); process.exit(1); });
