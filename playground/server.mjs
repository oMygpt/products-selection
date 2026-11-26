import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PRODUCT_TYPES,
  DELIVERY_LABELS,
  normalizeProductKey,
  cleanRepoSlug,
  normalizeLicense,
  normalizePricing,
  extractLinksAndMeta,
  classifyProductType,
  inferScenarios,
  extractQuickCommands,
  parseListBriefMarkdown,
  parseDetailedBriefMarkdown,
  parseAnyBriefMarkdown
} from './lib/parser.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MUSE_DIR = path.join(ROOT_DIR, '.muse-repo');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'user-state.json');
const INSPECT_CACHE_FILE = path.join(__dirname, '.inspect-cache.json');
const ENRICHED_FILE = path.join(__dirname, 'enriched-products.json');

if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ items: {} }, null, 2), 'utf-8');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { items: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

let enrichedCache = {};
let enrichedMtime = 0;
function loadEnrichedMap() {
  try {
    if (!fs.existsSync(ENRICHED_FILE)) return {};
    const stat = fs.statSync(ENRICHED_FILE);
    if (stat.mtimeMs !== enrichedMtime) {
      enrichedCache = JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf-8')) || {};
      enrichedMtime = stat.mtimeMs;
    }
    return enrichedCache;
  } catch {
    return {};
  }
}

const urlResolveCache = new Map();
function loadInspectCache() {
  try {
    if (fs.existsSync(INSPECT_CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(INSPECT_CACHE_FILE, 'utf-8'));
      for (const [k, v] of Object.entries(raw)) {
        urlResolveCache.set(k, v);
      }
    }
  } catch {
    // ignore
  }
}
function persistInspectCache() {
  try {
    const obj = {};
    const entries = Array.from(urlResolveCache.entries()).slice(-400);
    for (const [k, v] of entries) obj[k] = v;
    fs.writeFileSync(INSPECT_CACHE_FILE, JSON.stringify(obj), 'utf-8');
  } catch {
    // ignore
  }
}
loadInspectCache();

// Parser, normalizer & command extractor are imported from ./lib/parser.mjs

// Recursively scan upstream briefing repo (.muse-repo) for dated .md files
function walkMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
      fileList.push(full);
    }
  }
  return fileList;
}

function getDateFilesMap() {
  const map = new Map(); // date -> [{ label, path }]
  const seenBasenames = new Set();

  const upstreamFiles = walkMarkdownFiles(MUSE_DIR);
  for (const fullPath of upstreamFiles) {
    const base = path.basename(fullPath);
    const m = base.match(/(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    const date = m[1];
    seenBasenames.add(base);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push({
      label: path.relative(MUSE_DIR, fullPath),
      path: fullPath
    });
  }

  // Also check top-level ROOT_DIR for any local un-synced 今日产品简报-*.md
  if (fs.existsSync(ROOT_DIR)) {
    for (const entry of fs.readdirSync(ROOT_DIR)) {
      const m = entry.match(/^今日产品简报-(\d{4}-\d{2}-\d{2})\.md$/);
      if (m && !seenBasenames.has(entry)) {
        const date = m[1];
        if (!map.has(date)) map.set(date, []);
        map.get(date).push({
          label: entry,
          path: path.join(ROOT_DIR, entry)
        });
      }
    }
  }

  return map;
}

function getAllDates() {
  const map = getDateFilesMap();
  return Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
}

function getDayDataFromBriefs(date, briefs) {
  const allSignals = [];
  const rawBriefs = [];
  let leadIntro = '';
  const mergedMap = new Map();

  for (const b of briefs) {
    const content = b.content;
    rawBriefs.push({ name: b.name, content });
    const parsed = parseAnyBriefMarkdown(content, date);

    if (parsed.intro && (!leadIntro || parsed.intro.length < 220)) {
      leadIntro = parsed.intro;
    }
    if (parsed.signals?.length) {
      allSignals.push(...parsed.signals);
    }

    for (const item of parsed.items) {
      let matchedKey = mergedMap.has(item.key) ? item.key : null;
      if (!matchedKey) {
        for (const existingKey of mergedMap.keys()) {
          if (
            (existingKey.length >= 4 && item.key.startsWith(existingKey)) ||
            (item.key.length >= 4 && existingKey.startsWith(item.key))
          ) {
            matchedKey = existingKey;
            break;
          }
        }
      }

      if (matchedKey) {
        const existing = mergedMap.get(matchedKey);
        existing.sourceCount = (existing.sourceCount || 1) + 1;
        if (item.description && (!existing.description || !existing.description.includes(item.description.slice(0, 18)))) {
          existing.description = existing.description
            ? `${existing.description}\n\n${item.description}`
            : item.description;
        }
        if (item.tagline && (!existing.tagline || item.tagline.length < existing.tagline.length)) {
          existing.tagline = existing.tagline || item.tagline;
        }
        existing.githubRepo = existing.githubRepo || item.githubRepo;
        existing.directUrl = existing.directUrl || item.directUrl;
        if (!existing.url && item.url) existing.url = item.url;
        existing.stars = existing.stars || item.stars;
        existing.license = existing.license || item.license;
        existing.rawMeta = existing.rawMeta || item.rawMeta;
        existing.demoUrl = existing.demoUrl || item.demoUrl;
        Object.assign(existing, classifyProductType(existing));
      } else {
        mergedMap.set(item.key, { ...item, sourceCount: 1 });
      }
    }
  }

  const state = loadState();
  const enrichedMap = loadEnrichedMap();

  const products = Array.from(mergedMap.values()).map(p => {
    const userEntry = state.items[p.key] || null;
    const enriched = enrichedMap[p.key] || null;

    const merged = {
      ...p,
      trustLevel: enriched ? '已查验官网' : '仅简报资料',
      userStatus: userEntry?.status || null,
      userRating: userEntry?.rating || null,
      userNote: userEntry?.note || '',
      userUpdatedAt: userEntry?.updatedAt || null
    };

    if (enriched) {
      merged.enriched = true;
      if (enriched.categoryType && PRODUCT_TYPES[enriched.categoryType]) {
        merged.categoryType = enriched.categoryType;
        merged.categoryLabel = PRODUCT_TYPES[enriched.categoryType].label;
      }
      if (enriched.deliveryForm && DELIVERY_LABELS[enriched.deliveryForm]) {
        merged.deliveryForm = enriched.deliveryForm;
        merged.deliveryLabel = enriched.deliveryLabel || DELIVERY_LABELS[enriched.deliveryForm];
      }
      if (enriched.pricingModel) {
        merged.pricingModel = normalizePricing(enriched.pricingModel, {
          fullText: `${merged.tagline || ''} ${enriched.introduction || ''}`,
          githubRepo: enriched.githubRepo || merged.githubRepo,
          license: normalizeLicense(enriched.license || merged.license)
        });
      }
      if (enriched.tagline) merged.tagline = enriched.tagline;
      if (enriched.introduction) merged.introduction = enriched.introduction;
      if (Array.isArray(enriched.experienceGuide) && enriched.experienceGuide.length > 0) {
        merged.experienceGuide = enriched.experienceGuide;
      }
      if (Array.isArray(enriched.quickCommands) && enriched.quickCommands.length > 0) {
        const cleanCmds = enriched.quickCommands.filter(c => typeof c === 'string' && c.trim() && !c.trim().endsWith('\\'));
        if (cleanCmds.length > 0) {
          merged.quickCommands = cleanCmds;
          merged.quickCommand = cleanCmds[0];
        }
      }
      if (enriched.defaultPort) merged.defaultPort = enriched.defaultPort;
      if (enriched.directUrl) {
        merged.directUrl = enriched.directUrl;
        merged.url = enriched.directUrl;
      }
      if (enriched.githubRepo) merged.githubRepo = enriched.githubRepo;
      if (enriched.stars) merged.stars = enriched.stars;
      const cleanLic = normalizeLicense(enriched.license || merged.license);
      merged.license = cleanLic;
      if (enriched.ogImage) merged.ogImage = enriched.ogImage;
      if (typeof enriched.canEmbed === 'boolean') merged.canEmbed = enriched.canEmbed;
      if (enriched.demoUrl) merged.demoUrl = enriched.demoUrl;
      if (enriched.frictionLevel) merged.frictionLevel = enriched.frictionLevel;
      if (enriched.setupMinutes) merged.setupMinutes = enriched.setupMinutes;
      if (Array.isArray(enriched.caveats) && enriched.caveats.length > 0) merged.caveats = enriched.caveats;
      if (enriched.targetAudience) merged.targetAudience = enriched.targetAudience;
      if (Array.isArray(enriched.alternatives) && enriched.alternatives.length > 0) merged.alternatives = enriched.alternatives;
      if (enriched.trustLevel) merged.trustLevel = enriched.trustLevel;
      if (enriched.health) merged.health = enriched.health;
      if (Array.isArray(enriched.scenarios) && enriched.scenarios.length > 0) merged.scenarios = enriched.scenarios;
    } else {
      merged.license = normalizeLicense(merged.license);
      merged.pricingModel = normalizePricing(merged.pricingModel, {
        fullText: `${merged.tagline || ''} ${merged.description || ''}`,
        githubRepo: merged.githubRepo,
        license: merged.license
      });
    }

    if (!Array.isArray(merged.scenarios) || merged.scenarios.length === 0) {
      merged.scenarios = inferScenarios(merged);
    }

    return merged;
  });

  // Sort: Enriched/Multi-source/Open-Source/Direct URL first
  products.sort((a, b) => {
    const score = (x) =>
      (x.enriched ? 400 : 0) +
      ((x.sourceCount || 1) > 1 ? 150 : 0) +
      (x.githubRepo ? 200 : 0) +
      (x.directUrl ? 100 : 0) +
      (x.description ? Math.min(80, x.description.length / 10) : 0);
    return score(b) - score(a);
  });

  return {
    date,
    briefCount: briefs.length,
    intro: leadIntro,
    signals: allSignals,
    products,
    rawBriefs
  };
}

// Source-agnostic aggregation for a single date + overlay enriched-products.json
function getDayData(date) {
  const dateMap = getDateFilesMap();
  const files = dateMap.get(date) || [];
  const briefs = files.map(f => ({
    name: f.label,
    content: fs.readFileSync(f.path, 'utf-8')
  }));
  return getDayDataFromBriefs(date, briefs);
}

async function fetchGitHubDetails(repo, userToken = '') {
  const safeRepo = cleanRepoSlug(repo);
  if (!safeRepo) return null;

  let repoMeta = null;
  let readmeText = null;
  let readmeDownloadUrl = null;
  let readmeHtmlUrl = null;

  const tokenToUse = userToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  if (tokenToUse) {
    const authHeaders = {
      'User-Agent': 'Daily-Product-Workbench',
      'Authorization': `Bearer ${tokenToUse}`,
      'Accept': 'application/vnd.github+json'
    };
    try {
      const [metaRes, readmeRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${safeRepo}`, { headers: authHeaders, signal: AbortSignal.timeout(6000) }),
        fetch(`https://api.github.com/repos/${safeRepo}/readme`, { headers: authHeaders, signal: AbortSignal.timeout(6000) })
      ]);
      if (metaRes.ok) {
        const d = await metaRes.json();
        repoMeta = {
          full_name: d.full_name,
          description: d.description,
          stargazers_count: d.stargazers_count,
          forks_count: d.forks_count,
          language: d.language,
          license: d.license?.spdx_id || null,
          homepage: d.homepage,
          default_branch: d.default_branch,
          topics: d.topics || [],
          html_url: d.html_url
        };
      }
      if (readmeRes.ok) {
        const r = await readmeRes.json();
        if (r?.content && r.encoding === 'base64') {
          readmeText = Buffer.from(r.content, 'base64').toString('utf-8');
        }
        readmeDownloadUrl = r?.download_url || null;
        readmeHtmlUrl = r?.html_url || null;
      }
    } catch {
      // fall through
    }
  }

  if (!repoMeta) {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'api',
          `repos/${safeRepo}`,
          '--jq',
          '{full_name, description, stargazers_count, forks_count, language, license: .license.spdx_id, homepage, default_branch, topics, html_url}'
        ],
        { timeout: 6500, maxBuffer: 1024 * 1024 }
      );
      repoMeta = JSON.parse(stdout);
    } catch {
      try {
        const res = await fetch(`https://api.github.com/repos/${safeRepo}`, {
          headers: { 'User-Agent': 'Daily-Product-Workbench' },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const d = await res.json();
          repoMeta = {
            full_name: d.full_name,
            description: d.description,
            stargazers_count: d.stargazers_count,
            forks_count: d.forks_count,
            language: d.language,
            license: d.license?.spdx_id || null,
            homepage: d.homepage,
            default_branch: d.default_branch,
            topics: d.topics || [],
            html_url: d.html_url
          };
        }
      } catch {
        // ignore
      }
    }
  }

  if (!readmeText) {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'api',
          `repos/${safeRepo}/readme`,
          '--jq',
          '{name, path, content, encoding, download_url, html_url}'
        ],
        { timeout: 6500, maxBuffer: 4 * 1024 * 1024 }
      );
      const readmeJson = JSON.parse(stdout);
      if (readmeJson?.content && readmeJson.encoding === 'base64') {
        readmeText = Buffer.from(readmeJson.content, 'base64').toString('utf-8');
      }
      readmeDownloadUrl = readmeJson?.download_url || null;
      readmeHtmlUrl = readmeJson?.html_url || null;
    } catch {
      const branches = [repoMeta?.default_branch, 'HEAD', 'main', 'master'].filter(Boolean);
      for (const br of branches) {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${safeRepo}/${br}/README.md`, {
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) {
            readmeText = await res.text();
            readmeDownloadUrl = `https://raw.githubusercontent.com/${safeRepo}/${br}/README.md`;
            break;
          }
        } catch {
          // next
        }
      }
    }
  }

  if (!repoMeta && !readmeText) return null;

  const branch = repoMeta?.default_branch || 'main';
  return {
    repo: safeRepo,
    meta: repoMeta,
    defaultBranch: branch,
    rawBaseUrl: `https://raw.githubusercontent.com/${safeRepo}/${branch}/`,
    readmeDownloadUrl,
    readmeHtmlUrl: readmeHtmlUrl || `https://github.com/${safeRepo}#readme`,
    readmeFull: readmeText || '',
    installCommands: readmeText ? extractQuickCommands(readmeText, safeRepo) : []
  };
}

function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html = '') {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function checkCanEmbed(headers) {
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;

  const csp = (headers.get('content-security-policy') || '').toLowerCase();
  if (csp.includes('frame-ancestors')) {
    const match = csp.match(/frame-ancestors\s+([^;]+)/);
    if (match) {
      const val = match[1].trim();
      if (val === "'none'" || val === "'self'" || (!val.includes('*') && !val.includes('127.0.0.1') && !val.includes('localhost'))) {
        return false;
      }
    }
  }
  return true;
}

function extractReadableFromHtml(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const blocks = [];
  const seen = new Set();
  const tagRegex = /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = tagRegex.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]);
    if (!text || text.length < (tag.startsWith('h') ? 3 : 24)) continue;
    if (/cookie|privacy policy|terms of service|all rights reserved|sign up|log in/i.test(text) && text.length < 80) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    blocks.push({ tag, text });
    if (blocks.length >= 24) break;
  }
  return blocks;
}

function extractMetaTag(html, attrName, attrVal) {
  const re1 = new RegExp(`<meta[^>]+${attrName}=["']${attrVal}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${attrVal}["']`, 'i');
  return decodeHtmlEntities(html.match(re1)?.[1] || html.match(re2)?.[1] || '') || null;
}

function findGithubRepoInHtml(html) {
  const matches = [...html.matchAll(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi)];
  for (const m of matches) {
    const candidate = cleanRepoSlug(m[1]);
    if (candidate) return candidate;
  }
  return null;
}

async function fetchPageInfo(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(6500)
  });

  const canEmbed = checkCanEmbed(res.headers);
  const contentType = res.headers.get('content-type') || '';
  const finalUrl = res.url || url;

  if (!res.ok || !contentType.includes('text/html')) {
    return { ok: res.ok, status: res.status, finalUrl, canEmbed, html: '' };
  }
  const html = await res.text();
  return { ok: true, status: res.status, finalUrl, canEmbed, html };
}

async function resolveProductDetails(targetUrl, githubRepo, productName = '', forceRefresh = false, userToken = '') {
  const cacheKey = `${targetUrl || ''}|${githubRepo || ''}|${productName || ''}`;
  if (!forceRefresh && urlResolveCache.has(cacheKey)) {
    return urlResolveCache.get(cacheKey);
  }

  let discoveredRepo = cleanRepoSlug(githubRepo);
  let resolvedWebsite = null;
  let isWrapperUrl = false;
  let canEmbed = true;
  let ogTitle = null;
  let ogDescription = null;
  let ogImage = null;
  let readableBlocks = [];

  if (targetUrl && targetUrl.includes('betalist.com/startups/')) {
    isWrapperUrl = true;
    try {
      const page = await fetchPageInfo(targetUrl);
      if (page.ok && page.html) {
        const visitMatch =
          page.html.match(/href=["'](https?:\/\/[^"']+\?utm_source=betalist[^"']*)["']/i) ||
          page.html.match(/href=["'](\/startups\/[^"']+\/visit)["']/i);
        if (visitMatch) {
          if (visitMatch[1].startsWith('/')) {
            const visitPage = await fetchPageInfo(`https://betalist.com${visitMatch[1]}`);
            if (visitPage.finalUrl && !visitPage.finalUrl.includes('betalist.com')) {
              resolvedWebsite = visitPage.finalUrl.replace(/\?utm_source=betalist.*$/, '');
              isWrapperUrl = false;
            }
          } else {
            resolvedWebsite = visitMatch[1].replace(/\?utm_source=betalist.*$/, '');
            isWrapperUrl = false;
          }
        }
        ogTitle = extractMetaTag(page.html, 'property', 'og:title');
        ogDescription = extractMetaTag(page.html, 'property', 'og:description');
        ogImage = extractMetaTag(page.html, 'property', 'og:image');
      }
    } catch {
      // ignore
    }
  } else if (targetUrl && targetUrl.includes('producthunt.com/')) {
    isWrapperUrl = true;
  }

  let githubDetails = null;
  if (discoveredRepo) {
    githubDetails = await fetchGitHubDetails(discoveredRepo, userToken);
    if (githubDetails?.meta?.homepage && !resolvedWebsite) {
      const hp = githubDetails.meta.homepage.trim();
      if (/^https?:\/\//i.test(hp) && !hp.includes('github.com/')) {
        resolvedWebsite = hp;
      }
    }
  }

  const webInspectUrl =
    resolvedWebsite ||
    (targetUrl && targetUrl.startsWith('http') && !targetUrl.includes('github.com/') && !isWrapperUrl ? targetUrl : null);

  if (webInspectUrl) {
    try {
      const page = await fetchPageInfo(webInspectUrl);
      canEmbed = page.canEmbed;
      if (page.finalUrl && !page.finalUrl.includes('betalist.com') && !page.finalUrl.includes('producthunt.com')) {
        resolvedWebsite = page.finalUrl;
      }
      if (page.ok && page.html) {
        ogTitle = extractMetaTag(page.html, 'property', 'og:title') || stripTags(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || ogTitle;
        ogDescription = extractMetaTag(page.html, 'property', 'og:description') || extractMetaTag(page.html, 'name', 'description') || ogDescription;
        let rawOgImg = extractMetaTag(page.html, 'property', 'og:image');
        if (rawOgImg && !rawOgImg.startsWith('http')) {
          try {
            rawOgImg = new URL(rawOgImg, page.finalUrl).toString();
          } catch {
            rawOgImg = null;
          }
        }
        ogImage = rawOgImg || ogImage;
        readableBlocks = extractReadableFromHtml(page.html);

        if (!discoveredRepo) {
          const foundRepo = findGithubRepoInHtml(page.html);
          if (foundRepo) {
            discoveredRepo = foundRepo;
            githubDetails = await fetchGitHubDetails(discoveredRepo, userToken);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const result = {
    targetUrl,
    resolvedWebsite: resolvedWebsite || (!isWrapperUrl && targetUrl ? targetUrl : null),
    isWrapperUrl: isWrapperUrl && !resolvedWebsite,
    canEmbed,
    ogTitle,
    ogDescription,
    ogImage,
    readableBlocks,
    github: githubDetails,
    installCommands: githubDetails?.installCommands || []
  };

  urlResolveCache.set(cacheKey, result);
  persistInspectCache();
  return result;
}

function isLocalOrPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/days' && req.method === 'GET') {
    const dateMap = getDateFilesMap();
    const dates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
    const state = loadState();
    const daysSummary = dates.map(d => ({
      date: d,
      briefCount: (dateMap.get(d) || []).length
    }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      days: daysSummary,
      state,
      localCapabilities: {
        isLocalServer: true,
        isMac: process.platform === 'darwin'
      }
    }));
    return;
  }

  if (pathname.startsWith('/api/day/') && req.method === 'GET') {
    const date = pathname.replace('/api/day/', '');
    const data = getDayData(date);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return;
  }

  if (pathname === '/api/explore' && req.method === 'GET') {
    const type = urlObj.searchParams.get('type') || 'all';
    const form = urlObj.searchParams.get('form') || 'all';
    const status = urlObj.searchParams.get('status') || 'all';
    const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
    const limit = parseInt(urlObj.searchParams.get('limit') || '250', 10);

    const dates = getAllDates();
    const matched = [];
    for (const d of dates) {
      const dayData = getDayData(d);
      for (const p of dayData.products) {
        if (type !== 'all' && p.categoryType !== type) continue;
        if (form !== 'all' && p.deliveryForm !== form) continue;
        if (status === 'stack' && p.userStatus !== 'stack') continue;
        if (status === 'tried' && p.userStatus !== 'tried' && p.userStatus !== 'stack') continue;

        if (q) {
          const hay = `${p.name} ${p.tagline || ''} ${p.introduction || ''} ${p.description || ''} ${p.categoryLabel || ''} ${p.githubRepo || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }

        matched.push(p);
        if (matched.length >= limit) break;
      }
      if (matched.length >= limit) break;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: matched.length, items: matched }));
    return;
  }

  if (pathname === '/api/inspect' && req.method === 'GET') {
    const targetUrl = urlObj.searchParams.get('url') || '';
    const githubRepo = urlObj.searchParams.get('repo') || '';
    const productName = urlObj.searchParams.get('name') || '';
    const forceRefresh = urlObj.searchParams.get('refresh') === '1';
    const userToken = String(req.headers['x-github-token'] || '').trim();
    const info = await resolveProductDetails(targetUrl, githubRepo, productName, forceRefresh, userToken);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(info));
    return;
  }

  if (pathname === '/api/proxy' && (req.method === 'GET' || req.method === 'HEAD')) {
    const target = urlObj.searchParams.get('url') || '';
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid URL');
      return;
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isLocalOrPrivateHost(parsed.hostname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden URL');
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(9000)
      });

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      if (contentType.includes('text/html')) {
        let html = await upstream.text();
        const finalUrlObj = new URL(upstream.url || parsed.toString());
        const baseTag = `<base href="${finalUrlObj.origin}/" target="_blank">`;
        html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
        } else {
          html = `${baseTag}\n${html}`;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, { 'Content-Type': contentType });
        res.end(buf);
      }
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#333;"><h3>网页代理加载失败</h3><p>${String(e)}</p><p><a href="${parsed.toString()}" target="_blank">请点击此处在新标签页打开官网 ↗</a></p></body></html>`);
    }
    return;
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const state = loadState();
        if (payload.key) {
          const prev = state.items[payload.key] || {};
          state.items[payload.key] = {
            status: payload.status !== undefined ? payload.status : prev.status,
            rating: payload.rating !== undefined ? payload.rating : (prev.rating || null),
            note: payload.note !== undefined ? payload.note : (prev.note || ''),
            name: payload.name || prev.name || payload.key,
            date: payload.date || prev.date || '',
            url: payload.url || prev.url || '',
            updatedAt: new Date().toISOString()
          };
          saveState(state);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, state }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  if (pathname === '/api/local-terminal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        if (process.platform !== 'darwin') {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '仅支持 macOS 本地终端打开' }));
          return;
        }
        const payload = JSON.parse(body || '{}');
        const safeRepo = cleanRepoSlug(payload.repo || '');
        if (!safeRepo) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '无效的 GitHub 仓库标识' }));
          return;
        }
        const sandboxRoot = '/tmp/dpb-sandbox';
        fs.mkdirSync(sandboxRoot, { recursive: true });
        const repoFolder = safeRepo.split('/')[1].replace(/[^A-Za-z0-9_.-]/g, '_');
        const scriptPath = path.join(sandboxRoot, `try-${repoFolder}.command`);
        const firstCmd = String(payload.command || '').replace(/[\r\n]/g, ' ').trim();
        const scriptContent = [
          '#!/usr/bin/env bash',
          `cd "${sandboxRoot}"`,
          `if [ ! -d "${repoFolder}" ]; then`,
          `  echo "Cloning ${safeRepo} into ${sandboxRoot}/${repoFolder} ..."`,
          `  git clone "https://github.com/${safeRepo}.git" "${repoFolder}"`,
          'fi',
          `cd "${repoFolder}"`,
          'echo ""',
          `echo "Ready in $(pwd)"`,
          firstCmd ? `echo "Suggested command: ${firstCmd.replace(/"/g, '\\"')}"` : '',
          'ls -la',
          'exec "$SHELL" -l'
        ].filter(Boolean).join('\n');

        fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
        await execFileAsync('open', ['-a', 'Terminal', scriptPath]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, dir: path.join(sandboxRoot, repoFolder) }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    exec('git pull --ff-only', { cwd: MUSE_DIR }, (err, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: !err,
        output: stdout || stderr || '已同步最新简报'
      }));
    });
    return;
  }

  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xml': 'application/rss+xml; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

export {
  getAllDates,
  getDateFilesMap,
  getDayData,
  getDayDataFromBriefs,
  fetchGitHubDetails,
  fetchPageInfo,
  extractReadableFromHtml,
  findGithubRepoInHtml,
  cleanRepoSlug,
  normalizeLicense,
  normalizePricing,
  extractQuickCommands,
  extractMetaTag,
  stripTags,
  PRODUCT_TYPES,
  DELIVERY_LABELS,
  ROOT_DIR,
  MUSE_DIR,
  PUBLIC_DIR,
  ENRICHED_FILE
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) {
  const PORT = process.env.PORT || 4321;
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Daily Product Playground running at http://127.0.0.1:${PORT}`);
  });
}
