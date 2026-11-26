// Trial cost: one honest answer to "what does it take to try this?"
// Shared by build-static (Node) and the browser, so every surface tells the same story.
//
// Precedence: hardware requirement > verified enrichment > genuine online demo > estimate by form.
// Anything not verified by the enrich agent is marked `verified: false` and rendered as an estimate.

export const TRIAL_LEVELS = {
  instant: { label: '免注册直玩', short: '直玩', rank: 0 },
  web: { label: '打开网页', short: '网页', rank: 1 },
  signup: { label: '需注册登录', short: '注册', rank: 2 },
  key: { label: '需自备 Key', short: 'Key', rank: 3 },
  install: { label: '需本地安装', short: '安装', rank: 4 },
  desktop: { label: '需装客户端', short: '客户端', rank: 4 },
  hardware: { label: '需特定硬件', short: '硬件', rank: 9 }
};

const FRICTION_TO_LEVEL = {
  免注册直玩: 'instant',
  需注册登录: 'signup',
  '需自备 Key': 'key',
  需本地安装: 'install',
  '需桌面/插件': 'desktop'
};

const ESTIMATED_MINUTES = { instant: 1, web: 3, signup: 3, key: 5, install: 10, desktop: 5, hardware: null };

const HARDWARE_RE = /(?:(?<![无不免])需(?:要|自备|购买|准备|连接)?|若已(?:拥有|有)|准备(?:好)?一(?:台|块|个))[^，。；]{0,12}(?:硬件|开发板|设备|传感器)|开发板|树莓派|Raspberry\s*Pi|Arduino|单片机|SmallTV|ESP32(?!\s*(?:模拟|仿真|sim))/i;
const EMULATED_RE = /浏览器(?:里|中|内)?(?:跑|运行|模拟|仿真)|在线模拟|模拟器|emulat|simulat/i;
const REGISTRY_HOST_RE = /(^|\.)(github\.com|npmjs\.com|pypi\.org|crates\.io|pkg\.go\.dev|rubygems\.org|nuget\.org|hub\.docker\.com|marketplace\.visualstudio\.com)$/i;
const DEMO_HOST_RE = /(^|\.)(stackblitz\.com|codesandbox\.io|replit\.com|colab\.research\.google\.com|codepen\.io|jsfiddle\.net)$/i;
const DEMO_PATH_RE = /\/(?:demo|playground|try|sandbox|live)(?:\/|\.html?$|$)/i;
const FREE_PRICING = new Set(['免费开源', '免费可用', 'Freemium']);
const PAID_PRICING = new Set(['商业付费', '一次性买断']);

/** A URL that, by itself, is an in-browser demo: HF Space, online sandbox, or an explicit /demo path. */
export function isDemoUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (REGISTRY_HOST_RE.test(host)) return false;
    if (host === 'huggingface.co') return url.pathname.startsWith('/spaces/');
    if (DEMO_HOST_RE.test(host)) return true;
    return DEMO_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

function productText(product) {
  const guide = Array.isArray(product.experienceGuide) ? product.experienceGuide.join(' ') : '';
  return `${product.tagline || ''} ${guide} ${product.introduction || ''}`;
}

export function computeTrialCost(product = {}) {
  const verifiedLevel = FRICTION_TO_LEVEL[product.frictionLevel] || null;
  const demoUrl = product.demoUrl && isDemoUrl(product.demoUrl) ? product.demoUrl : null;
  let level;
  let verified = false;

  const text = productText(product);
  if (verifiedLevel === 'instant') {
    // The enrich agent opened the site and found it playable as-is: trust that over keywords
    level = 'instant';
    verified = true;
  } else if (HARDWARE_RE.test(text) && !EMULATED_RE.test(text)) {
    level = 'hardware';
    verified = Boolean(product.enriched);
  } else if (verifiedLevel) {
    level = verifiedLevel;
    verified = true;
  } else if (demoUrl) {
    level = 'instant';
  } else {
    level = { web: 'web', github: 'install', desktop: 'desktop', api: 'key' }[product.deliveryForm] || 'web';
  }

  // A verified "needs install" beats a demo link scraped from the README; otherwise demos win.
  const canDemo = Boolean(demoUrl) && (level === 'instant' || level === 'web' || level === 'signup');
  const minutes = verified && Number.isFinite(product.setupMinutes) && level !== 'hardware'
    ? product.setupMinutes
    : ESTIMATED_MINUTES[level];
  const free = FREE_PRICING.has(product.pricingModel) ? true : PAID_PRICING.has(product.pricingModel) ? false : null;

  return {
    level,
    label: TRIAL_LEVELS[level].label,
    rank: TRIAL_LEVELS[level].rank,
    minutes,
    free,
    verified,
    demoUrl: canDemo ? demoUrl : null
  };
}

/** The three quick filters on the library page. */
export const QUICK_FILTERS = {
  // Only verified timings (or genuine online demos) count — estimates would make the filter meaningless
  fast: { label: '5 分钟内', test: c => c.minutes != null && c.minutes <= 5 && c.level !== 'hardware' && (c.verified || c.level === 'instant') },
  noSignup: { label: '免注册', test: c => c.level === 'instant' },
  free: { label: '免费', test: c => c.free === true }
};

/** "免注册直玩 · 约 1 分钟 · 免费" — "约" only when estimated. */
export function describeTrialCost(cost) {
  const parts = [cost.label];
  if (cost.minutes != null) parts.push(`${cost.verified ? '' : '约 '}${cost.minutes} 分钟`);
  if (cost.free === true) parts.push('免费');
  else if (cost.free === false) parts.push('付费');
  return parts.join(' · ');
}

export function getTrialCost(product) {
  return product?.trialCost || computeTrialCost(product);
}
