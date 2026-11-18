const DIRECTORY_DOMAINS = [
  'producthunt.com', 'betalist.com', 'theresanaiforthat.com',
  'news.ycombinator.com', 'sspai.com'
];

const ENTRY_MODES = {
  desktop: { label: '桌面 / 插件', action: '查看安装方式', requirement: '需安装客户端或插件', priority: 1 },
  web: { label: '网页产品', action: '打开网页体验', requirement: '注册要求以产品页面为准', priority: 2 },
  github: { label: '开源项目', action: '查看上手指引', requirement: '需按指引配置运行环境', priority: 3 },
  api: { label: '模型 / API', action: '查看调用方式', requirement: '可能需要账号或 API Key', priority: 4 }
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

function isDemo(url) {
  return (url.hostname === 'huggingface.co' && url.pathname.startsWith('/spaces/')) ||
    /\/(?:demo|playground|example)(?:\/|\.html?$|$)/i.test(url.pathname);
}

function getTrialCandidate(product) {
  const url = getTrialUrl(product.directUrl || product.url);
  const guide = (Array.isArray(product.experienceGuide) ? product.experienceGuide : [])
    .filter(step => typeof step === 'string' && step.trim())
    .map(step => step.trim().replace(/^步骤\s*\d+\s*[：:]\s*/, ''));
  if (!url || !Object.hasOwn(ENTRY_MODES, product.deliveryForm) || guide.length < 2) return null;
  if (/遥测曝光|供应链投毒|关停|永久关闭|团队谈/.test(product.name)) return null;
  if (/^(?:重点)?(?:浏览|阅读|了解)/.test(guide.at(-1))) return null;

  const linkedDemo = (guide[0].match(/https?:\/\/[^\s`<>"）。，、；]+/g) || [])
    .map(getTrialUrl).find(link => link?.origin === url.origin && isDemo(link));
  const demo = isDemo(url) ? url : linkedDemo;
  const form = product.deliveryForm === 'web' && /预构建二进制|安装工具链|加入系统 PATH/i.test(guide.join(' '))
    ? 'github'
    : product.deliveryForm;
  const mode = demo
    ? { label: '在线 Demo', action: '打开在线 Demo', requirement: '在浏览器中体验', priority: 0 }
    : { ...ENTRY_MODES[form] };
  if (!demo && /注册|登录/.test(guide[0]) && !/无需(?:注册|登录)/.test(guide[0])) {
    mode.requirement = form === 'desktop' ? '需安装，可能需要登录' : '可能需要注册或登录';
  }
  if (!demo && form === 'desktop' && /USB|开发板/.test(guide.join(' '))) mode.priority += 3;
  return {
    product,
    task: guide.at(-1),
    mode,
    group: demo ? 'web' : form,
    url: demo?.href || (form === 'web' && url.hostname !== 'github.com' ? url.href : null)
  };
}

export function selectTrials(products, selectedKey, userItems = {}) {
  const candidates = products.map(getTrialCandidate).filter(Boolean).sort((a, b) =>
    Number(userItems[a.product.key]?.status === 'tried') - Number(userItems[b.product.key]?.status === 'tried') ||
    a.mode.priority - b.mode.priority
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
