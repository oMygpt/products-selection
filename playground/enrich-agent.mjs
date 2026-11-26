import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAllDates,
  getDayData,
  fetchGitHubDetails,
  fetchPageInfo,
  extractReadableFromHtml,
  findGithubRepoInHtml,
  cleanRepoSlug,
  normalizeLicense,
  normalizePricing,
  extractMetaTag,
  stripTags,
  PRODUCT_TYPES,
  DELIVERY_LABELS,
  ENRICHED_FILE
} from './server.mjs';
import { extractDemoUrl, SCENARIO_RULES, repoMatchesProduct } from './lib/parser.mjs';

const QWEN_ENDPOINT = process.env.QWEN_BASE_URL || 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen3.8-flash';
const FAILED_QUEUE_FILE = path.join(path.dirname(ENRICHED_FILE), '.enrich-failed.json');
const VALID_FRICTION = new Set(['免注册直玩', '需注册登录', '需自备 Key', '需本地安装', '需桌面/插件']);
const VALID_SCENARIOS = new Set(SCENARIO_RULES.map(r => r.id));

function loadQwenApiKey() {
  if (process.env.QWEN_API_KEY) return process.env.QWEN_API_KEY.trim();
  if (process.env.ALIYUN_TOKEN_PLAN_API_KEY) return process.env.ALIYUN_TOKEN_PLAN_API_KEY.trim();
  const envFile = process.env.QWEN_ENV_FILE;
  if (envFile && fs.existsSync(envFile)) {
    const raw = fs.readFileSync(envFile, 'utf-8');
    const m = raw.match(/^QWEN_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 2, date: '', limit: 0, force: false, concurrency: 4, retryFailed: true, backfill: 0, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--days' && args[i + 1]) opts.days = parseInt(args[++i], 10) || 2;
    else if (a === '--date' && args[i + 1]) opts.date = args[++i];
    else if (a === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10) || 0;
    else if (a === '--concurrency' && args[i + 1]) opts.concurrency = Math.max(1, parseInt(args[++i], 10) || 4);
    else if (a === '--force') opts.force = true;
    else if (a === '--no-retry') opts.retryFailed = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--backfill' && args[i + 1]) opts.backfill = Math.max(0, parseInt(args[++i], 10) || 0);
  }
  return opts;
}

function loadJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || fallback;
  } catch { /* ignore */ }
  return fallback;
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const DIRECTORY_DOMAINS = [
  'producthunt.com', 'betalist.com', 'theresanaiforthat.com', 'news.ycombinator.com', 'duckduckgo.com',
  'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'reddit.com', 'wikipedia.org', 'medium.com'
];

function isDirectoryUrl(urlStr = '') {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return DIRECTORY_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

// Exact-name search is only trustworthy when we can cross-check it: the repo's homepage
// must point at the product's own site, or (no site known) the name must be distinctive.
export function acceptSearchHit(item, { normTarget, siteUrl = '' }) {
  const repoNorm = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (repoNorm !== normTarget) return false;
  const stars = item.stargazers_count || 0;
  let siteHost = '';
  try { siteHost = new URL(siteUrl).hostname.replace(/^www\./, ''); } catch { /* none */ }
  if (siteHost) {
    try {
      const home = new URL(item.homepage || '').hostname.replace(/^www\./, '');
      if (home && (home === siteHost || home.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${home}`))) return true;
    } catch { /* no homepage */ }
    return false;
  }
  return normTarget.length >= 6 && stars >= 10;
}

async function searchGithubRepoByName(productName, siteUrl = '') {
  const normTarget = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normTarget.length < 3) return null;
  try {
    const headers = { 'User-Agent': 'Daily-Product-Workbench', 'Accept': 'application/vnd.github+json' };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(productName)}+in:name&sort=stars&per_page=3`,
      { headers, signal: AbortSignal.timeout(5500) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    for (const item of data.items || []) {
      if (acceptSearchHit(item, { normTarget, siteUrl })) {
        return cleanRepoSlug(item.full_name);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchGithubHealth(repo) {
  if (!repo) return null;
  const headers = { 'User-Agent': 'Daily-Product-Workbench', 'Accept': 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const [repoRes, relRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(5500) }),
      fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null)
    ]);
    if (!repoRes.ok) return null;
    const d = await repoRes.json();
    let latestRelease = null;
    if (relRes && relRes.ok) {
      const rel = await relRes.json();
      latestRelease = {
        tag: rel.tag_name || null,
        publishedAt: rel.published_at ? rel.published_at.slice(0, 10) : null
      };
    }

    const pushedAt = d.pushed_at ? d.pushed_at.slice(0, 10) : null;
    const daysSincePush = d.pushed_at
      ? Math.floor((Date.now() - new Date(d.pushed_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    let activityTier = 'active';
    if (d.archived) activityTier = 'archived';
    else if (daysSincePush != null && daysSincePush > 180) activityTier = 'stale';
    else if (daysSincePush != null && daysSincePush > 45) activityTier = 'slowing';

    return {
      pushedAt,
      daysSincePush,
      openIssues: d.open_issues_count ?? null,
      forks: d.forks_count ?? null,
      archived: Boolean(d.archived),
      latestRelease,
      activityTier
    };
  } catch {
    return null;
  }
}

async function investigateProduct(product) {
  let directUrl = product.directUrl || (product.url && !isDirectoryUrl(product.url) ? product.url : null);
  let githubRepo = cleanRepoSlug(product.githubRepo);

  // 1. Prefer GitHub API lookup when repo is missing
  if (!githubRepo && (!directUrl || /开源|open\s*source|cli|mcp/i.test(`${product.tagline} ${product.description}`))) {
    const foundRepo = await searchGithubRepoByName(product.name, directUrl || '');
    if (foundRepo) githubRepo = foundRepo;
  }

  // 2. Scrape official website (non-GitHub) for title, description, ogImage, canEmbed
  let siteTitle = '';
  let siteDesc = '';
  let siteText = '';
  let ogImage = null;
  let canEmbed = null;
  if (directUrl && !directUrl.includes('github.com/')) {
    try {
      const page = await fetchPageInfo(directUrl);
      if (page.finalUrl && !isDirectoryUrl(page.finalUrl)) directUrl = page.finalUrl;
      canEmbed = page.canEmbed;
      if (page.ok && page.html) {
        siteTitle = extractMetaTag(page.html, 'property', 'og:title') || stripTags(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || '';
        siteDesc = extractMetaTag(page.html, 'property', 'og:description') || extractMetaTag(page.html, 'name', 'description') || '';
        const rawOgImg = extractMetaTag(page.html, 'property', 'og:image') || extractMetaTag(page.html, 'name', 'twitter:image');
        if (rawOgImg) {
          try {
            ogImage = new URL(rawOgImg, directUrl).href;
          } catch { /* ignore */ }
        }
        const blocks = extractReadableFromHtml(page.html);
        siteText = blocks.map(b => b.text).join('\n').slice(0, 2600);
        if (!githubRepo) {
          const discovered = findGithubRepoInHtml(page.html, { productName: product.name, siteUrl: directUrl });
          if (discovered) githubRepo = discovered;
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Inspect GitHub repo, README & health signals
  let ghDetails = null;
  let health = null;
  if (githubRepo) {
    [ghDetails, health] = await Promise.all([
      fetchGitHubDetails(githubRepo),
      fetchGithubHealth(githubRepo)
    ]);
    if (ghDetails?.meta?.homepage && !directUrl && !isDirectoryUrl(ghDetails.meta.homepage)) {
      if (/^https?:\/\//i.test(ghDetails.meta.homepage)) {
        directUrl = ghDetails.meta.homepage.trim();
      }
    }
    if (!ogImage) {
      ogImage = `https://opengraph.githubassets.com/1/${githubRepo}`;
    }
    if (canEmbed === null && (!directUrl || directUrl.includes('github.com/'))) {
      canEmbed = false;
    }
  }

  const demoUrl = extractDemoUrl(`${siteText} ${ghDetails?.readmeFull || ''}`, directUrl || '');

  return {
    directUrl: directUrl || (githubRepo ? `https://github.com/${githubRepo}` : product.url || ''),
    githubRepo: githubRepo || null,
    stars: ghDetails?.meta?.stargazers_count != null ? String(ghDetails.meta.stargazers_count) : product.stars || null,
    license: normalizeLicense(ghDetails?.meta?.license || product.license),
    quickCommands: ghDetails?.installCommands?.length ? ghDetails.installCommands : (product.quickCommands || []),
    ogImage,
    canEmbed,
    demoUrl,
    health,
    siteTitle,
    siteDesc,
    siteText,
    ghDesc: ghDetails?.meta?.description || '',
    ghLang: ghDetails?.meta?.language || '',
    readmeSnippet: (ghDetails?.readmeFull || '').slice(0, 4000)
  };
}

async function synthesizeWithQwen(apiKey, product, intel) {
  const systemPrompt = `你是一个专业、克制、客观的软件与 AI 产品技术分析师。
你的任务是根据给出的产品线索、官网抓包文本与 GitHub README 信息，判断产品所属种类和交付形态，并撰写清晰的产品介绍、真实坑点、同类对比与可落地的上手体验步骤。

必须严格返回合法 JSON 对象（不要输出任何多余解释或 Markdown 包裹），字段如下：
{
  "categoryType": "agent | devtools | productivity | models | vertical 中的一个",
  "deliveryForm": "github | web | desktop | api 中的一个",
  "deliveryLabel": "开源项目 | 在线网页 | 客户端/插件 | 模型/API 中与 deliveryForm 对应的一项",
  "pricingModel": "免费开源 | 免费可用 | Freemium | 一次性买断 | 商业付费 中的一个（严禁填 MIT/Apache 等协议名）",
  "frictionLevel": "免注册直玩 | 需注册登录 | 需自备 Key | 需本地安装 | 需桌面/插件 中的一个",
  "setupMinutes": 2,
  "targetAudience": "一句话说明最适合谁用（不超过28字）",
  "tagline": "精炼的一句话中文定位（不超过35字，不带感叹号）",
  "introduction": "2~3句客观、扎实的产品核心功能与实现机制介绍（严禁提及任何简报作者、来源平台排名或投票数）",
  "caveats": [
    "真实局限或避坑点（如硬件/系统限制、隐藏收费、仅厂商自测等，最多2条）"
  ],
  "alternatives": ["同类热门产品名称1", "同类热门产品名称2"],
  "scenarios": ["从 claude-code, teaching, local-privacy, instant-web, solo-builder 中选0~2个匹配的ID"],
  "experienceGuide": [
    "步骤1：具体的上手或试玩入口说明（如访问官网点哪里/或运行哪条安装命令）",
    "步骤2：核心功能体验建议或具体试玩任务"
  ],
  "defaultPort": 3000
}`;

  const userPrompt = `产品名称：${product.name}
原始简报定位：${product.tagline || '无'}
原始简报补充：${product.description || '无'}
直达官网：${intel.directUrl || '未知'}
在线 Demo：${intel.demoUrl || '无'}
GitHub 仓库：${intel.githubRepo || '无'} (语言: ${intel.ghLang || '未知'}, Star: ${intel.stars || '未知'}, 协议: ${intel.license || '未知'})
提取到的运行命令：${(intel.quickCommands || []).join(' ; ') || '无'}
官网抓取标题：${intel.siteTitle || '无'}
官网 Meta 描述：${intel.siteDesc || '无'}
官网正文摘要：
${intel.siteText || '（未抓到正文）'}

GitHub README 摘要：
${intel.readmeSnippet || '（无 README）'}`;

  const res = await fetch(QWEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      enable_thinking: false,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    }),
    signal: AbortSignal.timeout(25000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Qwen API HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  let rawContent = data?.choices?.[0]?.message?.content || '';
  rawContent = rawContent.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonStart = rawContent.indexOf('{');
  const jsonEnd = rawContent.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    rawContent = rawContent.slice(jsonStart, jsonEnd + 1);
  }
  const parsed = JSON.parse(rawContent);

  const validCategory = PRODUCT_TYPES[parsed.categoryType] ? parsed.categoryType : product.categoryType;
  const validDelivery = DELIVERY_LABELS[parsed.deliveryForm] ? parsed.deliveryForm : product.deliveryForm;
  const pricingModel = normalizePricing(parsed.pricingModel, {
    fullText: `${parsed.introduction || ''} ${product.description || ''}`,
    githubRepo: intel.githubRepo,
    license: intel.license
  });
  const frictionLevel = VALID_FRICTION.has(parsed.frictionLevel) ? parsed.frictionLevel : null;
  const scenarios = Array.isArray(parsed.scenarios)
    ? parsed.scenarios.filter(s => VALID_SCENARIOS.has(s)).slice(0, 3)
    : [];

  return {
    categoryType: validCategory,
    categoryLabel: PRODUCT_TYPES[validCategory].label,
    deliveryForm: validDelivery,
    deliveryLabel: DELIVERY_LABELS[validDelivery],
    pricingModel,
    frictionLevel,
    setupMinutes: Number.isFinite(parsed.setupMinutes) && parsed.setupMinutes > 0 && parsed.setupMinutes <= 60 ? Math.round(parsed.setupMinutes) : null,
    targetAudience: typeof parsed.targetAudience === 'string' ? parsed.targetAudience.trim().slice(0, 60) : null,
    tagline: parsed.tagline || product.tagline,
    introduction: parsed.introduction || product.description || product.tagline,
    caveats: Array.isArray(parsed.caveats) ? parsed.caveats.filter(c => typeof c === 'string' && c.trim()).slice(0, 3) : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.filter(a => typeof a === 'string' && a.trim()).slice(0, 4) : [],
    scenarios,
    experienceGuide: Array.isArray(parsed.experienceGuide) ? parsed.experienceGuide.slice(0, 4) : [],
    trustLevel: (intel.siteText || intel.readmeSnippet) ? '已查验官网' : '仅简报资料',
    defaultPort: Number.isInteger(parsed.defaultPort) ? parsed.defaultPort : 3000
  };
}

const CIRCUIT_BREAKER_THRESHOLD = 8;

/** Network failures, timeouts, rate limits and 5xx are the endpoint's fault, not the product's. */
export function isTransientError(error) {
  const msg = String(error?.message || error || '');
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' ||
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timed? ?out|aborted/i.test(msg) ||
    /HTTP (?:429|5\d\d)\b/.test(msg);
}

// Entries written before the trial-cost schema have no `frictionLevel` key at all.
export function isStaleEnrichment(entry) {
  return Boolean(entry) && !Object.hasOwn(entry, 'frictionLevel');
}

function keepRepoIfPlausible(repo, existing, p) {
  if (!repo) return null;
  const inheritedFromEnrichment = existing?.githubRepo && repo.toLowerCase() === existing.githubRepo.toLowerCase();
  if (!inheritedFromEnrichment) return repo; // came straight from the brief: trust it
  return repoMatchesProduct(repo, { productName: p.name, siteUrl: p.directUrl || existing.directUrl }) ? repo : null;
}

function hasTrialEntry(p) {
  return Boolean(p.githubRepo || p.directUrl || (p.url && !isDirectoryUrl(p.url)));
}

/**
 * Priority: (1) already-verified products on the old schema (cheap, high value),
 * (2) un-enriched products that have a link, newest first, (3) link-less products
 * (need a name search), newest first. Products that failed 3 times are skipped.
 */
export function selectBackfillBatch({ dates, getDay, store, failedMap = {}, seenKeys = new Set(), limit = 0 }) {
  const stale = [];
  const linked = [];
  const unlinked = [];
  for (const d of dates) {
    let day;
    try { day = getDay(d); } catch { continue; }
    for (const p of day?.products || []) {
      if (!p.key || seenKeys.has(p.key)) continue;
      seenKeys.add(p.key);
      if ((failedMap[p.key]?.attempts || 0) >= 3) continue;
      const existing = store[p.key];
      if (existing && !isStaleEnrichment(existing)) continue;
      if (existing) {
        stale.push({
          ...p,
          directUrl: p.directUrl || existing.directUrl,
          // Don't inherit a repo that an older run mis-matched from the landing page
          // (day data is already overlaid with the old enrichment, so check the merged value)
          githubRepo: keepRepoIfPlausible(p.githubRepo || existing.githubRepo, existing, p),
          __stale: true
        });
      } else if (hasTrialEntry(p)) {
        linked.push(p);
      } else {
        unlinked.push(p);
      }
    }
  }
  return [...stale, ...linked, ...unlinked].slice(0, limit);
}

async function main() {
  const opts = parseCliArgs();
  const apiKey = loadQwenApiKey();
  if (!apiKey && !opts.dryRun) {
    console.error('ERROR: QWEN_API_KEY not found in env.');
    process.exit(1);
  }

  const allDates = getAllDates();
  const targetDates = opts.date ? [opts.date] : allDates.slice(0, opts.days);
  console.log(`Enrich Agent starting -> model: ${QWEN_MODEL}, dates: ${targetDates.join(', ')}`);

  const store = loadJsonFile(ENRICHED_FILE, {});
  const failedMap = opts.retryFailed ? loadJsonFile(FAILED_QUEUE_FILE, {}) : {};
  const queue = [];
  const seenKeys = new Set();

  for (const d of targetDates) {
    const dayData = getDayData(d);
    for (const p of dayData.products) {
      if (seenKeys.has(p.key)) continue;
      seenKeys.add(p.key);
      if (!opts.force && store[p.key]) continue;
      queue.push(p);
    }
  }

  // Re-enqueue previously failed items (up to 3 attempts)
  if (opts.retryFailed) {
    for (const [key, entry] of Object.entries(failedMap)) {
      if (seenKeys.has(key) || store[key] || (entry.attempts || 0) >= 3) continue;
      if (entry.product) {
        seenKeys.add(key);
        queue.push(entry.product);
      }
    }
  }

  // Backfill: walk the whole archive and enrich a bounded batch per run, so history
  // converges to the current schema without one huge (slow, costly) run.
  if (opts.backfill > 0 && !opts.date) {
    const backfill = selectBackfillBatch({
      dates: allDates.filter(d => !targetDates.includes(d)),
      getDay: getDayData,
      store,
      failedMap: loadJsonFile(FAILED_QUEUE_FILE, {}),
      seenKeys,
      limit: opts.backfill
    });
    console.log(`Backfill: ${backfill.length} archived products queued (${backfill.filter(p => p.__stale).length} schema upgrades).`);
    queue.push(...backfill);
  }

  const tasks = opts.limit > 0 ? queue.slice(0, opts.limit) : queue;
  console.log(`Found ${queue.length} pending products; processing ${tasks.length} with concurrency=${opts.concurrency}...`);

  if (opts.dryRun) {
    for (const t of tasks) console.log(`  - ${t.date} ${t.__stale ? '[upgrade] ' : ''}${t.name} :: ${t.githubRepo || t.directUrl || t.url || '(no link)'}`);
    console.log('Dry run: no network calls made.');
    return;
  }

  if (tasks.length === 0) {
    console.log('All target products are already enriched.');
    return;
  }

  let cursor = 0;
  let completed = 0;
  let failed = 0;
  let consecutiveTransient = 0;
  let circuitOpen = false;

  async function worker(workerId) {
    while (cursor < tasks.length && !circuitOpen) {
      const idx = cursor++;
      const product = tasks[idx];
      try {
        const intel = await investigateProduct(product);
        const synthesized = await synthesizeWithQwen(apiKey, product, intel);
        store[product.key] = {
          key: product.key,
          name: product.name,
          date: store[product.key]?.date || product.date,
          updatedAt: new Date().toISOString(),
          ...synthesized,
          directUrl: intel.directUrl,
          githubRepo: intel.githubRepo,
          stars: intel.stars,
          license: intel.license,
          ogImage: intel.ogImage,
          canEmbed: intel.canEmbed,
          demoUrl: intel.demoUrl,
          health: intel.health,
          quickCommands: intel.quickCommands
        };
        delete failedMap[product.key];
        completed++;
        consecutiveTransient = 0;
        console.log(`[${completed + failed}/${tasks.length}] (w${workerId}) OK: ${product.name} -> ${synthesized.categoryLabel} | ${synthesized.deliveryLabel} | ${intel.githubRepo || intel.directUrl}`);
        if (completed % 5 === 0) saveJsonFile(ENRICHED_FILE, store);
      } catch (e) {
        failed++;
        const transient = isTransientError(e);
        if (transient && ++consecutiveTransient >= CIRCUIT_BREAKER_THRESHOLD && !circuitOpen) {
          circuitOpen = true;
          console.warn(`Circuit open: ${consecutiveTransient} consecutive network/5xx/429 errors — the model endpoint looks down, stopping this run.`);
        }
        failedMap[product.key] = {
          // Outages must not burn the 3-attempt budget, or good products get skipped forever
          attempts: (failedMap[product.key]?.attempts || 0) + (transient ? 0 : 1),
          transient,
          lastError: e.message,
          updatedAt: new Date().toISOString(),
          product: {
            key: product.key,
            name: product.name,
            date: product.date,
            url: product.url,
            directUrl: product.directUrl,
            githubRepo: product.githubRepo,
            tagline: product.tagline,
            description: product.description,
            categoryType: product.categoryType,
            deliveryForm: product.deliveryForm
          }
        };
        console.warn(`[${completed + failed}/${tasks.length}] (w${workerId}) FAIL: ${product.name} -> ${e.message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency, tasks.length) }, (_, i) => worker(i + 1))
  );

  saveJsonFile(ENRICHED_FILE, store);
  saveJsonFile(FAILED_QUEUE_FILE, failedMap);
  const skipped = tasks.length - completed - failed;
  console.log(`Enrich Agent finished. Success: ${completed}, Failed: ${failed}${skipped > 0 ? `, Skipped (circuit open): ${skipped}` : ''}. Saved to ${ENRICHED_FILE}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
