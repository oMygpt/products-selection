import fs from 'node:fs';
import path from 'node:path';
import { getDateFilesMap, getDayData, getDayDataFromBriefs, PUBLIC_DIR } from './server.mjs';
import { computeTrialCost, isDemoUrl } from './public/trial-cost.js';

const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const DAY_DIR = path.join(DATA_DIR, 'day');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PRODUCTS_DIR = path.join(DATA_DIR, 'products');
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://picks.chunlin.ch';

fs.mkdirSync(DAY_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

function parseStarNum(stars) {
  if (!stars) return 0;
  const s = String(stars).trim().toLowerCase().replace(/,/g, '');
  if (s.endsWith('k')) return Math.round(parseFloat(s) * 1000) || 0;
  return parseInt(s, 10) || 0;
}

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getIsoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Drop scraped "demo" links that are really docs/landing pages, then attach the trial cost.
function withTrialCost(p) {
  const product = { ...p };
  if (product.demoUrl && !isDemoUrl(product.demoUrl)) product.demoUrl = null;
  product.trialCost = computeTrialCost(product);
  return product;
}

function stripUserFields(p) {
  const { userStatus, userRating, userNote, userUpdatedAt, ...rest } = p;
  return rest;
}

// Collect dates from .muse-repo when present, otherwise fallback to existing raw/day JSONs
const dateMap = getDateFilesMap();
let dates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
const usingMuseRepo = dates.length > 0;

if (!usingMuseRepo) {
  // raw/ is the versioned snapshot; day/ may not exist (derived files are not committed)
  const listDates = dir => (fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.replace('.json', ''))
    : []);
  const existingDays = [...new Set([...listDates(RAW_DIR), ...listDates(DAY_DIR)])];
  dates = existingDays.sort((a, b) => b.localeCompare(a));
  console.log(`Upstream .muse-repo not found; rebuilding ${dates.length} days from committed rawBriefs...`);
}

const daysSummary = [];
const masterMap = new Map();
const weeklyBuckets = new Map();
const emptyBriefDays = [];
const lowRecentDays = [];

for (let idx = 0; idx < dates.length; idx++) {
  const d = dates[idx];
  let dayData;

  if (usingMuseRepo) {
    dayData = getDayData(d);
  } else {
    const rawFile = path.join(RAW_DIR, `${d}.json`);
    const dayFile = path.join(DAY_DIR, `${d}.json`);
    let briefs = [];
    if (fs.existsSync(rawFile)) {
      const parsedRaw = JSON.parse(fs.readFileSync(rawFile, 'utf-8'));
      briefs = parsedRaw.rawBriefs || [];
    } else if (fs.existsSync(dayFile)) {
      const parsedDay = JSON.parse(fs.readFileSync(dayFile, 'utf-8'));
      briefs = parsedDay.rawBriefs || [];
    }
    dayData = getDayDataFromBriefs(d, briefs);
  }

  // CI sanity gate checks
  if (dayData.briefCount > 0 && dayData.products.length === 0) {
    emptyBriefDays.push(d);
  }
  if (idx < 3 && dayData.briefCount > 0 && dayData.products.length < 3) {
    lowRecentDays.push(`${d} (${dayData.products.length} items from ${dayData.briefCount} briefs)`);
  }

  const cleanProducts = dayData.products.map(stripUserFields).map(withTrialCost);

  // Persist raw briefs on-demand file separately (reduces day/*.json payload)
  fs.writeFileSync(
    path.join(RAW_DIR, `${d}.json`),
    JSON.stringify({ date: d, rawBriefs: dayData.rawBriefs || [] }),
    'utf-8'
  );

  // Persist day JSON without rawBriefs bloat
  fs.writeFileSync(
    path.join(DAY_DIR, `${d}.json`),
    JSON.stringify({
      date: d,
      briefCount: dayData.briefCount,
      intro: dayData.intro,
      signals: dayData.signals,
      products: cleanProducts
    }),
    'utf-8'
  );

  daysSummary.push({
    date: d,
    briefCount: dayData.briefCount,
    productCount: cleanProducts.length
  });

  // Aggregate into product-centric master table & weekly picks
  const weekKey = getIsoWeekKey(d);
  if (!weeklyBuckets.has(weekKey)) weeklyBuckets.set(weekKey, []);

  for (const p of cleanProducts) {
    const existing = masterMap.get(p.key);
    if (existing) {
      if (!existing.appearances.includes(d)) existing.appearances.push(d);
      existing.appearanceCount = existing.appearances.length;
      existing.sourceCount = Math.max(existing.sourceCount || 1, p.sourceCount || 1);
      if (p.enriched && !existing.enriched) {
        Object.assign(existing, p, {
          appearances: existing.appearances,
          appearanceCount: existing.appearanceCount,
          firstSeen: existing.firstSeen < d ? existing.firstSeen : d,
          lastSeen: existing.lastSeen > d ? existing.lastSeen : d
        });
      } else {
        existing.firstSeen = existing.firstSeen < d ? existing.firstSeen : d;
        existing.lastSeen = existing.lastSeen > d ? existing.lastSeen : d;
      }
    } else {
      masterMap.set(p.key, {
        ...p,
        firstSeen: d,
        lastSeen: d,
        appearances: [d],
        appearanceCount: 1
      });
    }
    weeklyBuckets.get(weekKey).push(p);
  }
}

// Fail loudly if parser regressed on any day with briefs
if (emptyBriefDays.length > 0) {
  console.error(`ERROR: Parser produced 0 products for days with raw briefs: ${emptyBriefDays.join(', ')}`);
  process.exit(1);
}
if (lowRecentDays.length > 0) {
  console.error(`ERROR: Recent days parsed fewer than 3 products: ${lowRecentDays.join(', ')}`);
  process.exit(1);
}

// Write days.json
fs.writeFileSync(
  path.join(DATA_DIR, 'days.json'),
  JSON.stringify({
    days: daysSummary,
    totalProducts: masterMap.size,
    generatedAt: new Date().toISOString()
  }),
  'utf-8'
);

// Write per-product detail JSONs + lean explore.json index
const leanIndex = [];
const writtenProductFiles = new Set();
for (const p of masterMap.values()) {
  const safeKey = p.key.replace(/[^a-z0-9\u4e00-\u9fa5_-]/gi, '');
  if (!safeKey) continue;
  writtenProductFiles.add(`${safeKey}.json`);
  Object.assign(p, withTrialCost(p));
  fs.writeFileSync(
    path.join(PRODUCTS_DIR, `${safeKey}.json`),
    JSON.stringify(p),
    'utf-8'
  );

  leanIndex.push({
    key: p.key,
    date: p.lastSeen || p.date,
    firstSeen: p.firstSeen,
    appearanceCount: p.appearanceCount,
    sourceCount: p.sourceCount || 1,
    name: p.name,
    tagline: p.tagline || '',
    url: p.url || '',
    directUrl: p.directUrl || '',
    demoUrl: p.demoUrl || null,
    githubRepo: p.githubRepo || null,
    stars: p.stars || null,
    starNum: parseStarNum(p.stars),
    license: p.license || null,
    categoryType: p.categoryType,
    categoryLabel: p.categoryLabel,
    deliveryForm: p.deliveryForm,
    deliveryLabel: p.deliveryLabel,
    pricingModel: p.pricingModel || null,
    frictionLevel: p.frictionLevel || null,
    setupMinutes: p.setupMinutes || null,
    trustLevel: p.trustLevel || (p.enriched ? '已查验官网' : '仅简报资料'),
    ogImage: p.ogImage || null,
    canEmbed: typeof p.canEmbed === 'boolean' ? p.canEmbed : null,
    health: p.health ? { activityTier: p.health.activityTier, pushedAt: p.health.pushedAt } : null,
    scenarios: p.scenarios || [],
    trialCost: p.trialCost,
    enriched: Boolean(p.enriched)
  });
}

leanIndex.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.enriched ? 1 : 0) - (a.enriched ? 1 : 0));

// Remove dossiers of products that no longer exist (renamed / filtered as non-products)
let removedOrphans = 0;
for (const f of fs.readdirSync(PRODUCTS_DIR)) {
  if (f.endsWith('.json') && !writtenProductFiles.has(f)) {
    fs.unlinkSync(path.join(PRODUCTS_DIR, f));
    removedOrphans++;
  }
}
if (removedOrphans) console.log(`Removed ${removedOrphans} orphaned product dossiers.`);

fs.writeFileSync(
  path.join(DATA_DIR, 'explore.json'),
  JSON.stringify({
    total: leanIndex.length,
    items: leanIndex
  }),
  'utf-8'
);

// quick.json: "现在就能玩" — products you can try right now in the browser, no install
const QUICK_LEVELS = new Set(['instant', 'web', 'signup']);
function quickTryUrl(p) {
  if (p.trialCost?.demoUrl) return p.trialCost.demoUrl;
  const url = p.directUrl || p.url || '';
  return /github\.com|producthunt\.com|betalist\.com|news\.ycombinator\.com/i.test(url) ? '' : url;
}
const quickPicks = leanIndex
  .filter(p => {
    const c = p.trialCost;
    if (!c || !QUICK_LEVELS.has(c.level) || !quickTryUrl(p)) return false;
    // verified quick web products, or genuine online demos
    return c.level === 'instant' || (c.verified && c.minutes != null && c.minutes <= 5);
  })
  .sort((a, b) =>
    a.trialCost.rank - b.trialCost.rank ||
    Number(b.trialCost.verified) - Number(a.trialCost.verified) ||
    String(b.date || '').localeCompare(String(a.date || ''))
  )
  .slice(0, 24)
  .map(p => ({
    key: p.key,
    date: p.date,
    name: p.name,
    tagline: p.tagline,
    categoryLabel: p.categoryLabel,
    pricingModel: p.pricingModel,
    ogImage: p.ogImage,
    tryUrl: quickTryUrl(p),
    trialCost: p.trialCost
  }));
fs.writeFileSync(
  path.join(DATA_DIR, 'quick.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), items: quickPicks }),
  'utf-8'
);
console.log(`Quick-try picks: ${quickPicks.length}`);

// Write weekly.json (top 5 curated picks per recent 8 weeks)
const weeklyPicks = [];
for (const [week, list] of Array.from(weeklyBuckets.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8)) {
  const dedup = new Map();
  for (const item of list) {
    const master = masterMap.get(item.key) || item;
    if (!dedup.has(item.key)) dedup.set(item.key, master);
  }
  const ranked = Array.from(dedup.values()).sort((a, b) => {
    const score = (x) =>
      (x.enriched ? 300 : 0) +
      ((x.sourceCount || 1) > 1 ? 180 : 0) +
      ((x.appearanceCount || 1) > 1 ? 120 : 0) +
      (x.demoUrl ? 100 : 0) +
      (x.githubRepo ? 80 : 0) +
      Math.min(120, Math.log10(parseStarNum(x.stars) + 1) * 30);
    return score(b) - score(a);
  }).slice(0, 5);

  const datesInWeek = [...new Set(list.map(i => i.date))].sort();
  weeklyPicks.push({
    week,
    range: datesInWeek.length > 1 ? `${datesInWeek[0]} ~ ${datesInWeek[datesInWeek.length - 1]}` : (datesInWeek[0] || week),
    items: ranked.map(p => ({
      key: p.key,
      date: p.lastSeen || p.date,
      name: p.name,
      tagline: p.tagline || '',
      categoryLabel: p.categoryLabel,
      deliveryForm: p.deliveryForm,
      deliveryLabel: p.deliveryLabel,
      pricingModel: p.pricingModel || null,
      frictionLevel: p.frictionLevel || null,
      demoUrl: p.demoUrl || null,
      githubRepo: p.githubRepo || null,
      stars: p.stars || null,
      ogImage: p.ogImage || null,
      enriched: Boolean(p.enriched),
      sourceCount: p.sourceCount || 1
    }))
  });
}

fs.writeFileSync(
  path.join(DATA_DIR, 'weekly.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    weeks: weeklyPicks
  }),
  'utf-8'
);

// Generate RSS 2.0 feed.xml (latest 30 unique products)
const rssItems = leanIndex.slice(0, 30).map(item => {
  const link = `${SITE_ORIGIN}/#/product/${encodeURIComponent(item.key)}`;
  const pubDate = new Date(`${item.date}T08:00:00+08:00`).toUTCString();
  const metaParts = [item.categoryLabel, item.deliveryLabel, item.pricingModel, item.stars ? `★ ${item.stars}` : ''].filter(Boolean).join(' · ');
  return `    <item>
      <title>${escapeXml(item.name)} — ${escapeXml(item.tagline)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(`${metaParts}${item.directUrl ? ` | ${item.directUrl}` : ''}`)}</description>
    </item>`;
}).join('\n');

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Products Selection · 每日精选产品体验台</title>
    <link>${SITE_ORIGIN}/</link>
    <atom:link href="${SITE_ORIGIN}/feed.xml" rel="self" type="application/rss+xml" />
    <description>每日精选开源项目与热门 AI 产品体验台，提供结构化上手指引、在线试玩与真实避坑建议。</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(PUBLIC_DIR, 'feed.xml'), rssXml, 'utf-8');

console.log(`Built static dataset: ${dates.length} days, ${masterMap.size} unique products, ${weeklyPicks.length} weekly digests + feed.xml -> ${DATA_DIR}`);
