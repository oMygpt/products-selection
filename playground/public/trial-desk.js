import { getTrialCost, describeTrialCost } from './trial-cost.js';

const DIRECTORY_DOMAINS = [
  'producthunt.com', 'betalist.com', 'theresanaiforthat.com',
  'news.ycombinator.com', 'sspai.com'
];

const ENTRY_MODES = {
  desktop: { label: '桌面 / 插件', action: '查看安装方式' },
  web: { label: '网页产品', action: '打开网页体验' },
  github: { label: '开源项目', action: '查看上手指引' },
  api: { label: '模型 / API', action: '查看调用方式' }
};

function getTrialUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (DIRECTORY_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return null;
    if (/\/(?:blog|posts?|news|articles?|announcements?)(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function getTrialCandidate(product) {
  const url = getTrialUrl(product.directUrl || product.url);
  const guide = (Array.isArray(product.experienceGuide) ? product.experienceGuide : [])
    .filter(step => typeof step === 'string' && step.trim())
    .map(step => step.trim().replace(/^步骤\s*\d+\s*[：:]\s*/, ''));
  if (!url || !Object.hasOwn(ENTRY_MODES, product.deliveryForm)) return null;
  if (/遥测曝光|供应链投毒|关停|永久关闭|团队谈/.test(product.name)) return null;
  if (guide.length >= 2 && /^(?:重点)?(?:浏览|阅读|了解)/.test(guide.at(-1))) return null;

  const cost = getTrialCost(product);
  const hasGuide = guide.length >= 2;
  const demo = cost.demoUrl ? getTrialUrl(cost.demoUrl) : null;
  const form = product.deliveryForm === 'web' && /预构建二进制|安装工具链|加入系统 PATH/i.test(guide.join(' '))
    ? 'github'
    : product.deliveryForm;
  const mode = demo
    ? { label: '在线 Demo', action: '打开在线 Demo' }
    : { ...ENTRY_MODES[form] };
  mode.requirement = describeTrialCost(cost) + (cost.verified ? '' : '（估）');
  // Lower = easier to try. Un-enriched items stay eligible but rank below verified guides.
  mode.priority = cost.rank + (hasGuide ? 0 : 3);

  const task = hasGuide
    ? guide.at(-1)
    : (product.quickCommand
        ? `运行 \`${product.quickCommand}\` 快速体验：${product.tagline || product.name}`
        : (product.tagline || product.description || '打开产品体验台查看上手步骤'));

  return {
    product,
    task,
    cost,
    mode,
    group: demo ? 'web' : form,
    url: demo?.href || (form === 'web' && url.hostname !== 'github.com' && cost.level !== 'hardware' ? url.href : null)
  };
}

export function getTrialCandidates(products) {
  return (products || []).map(getTrialCandidate).filter(Boolean);
}

const isDone = (userItems, entry) => ['tried', 'dropped'].includes(userItems[entry.product.key]?.status);

// Easier-to-try products are drawn more often; tried / just-shown ones rarely; hardware almost never leads.
function drawWeight(entry, userItems, previousKeys) {
  let weight = Math.pow(0.5, entry.mode.priority);
  if (entry.cost.verified) weight *= 1.5;
  if ((entry.product.sourceCount || 1) > 1) weight *= 1.3;
  if (isDone(userItems, entry)) weight *= 0.02;
  if (previousKeys.includes(entry.product.key)) weight *= 0.05;
  return weight;
}

function weightedPick(pool, weights, rng) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return pool.length - 1;
}

/**
 * Draw one featured + up to two alternatives.
 * - "换一组" passes the previous sample: the featured product always changes when possible.
 * - Alternatives prefer a different delivery form than what is already shown.
 */
export function drawTrials(candidates, userItems = {}, previousKeys = [], rng = Math.random) {
  if (!candidates?.length) return [];
  const pool = [...candidates];
  const weights = pool.map(entry => drawWeight(entry, userItems, previousKeys));

  const leadPool = pool.map((entry, i) => i).filter(i => pool[i].product.key !== previousKeys[0]);
  const leadIdx = leadPool.length
    ? leadPool[weightedPick(leadPool, leadPool.map(i => weights[i]), rng)]
    : 0;
  const selected = [pool[leadIdx]];
  pool.splice(leadIdx, 1);
  weights.splice(leadIdx, 1);

  const represented = new Set([selected[0].group]);
  while (selected.length < 3 && pool.length) {
    const diverse = pool.map((entry, i) => i).filter(i => !represented.has(pool[i].group));
    const choices = diverse.length ? diverse : pool.map((entry, i) => i);
    const idx = choices[weightedPick(choices, choices.map(i => weights[i]), rng)];
    selected.push(pool[idx]);
    represented.add(pool[idx].group);
    pool.splice(idx, 1);
    weights.splice(idx, 1);
  }
  return selected;
}

/** Deterministic variant (best candidate first) — used for "is there anything to try?" checks and tests. */
export function selectTrials(products, selectedKey, userItems = {}) {
  const candidates = getTrialCandidates(products).sort((a, b) =>
    Number(isDone(userItems, a)) - Number(isDone(userItems, b)) ||
    a.mode.priority - b.mode.priority ||
    Number(b.cost.verified) - Number(a.cost.verified) ||
    (b.product.sourceCount || 1) - (a.product.sourceCount || 1)
  );
  const featured = candidates.find(entry => entry.product.key === selectedKey) || candidates[0];
  if (!featured) return { featured: null, alternatives: [] };

  const represented = new Set([featured.group]);
  const alternatives = [];
  const remaining = candidates.filter(entry => entry !== featured);
  for (const entry of remaining) {
    if (represented.has(entry.group)) continue;
    alternatives.push(entry);
    represented.add(entry.group);
    if (alternatives.length === 2) break;
  }
  for (const entry of remaining) {
    if (alternatives.length === 2) break;
    if (!alternatives.includes(entry)) alternatives.push(entry);
  }
  return { featured, alternatives };
}
