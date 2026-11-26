// Modular briefing parser, metadata normalizer & command extractor

export const GITHUB_RESERVED_OWNERS = new Set([
  'features', 'login', 'signup', 'join', 'about', 'pricing', 'enterprise',
  'topics', 'trending', 'explore', 'orgs', 'sponsors', 'marketplace', 'site',
  'security', 'customer-stories', 'solutions', 'resources', 'settings', 'notifications',
  'issues', 'pulls', 'codespaces', 'copilot', 'collections', 'events', 'blog', 'apps'
]);

export const PRODUCT_TYPES = {
  agent: {
    label: 'Agent 与自动化',
    keywords: [
      'agent', 'mcp', 'skill', 'claude code', 'codex', 'cursor', 'opencode',
      'harness', '多体', '编排', '护栏', '记忆', '替你打', '代办', 'errand',
      'workflow', '工作流', '自动化', 'sidecar', 'a2a', '智能体', '助手', '代理'
    ]
  },
  devtools: {
    label: '开发与基础设施',
    keywords: [
      'cli', 'rust', 'go ', '编译器', '数据库', 'sql', 'postgres', 'mysql',
      'zfs', 'git', 'docker', 'wasm', 'api', 'sdk', '测试', 'diff', '调试',
      '监控', '运维', '沙箱', '模拟', '单片机', 'kicad', '硬件', '安全', '扫描',
      'csv', 'ide', '终端', '部署', 'github', '代码', '开源框架', 'compiler', 'emulator',
      'ci', 'runner', 'pr '
    ]
  },
  models: {
    label: 'AI 模型与多模态',
    keywords: [
      '模型', 'llm', 'tts', 'asr', '语音识别', '配音', '生成模型', '视频生成',
      '3d', '决策模型', '量化器', 'gguf', '推理', 'arxiv', 'benchmark', '数据集',
      'omnimodal', 'speech-to-speech', '语音合成', '多模态', '世界模型', '嵌入模型'
    ]
  },
  productivity: {
    label: '效率与桌面工具',
    keywords: [
      '笔记', '会议', '转写', '转录', '任务', '待办', 'todo', '日历', '日程',
      '邮箱', '邮件', '收件箱', 'mac app', 'macos', '菜单栏', 'dock', '触控板',
      'chrome 扩展', 'chrome 插件', 'safari 扩展', '浏览器', 'obsidian', 'markdown', 'docx',
      'pdf', '本体', '文档', '去 ai 腔', '去ai腔', '写作', '剪贴板', '录音', '编辑器', '文件编目'
    ]
  },
  vertical: {
    label: '垂直与行业应用',
    keywords: [
      '教育', '课程', '课堂', '学习', '抽认卡', '金融', '股票', '期权', '交易',
      '量化', '理财', '发票', '账单', '客服', '营销', 'seo', '电商', '健康',
      '医疗', '游戏', '解谜', '画笔', '像素', '投资', '基金', 'fof', '保险',
      '房地产', '影视', '相机', '摄影', '招聘', '求职', '面试'
    ]
  }
};

export const DELIVERY_LABELS = {
  github: '开源项目',
  web: '在线网页',
  desktop: '客户端/插件',
  api: '模型/API'
};

export const VALID_PRICING_MODELS = new Set([
  '免费开源',
  '免费可用',
  'Freemium',
  '一次性买断',
  '商业付费'
]);

const LICENSE_SPDX_PATTERN = /^(MIT(?:-0)?|Apache-2\.0|AGPL-3\.0(?:-only|-or-later)?|GPL-[23]\.0(?:-only|-or-later)?|LGPL-[23]\.0|BSD-[23]-Clause|MPL-2\.0|ISC|Unlicense|CC0-1\.0|BSL-1\.1|EPL-2\.0|EUPL-1\.2|SSPL-1\.0|Fair Source)$/i;

export const SCENARIO_RULES = [
  {
    id: 'claude-code',
    label: '让 Claude Code 更好用',
    test: (text) => /\b(claude code|codex|cursor|opencode|mcp|coding agent|agent skill|agentic|ai 编程|编码代理)\b/i.test(text)
  },
  {
    id: 'teaching',
    label: '教学与研究可用',
    test: (text) => /(教育|教学|课堂|课程|学生|老师|学习|论文|arxiv|实验|抽认卡|科研|学术|benchmark)/i.test(text)
  },
  {
    id: 'local-privacy',
    label: '本地隐私优先',
    test: (text) => /(纯本地|本地运行|本地优先|离线|无需账号|无账号|免登录|不出本地|self-host|自托管|local-first|气隙|端到端加密)/i.test(text)
  },
  {
    id: 'instant-web',
    label: '浏览器零配置直玩',
    test: (text, item) =>
      Boolean(item.demoUrl) ||
      (item.deliveryForm === 'web' && /(无需注册|免注册|免登录|浏览器里|在线 Demo|playground|免费可用|完全免费)/i.test(text))
  },
  {
    id: 'solo-builder',
    label: '独立开发提效',
    test: (text) => /(独立开发|单人创业|solopreneur|部署|ci|github actions|视频|发布|设计|cli|终端|diff|代码审查)/i.test(text)
  }
];

export function normalizeProductKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

// Sections that list news / signals rather than tryable products (HN front page, macro, security advisories...)
export const NEWS_SECTION_RE = /落选|核心信号|今日信号|今日趋势|今日首推|未通过|剔除|Hacker News 首页|HN 首页|首页重点|新闻|宏观|弱信号|安全(?:事件|动态|公告|集群)|行业动态/;

const HN_PREFIX_RE = /^(?:show|launch|ask|tell)\s+hn\s*[:：]\s*/i;
const NON_PRODUCT_NAME_RE = /付费位|广告位|^sponsored$|^boosted\b/i;

// Normalizes HN-style titles: "Show HN: Lmux – Lightweight terminal" -> { name: "Lmux", tagline: "Lightweight terminal" }
export function cleanProductName(rawName = '') {
  let name = String(rawName || '').replace(/\*\*/g, '').trim();
  const hadHnPrefix = HN_PREFIX_RE.test(name);
  name = name.replace(HN_PREFIX_RE, '').trim();
  let tagline = '';
  if (hadHnPrefix || name.length > 24) {
    const m = name.match(/^(.{2,40}?)\s+[–—-]\s+(.+)$/) || name.match(/^([^:：]{2,30})(?::\s+|：\s*)(.+)$/);
    const trailing = name.match(/^(.{12,}?)\s*[（(]([^()（）]{2,24})[）)]$/);
    if (m) {
      name = m[1].trim();
      tagline = m[2].trim();
    } else if (trailing && !/^(?:YC|beta|alpha|open source|开源|免费)/i.test(trailing[2])) {
      // "Realtime sync engine without any new infra (tandem)" -> "tandem"
      name = trailing[2].trim();
      tagline = trailing[1].trim();
    }
  }
  return { name, tagline };
}

export function isNonProductEntry(item = {}) {
  return NON_PRODUCT_NAME_RE.test(String(item.name || '').trim());
}

const GENERIC_HOST_LABELS = new Set(['www', 'app', 'get', 'try', 'use', 'go', 'my', 'web', 'beta', 'docs', 'com', 'io', 'ai', 'dev', 'app', 'so', 'sh', 'co', 'net', 'org', 'github', 'vercel', 'netlify', 'pages']);
const normToken = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A GitHub link found on a product page only counts as *the product's* repo when its
 * owner or name resembles the product name or the site's domain. Landing pages often
 * link to competitors / dependencies (e.g. a transcription API comparing itself to WhisperX).
 */
export function repoMatchesProduct(repo, { productName = '', siteUrl = '' } = {}) {
  const [owner = '', name = ''] = String(repo || '').split('/');
  const ownerN = normToken(owner);
  const nameN = normToken(name);
  if (!ownerN || !nameN) return false;
  const tokens = new Set();
  const full = normToken(productName);
  if (full.length >= 3) tokens.add(full);
  for (const word of String(productName).split(/[\s._\-/:：()（）]+/)) {
    const w = normToken(word);
    if (w.length >= 4) tokens.add(w);
  }
  try {
    const host = new URL(siteUrl).hostname.toLowerCase();
    for (const label of host.split('.')) {
      if (label.length >= 3 && !GENERIC_HOST_LABELS.has(label)) tokens.add(normToken(label));
    }
  } catch { /* no site */ }
  for (const t of tokens) {
    if (nameN === t || ownerN === t) return true;
    if (t.length >= 4 && (nameN.includes(t) || ownerN.includes(t))) return true;
    if (nameN.length >= 4 && t.includes(nameN)) return true;
  }
  return false;
}

export function cleanRepoSlug(slug) {
  if (!slug) return null;
  const cleaned = String(slug).trim().replace(/\.git$/, '').replace(/[),.;:]+$/, '');
  const parts = cleaned.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo || GITHUB_RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `${owner}/${repo}`;
}

export function normalizeLicense(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || /^(NOASSERTION|OTHER|NONE|UNKNOWN|N\/A)$/i.test(trimmed)) return null;
  const exact = trimmed.match(LICENSE_SPDX_PATTERN);
  if (exact) return exact[1];
  const embedded = trimmed.match(/\b(Apache-2\.0|AGPL-3\.0|GPL-3\.0|GPL-2\.0|LGPL-3\.0|BSD-[23]-Clause|MPL-2\.0|ISC|MIT(?:-0)?)\b/i);
  return embedded ? embedded[1] : null;
}

export function normalizePricing(rawPricing, { fullText = '', githubRepo = null, license = null } = {}) {
  const candidate = String(rawPricing || '').trim();
  // Never allow SPDX license names or bare "开源" to pollute pricingModel
  if (candidate && VALID_PRICING_MODELS.has(candidate)) {
    return candidate;
  }
  if (candidate && !LICENSE_SPDX_PATTERN.test(candidate) && candidate !== '开源') {
    if (/免费开源|open\s*source.*free|free.*open\s*source/i.test(candidate)) return '免费开源';
    if (/买断|one[- ]?time|lifetime/i.test(candidate)) return '一次性买断';
    if (/freemium|免费版|免费起步|免费额度|免费试用/i.test(candidate)) return 'Freemium';
    if (/付费|订阅|paid|\$\d/i.test(candidate)) return '商业付费';
    if (/免费|free/i.test(candidate)) return (githubRepo || license) ? '免费开源' : '免费可用';
  }

  const text = `${candidate} ${fullText}`.toLowerCase();
  if (text.includes('免费开源') || ((githubRepo || license || text.includes('开源')) && (text.includes('免费') || text.includes('free') || text.includes('自托管')))) {
    return '免费开源';
  }
  if (text.includes('一次性') || text.includes('买断') || text.includes('one-time')) return '一次性买断';
  if (text.includes('免费起步') || text.includes('免费版') || text.includes('免费额度') || text.includes('免费试用') || text.includes('freemium') || (text.includes('免费') && /pro|\$\d+|美元|付费/.test(text))) {
    return 'Freemium';
  }
  if (text.includes('商业付费') || (/\$\d+|美元\/月|付费/.test(text) && !text.includes('免费'))) {
    return '商业付费';
  }
  if (text.includes('免费') || /\bfree\b/.test(text)) return '免费可用';
  if (githubRepo || license) return '免费开源';
  return null;
}

export function extractDemoUrl(text = '', directUrl = '') {
  const candidates = [];
  if (directUrl) candidates.push(directUrl);
  const urls = String(text || '').match(/https?:\/\/[^\s`<>"'）)】，,。；;]+/gi) || [];
  candidates.push(...urls);

  for (const raw of candidates) {
    const clean = raw.replace(/[),.;:]+$/, '');
    try {
      const u = new URL(clean);
      const host = u.hostname.toLowerCase();
      if (host === 'huggingface.co' && u.pathname.startsWith('/spaces/')) return u.href;
      if (/(?:stackblitz\.com|codesandbox\.io|replit\.com|colab\.research\.google\.com|codepen\.io|jsfiddle\.net)/i.test(host)) return u.href;
      if (host.endsWith('.github.io') || host.endsWith('.vercel.app') || host.endsWith('.pages.dev')) return u.href;
      if (/\/(?:demo|playground|try|sandbox|live)(?:\/|\.html?$|$)/i.test(u.pathname) && !host.includes('github.com')) return u.href;
    } catch {
      // ignore invalid URL
    }
  }
  return null;
}

export function extractLinksAndMeta(rawMeta, description = '') {
  const combined = `${rawMeta || ''} ${description || ''}`;
  let githubRepo = null;
  let directUrl = null;
  let stars = null;
  let license = null;
  const verified = combined.includes('✅') || combined.includes('✓');

  const starMatch =
    combined.match(/★\s*([0-9.]+k?)/i) ||
    combined.match(/([0-9.]+k?)\s*★/i) ||
    combined.match(/([0-9,]+)\s*stars/i) ||
    combined.match(/总\s*([0-9,]+(?:\.[0-9]+)?k?)\s*星/i) ||
    combined.match(/\+([0-9,]+)\s*星/i) ||
    combined.match(/已有\s*([0-9,]+(?:\.[0-9]+)?k?)\s*多个?\s*star/i);
  if (starMatch) stars = starMatch[1];

  const licMatch = combined.match(/\b(Apache-2\.0|AGPL-3\.0|GPL-3\.0|GPL-2\.0|BSD-[23]-Clause|MPL-2\.0)\b/i)
    || combined.match(/\b(MIT(?:-0)?)\b(?!\s*(?:背景|团队|教授|实验室|学者|出品|毕业))/);
  if (licMatch) license = normalizeLicense(licMatch[1]);

  const ghUrlMatch = combined.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (ghUrlMatch) {
    githubRepo = cleanRepoSlug(ghUrlMatch[1]);
  }
  if (!githubRepo) {
    const tokens = (rawMeta || '').split(/[·,，\s（）()]+/);
    for (const tok of tokens) {
      if (
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(tok) &&
        !tok.includes('.') &&
        !/^\d+\/\d+$/.test(tok) &&
        !/^(Win|Mac|Linux|iOS|Android|Claude|ChatGPT|HTML|CSS|JS|TS|AI|FOF|LLM|RAG|MCP|API|OpenRouter|Python|Node)/i.test(tok)
      ) {
        githubRepo = cleanRepoSlug(tok);
        if (githubRepo) break;
      }
    }
  }

  const httpMatch = combined.match(/https?:\/\/[^\s）)】>,。"']+/i);
  if (httpMatch) {
    directUrl = httpMatch[0].replace(/[),.;:]+$/, '');
  } else {
    const domainRegex = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|ai|io|dev|app|org|net|sh|rs|xyz|fyi|live|email|finance|studio|tech|co|me|edu|gov|br|uk|de|jp|land|computer|to|im|win|run)(?:\/[^\s，,。；;）)】]*)?)\b/gi;
    let m;
    while ((m = domainRegex.exec(combined)) !== null) {
      const candidate = m[1].replace(/[),.;:]+$/, '');
      if (/^(whisper|llama|node|react|vue)\.(cpp|js|ts)$/i.test(candidate)) continue;
      if (/^[a-z0-9-]+\.[a-z0-9-]+$/i.test(candidate) && /\.(js|ts|py|go|rs|cpp|md|json|yaml|yml)$/i.test(candidate)) continue;
      if (candidate.toLowerCase() === 'github.com' && githubRepo) continue;
      directUrl = `https://${candidate}`;
      break;
    }
  }

  if (!directUrl && githubRepo) {
    directUrl = `https://github.com/${githubRepo}`;
  }

  return { githubRepo, directUrl, stars, license, verified };
}

export function inferScenarios(item) {
  const text = `${item.name || ''} ${item.tagline || ''} ${item.introduction || ''} ${item.description || ''} ${item.rawMeta || ''}`;
  const matched = [];
  for (const rule of SCENARIO_RULES) {
    if (rule.test(text, item)) matched.push(rule.id);
  }
  return matched;
}

export function classifyProductType(item) {
  const titleAndTag = `${item.name || ''} ${item.tagline || ''}`.toLowerCase();
  const body = `${item.description || ''} ${item.rawMeta || ''}`.toLowerCase();

  const scores = { agent: 0, devtools: 0, models: 0, productivity: 0, vertical: 0 };

  for (const [typeKey, cfg] of Object.entries(PRODUCT_TYPES)) {
    for (const kw of cfg.keywords) {
      if (titleAndTag.includes(kw)) scores[typeKey] += 3;
      else if (body.includes(kw)) scores[typeKey] += 1;
    }
  }

  if (/\barxiv\b|official|官方发布|决策模型|视频生成|世界模型|嵌入模型|gguf|量化器/i.test(`${titleAndTag} ${item.rawMeta || ''}`)) {
    scores.models += 4;
  }
  if (/\bmcp\b|coding agent|agent harness|agent\s*记忆|agent\s*护栏|派\s*agent|编程代理|编码代理/i.test(titleAndTag)) {
    scores.agent += 4;
  }

  let bestType = 'vertical';
  let bestScore = 0;
  for (const typeKey of ['agent', 'devtools', 'productivity', 'models', 'vertical']) {
    if (scores[typeKey] > bestScore) {
      bestScore = scores[typeKey];
      bestType = typeKey;
    }
  }

  const fullText = `${titleAndTag} ${body}`;
  const url = item.directUrl || item.url || '';
  let deliveryForm = 'web';
  let quickCommand = item.quickCommand || null;

  if (item.githubRepo || url.includes('github.com/')) {
    deliveryForm = 'github';
    const repo = item.githubRepo || cleanRepoSlug(url.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1]);
    if (repo) {
      item.githubRepo = repo;
      if (!quickCommand) quickCommand = `gh repo clone ${repo}`;
    }
  } else if (
    fullText.includes('chrome 扩展') ||
    fullText.includes('chrome 插件') ||
    fullText.includes('safari 扩展') ||
    fullText.includes('浏览器扩展') ||
    fullText.includes('mac app') ||
    fullText.includes('macos') ||
    fullText.includes('不出 mac') ||
    fullText.includes('桌面端') ||
    fullText.includes('桌面应用') ||
    fullText.includes('桌面文件') ||
    fullText.includes('ios') ||
    fullText.includes('客户端')
  ) {
    deliveryForm = 'desktop';
  } else if (
    bestType === 'models' ||
    fullText.includes('arxiv') ||
    url.includes('arxiv.org') ||
    fullText.includes('api 发布') ||
    fullText.includes('决策模型')
  ) {
    deliveryForm = 'api';
  }

  const normalizedLicense = normalizeLicense(item.license);
  if (normalizedLicense) item.license = normalizedLicense;
  else item.license = null;

  const pricingModel = normalizePricing(item.pricingModel, {
    fullText,
    githubRepo: item.githubRepo,
    license: item.license
  });

  const demoUrl = item.demoUrl || extractDemoUrl(`${item.description || ''} ${item.rawMeta || ''}`, url);

  // Extract inline backtick CLI commands from brief text if present (e.g. `npx relayrunner connect`)
  if (!quickCommand) {
    const inlineCmd = `${item.description || ''}`.match(/`((?:npx|uvx|bunx|brew install|npm i(?:nstall)?|pip3? install|cargo install|docker run|gh repo clone)\s+[^`]+)`/i);
    if (inlineCmd) quickCommand = inlineCmd[1].trim();
  }

  const badges = [];
  if (pricingModel) badges.push(pricingModel);
  if (fullText.includes('本地') || fullText.includes('离线') || fullText.includes('local') || fullText.includes('无账号')) {
    badges.push('本地优先');
  }

  const result = {
    categoryType: bestType,
    categoryLabel: PRODUCT_TYPES[bestType].label,
    deliveryForm,
    deliveryLabel: DELIVERY_LABELS[deliveryForm] || '在线网页',
    pricingModel,
    license: item.license,
    demoUrl: demoUrl || null,
    quickCommand,
    quickCommands: quickCommand ? [quickCommand] : [],
    badges
  };
  result.scenarios = inferScenarios({ ...item, ...result });
  return result;
}

// Merge backslash-continued shell commands before matching install/run commands
export function extractQuickCommands(readmeText, safeRepo = '') {
  const cmdMatches = [];
  const codeBlocks = [...String(readmeText || '').matchAll(/```(?:bash|sh|zsh|shell|console|cmd)?\r?\n([\s\S]*?)```/gi)];
  const CMD_PREFIX_RE = /^(npx |npm (i|install|exec|create)|pnpm |bunx |bun |uvx |uv |pip3? install|pipx |brew install|cargo install|go install|docker (run|compose)|curl .*\|.*sh|git clone |claude |codex )/i;

  for (const block of codeBlocks) {
    const rawLines = block[1].split(/\r?\n/);
    const logicalCommands = [];
    let current = '';

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        if (current) {
          logicalCommands.push(current.trim());
          current = '';
        }
        continue;
      }
      if (current) {
        current += ' ' + trimmed;
      } else {
        current = trimmed.replace(/^\$\s+/, '');
      }
      if (current.endsWith('\\')) {
        current = current.slice(0, -1).trim();
      } else {
        logicalCommands.push(current.trim());
        current = '';
      }
    }
    if (current) logicalCommands.push(current.trim());

    for (let cmd of logicalCommands) {
      if (!CMD_PREFIX_RE.test(cmd)) continue;
      if (safeRepo && /<repository[-_]url>|<repo[-_]url>/i.test(cmd)) {
        cmd = cmd.replace(/<repository[-_]url>|<repo[-_]url>/gi, `https://github.com/${safeRepo}.git`);
      }
      if (!cmdMatches.includes(cmd) && cmdMatches.length < 6) {
        cmdMatches.push(cmd);
      }
    }
  }
  return cmdMatches;
}

// Permanent fix: parse optional structured JSON block appended by upstream agents
export function parseStructuredJsonBlocks(content, date) {
  const items = [];
  const blocks = [...String(content || '').matchAll(/```json\s*\r?\n([\s\S]*?)```/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const list = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.products) ? parsed.products : (Array.isArray(parsed?.items) ? parsed.items : []));
      for (const raw of list) {
        if (!raw || typeof raw !== 'object' || !raw.name) continue;
        const name = String(raw.name).trim();
        const url = String(raw.url || raw.directUrl || '').trim();
        const repo = cleanRepoSlug(raw.repo || raw.githubRepo || (url.match(/github\.com\/([^/]+\/[^/#?]+)/i)?.[1]));
        const tagline = String(raw.tagline || '').trim();
        const description = String(raw.description || raw.why || tagline).trim();
        const isDir = /producthunt\.com|betalist\.com|theresanaiforthat\.com/i.test(url);
        const item = {
          key: normalizeProductKey(name),
          date,
          name,
          url: url || (repo ? `https://github.com/${repo}` : ''),
          directUrl: !isDir && url ? url : (repo ? `https://github.com/${repo}` : null),
          githubRepo: repo,
          stars: raw.stars != null ? String(raw.stars) : null,
          license: normalizeLicense(raw.license),
          pricingModel: raw.pricing || raw.pricingModel || null,
          tagline,
          description,
          rawMeta: raw.source || ''
        };
        Object.assign(item, classifyProductType(item));
        if (raw.demoUrl) item.demoUrl = String(raw.demoUrl).trim();
        items.push(item);
      }
    } catch {
      // ignore non-product JSON blocks
    }
  }
  return items;
}

const DIRECTORY_URL_RE = /producthunt\.com|betalist\.com|theresanaiforthat\.com/i;

function buildListItem(date, name, url, tagline, why = '', rawMeta = '') {
  const cleanName = name.replace(/^[✅⚠️]\s*/, '').replace(/\*\*/g, '').trim();
  const cleanUrl = (url || '').trim().replace(/[),.;:]+$/, '');
  const cleanTagline = (tagline || '').trim();
  const cleanWhy = (why || '').trim();
  const meta = extractLinksAndMeta(`${cleanUrl} ${rawMeta}`, `${cleanTagline} ${cleanWhy}`);
  const isDir = DIRECTORY_URL_RE.test(cleanUrl);
  const item = {
    key: normalizeProductKey(cleanName),
    date,
    name: cleanName,
    rawMeta: rawMeta || '',
    url: cleanUrl || meta.directUrl || '',
    directUrl: (!isDir && cleanUrl) ? cleanUrl : meta.directUrl,
    githubRepo: meta.githubRepo,
    stars: meta.stars,
    license: meta.license,
    tagline: cleanTagline,
    description: cleanWhy || cleanTagline
  };
  Object.assign(item, classifyProductType(item));
  return item;
}

function splitInlineWhy(text) {
  let main = text;
  let why = '';
  const m = text.match(/^(.*?)(?:为什么有趣|有趣点|有趣)[：:]\s*(.+)$/);
  if (m) {
    main = m[1].trim().replace(/[。；;\s]+$/, '');
    why = m[2].split(/来源[：:]/)[0].trim();
  } else {
    main = text.split(/来源[：:]/)[0].trim();
  }
  return { main, why };
}

function collectListFollowupLines(lines, startIdx) {
  let i = startIdx;
  const extraTaglines = [];
  let why = '';
  while (i + 1 < lines.length) {
    const nextTrim = lines[i + 1].trim();
    if (!nextTrim) break;
    if (/^(?:#{1,3}\s|\d+\.\s|\*\*\d+\.|-\s*\*\*\[|\*\*\[|\*\*[^*]+\*\*[（(]https?:\/\/)/.test(nextTrim)) {
      break;
    }
    if (/^(?:为什么有趣|有趣点|有趣)[：:]/.test(nextTrim)) {
      const body = nextTrim.replace(/^(?:为什么有趣|有趣点|有趣)[：:]/, '');
      why = (why ? `${why} ` : '') + body.split(/来源[：:]/)[0].trim();
      i++;
    } else if (/^来源[：:]/.test(nextTrim)) {
      i++;
    } else {
      const body = nextTrim.split(/来源[：:]/)[0].trim();
      if (body) extraTaglines.push(body);
      i++;
    }
  }
  return { nextIdx: i, extraTagline: extraTaglines.join(' '), why };
}

export function parseListBriefMarkdown(content, date) {
  const lines = String(content || '').split(/\r?\n/);
  let intro = '';
  const signals = [];
  const items = [];

  for (const line of lines.slice(1, 10)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    const sigMatch = trimmed.match(/^\*\*(今日趋势|今日首推|核心趋势|今日看点)\*\*[：:]\s*(.+)$/);
    if (sigMatch) {
      signals.push({ title: sigMatch[1].trim(), detail: sigMatch[2].trim() });
      if (sigMatch[1].includes('趋势')) intro = sigMatch[2].trim();
    } else if (!intro && !trimmed.startsWith('|') && !/^\d+\.\s/.test(trimmed) && !/^\*\*/.test(trimmed)) {
      intro = trimmed;
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Pattern A:
    //  - **1. [Name](url)** —— tagline
    //  - 1. **[Name](url)** —— tagline
    //  - 1. [Name](url) —— tagline
    //  - - **[Name](url)** —— tagline
    //  - **[Name](url)** —— tagline
    //  - ## 1. [Name](url) —— tagline
    const mLink =
      line.match(/^(?:##\s*)?(?:\*\*\d+\.\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*|(?:\d+\.\s*|-\s*)?\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*|(?:\d+\.\s*|-\s*)\[([^\]]+)\]\((https?:\/\/[^)]+)\))\s*(?:——|--|—|-|[：:])\s*(.+)$/);
    if (mLink) {
      const name = (mLink[1] || mLink[3] || mLink[5] || '').trim();
      const url = (mLink[2] || mLink[4] || mLink[6] || '').trim();
      const { main, why: inlineWhy } = splitInlineWhy(mLink[7].trim());
      const follow = collectListFollowupLines(lines, i);
      i = follow.nextIdx;
      const tagline = main;
      const desc = [follow.extraTagline, inlineWhy, follow.why].filter(Boolean).join('；') || tagline;
      items.push(buildListItem(date, name, url, tagline, desc));
      i++;
      continue;
    }

    // Pattern B:
    //  - 1. **Name**（https://...）—— tagline
    //  - **Name**（https://...）— tagline
    //  - 1. Name (https://...) — tagline
    const mParenInline =
      line.match(/^(?:\d+\.\s*)?(?:\*\*([^*]+)\*\*|([^（(—-]{2,60}?))\s*[（(](https?:\/\/[^）)]+)[）)]\s*(?:——|--|—|-|[：:])\s*(.+)$/);
    if (mParenInline) {
      const name = (mParenInline[1] || mParenInline[2] || '').trim();
      const url = mParenInline[3].trim();
      const { main, why: inlineWhy } = splitInlineWhy(mParenInline[4].trim());
      const follow = collectListFollowupLines(lines, i);
      i = follow.nextIdx;
      const desc = [follow.extraTagline, inlineWhy, follow.why].filter(Boolean).join('；') || main;
      items.push(buildListItem(date, name, url, main, desc));
      i++;
      continue;
    }

    // Pattern C:
    //  - 1. **Name**（https://...）  (tagline on next line)
    //  - **Name**（https://...）     (tagline on next line)
    const mParenBlock = line.match(/^(?:\d+\.\s*)?\*\*([^*]+)\*\*\s*[（(](https?:\/\/[^）)]+)[）)]\s*$/);
    if (mParenBlock) {
      const name = mParenBlock[1].trim();
      const url = mParenBlock[2].trim();
      const follow = collectListFollowupLines(lines, i);
      i = follow.nextIdx;
      const tagline = follow.extraTagline || '';
      const desc = follow.why || tagline;
      items.push(buildListItem(date, name, url, tagline, desc));
      i++;
      continue;
    }

    // Pattern D: Markdown table rows
    if (line.startsWith('|') && !line.includes('---|') && !/^\|\s*[-:]+/.test(line)) {
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (cells.length >= 4 && !/^(#|序号|编号|产品|排名)$/i.test(cells[0]) && cells[1] !== '产品') {
        const hasIndexCol = /^(?:\d+|[—–-]+)$/.test(cells[0]);
        const nameCell = (hasIndexCol ? cells[1] : cells[0]) || '';
        const nameLinkMatch = nameCell.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
        const name = (nameLinkMatch ? nameLinkMatch[1] : nameCell).replace(/\*\*/g, '').trim();

        let url = nameLinkMatch ? nameLinkMatch[2].trim() : '';
        let urlCellIdx = -1;
        for (let ci = cells.length - 1; ci >= 0; ci--) {
          const mdUrl = cells[ci].match(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
          const rawUrl = cells[ci].match(/https?:\/\/[^\s)]+/);
          if (mdUrl || rawUrl) {
            if (!url) url = (mdUrl ? mdUrl[1] : rawUrl[0]).trim();
            urlCellIdx = ci;
            break;
          }
        }

        const middleStart = hasIndexCol ? 2 : 1;
        const middleEnd = urlCellIdx > middleStart ? urlCellIdx : cells.length;
        const midCells = cells.slice(middleStart, middleEnd);
        let sourceHint = '';
        let whatCell = '';
        let heatCell = '';
        const looksNumeric = (c = '') => /^[\d\s/,.kK+★⭐~–-]+$/.test(c.replace(/\*\*/g, '').trim());
        if (midCells.length >= 3 && looksNumeric(midCells[1]) && !looksNumeric(midCells[0])) {
          // Column order "一句话 | 评论/赞 | 备注"
          whatCell = midCells[0];
          heatCell = midCells[1];
          sourceHint = midCells.slice(2).join(' · ');
        } else if (midCells.length >= 3) {
          sourceHint = midCells[0];
          whatCell = midCells[1];
          heatCell = midCells[2];
        } else if (midCells.length === 2) {
          whatCell = midCells[0];
          heatCell = midCells[1];
        } else if (midCells.length === 1) {
          whatCell = midCells[0];
        }

        if (name && (url || whatCell.length >= 10)) {
          const tagline = whatCell.replace(/\*\*/g, '').trim();
          const heatText = heatCell.replace(/\*\*/g, '').trim();
          const rawMeta = [sourceHint, heatText].filter(Boolean).join(' · ');
          const description = heatText ? `${tagline}（${heatText}）` : tagline;
          items.push(buildListItem(date, name, url, tagline, description, rawMeta));
        }
      }
    }

    i++;
  }

  return { intro, signals, items };
}

export function parseDetailedBriefMarkdown(content, date) {
  const lines = String(content || '').split(/\r?\n/);
  const signals = [];
  const items = [];
  let sourceSummary = '';

  let currentSection = '';
  let currentSubCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('> 数据来源：')) {
      sourceSummary = line.replace(/^>\s*/, '');
    }
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s+/, '');
      continue;
    }
    if (
      currentSection.includes('今日核心信号') ||
      currentSection.includes('今日信号') ||
      currentSection.includes('今日趋势')
    ) {
      const sigMatch =
        line.match(/^\d+\.\s+\*\*([^*]+)\*\*[：:]\s*(.+)$/) ||
        line.match(/^\d+\.\s+([^：:]{4,40})[：:]\s*(.+)$/);
      if (sigMatch) {
        const title = sigMatch[1].replace(/\*\*/g, '').trim();
        const detail = sigMatch[2].replace(/\*\*/g, '').trim();
        signals.push({ title, detail });
        if (!sourceSummary) sourceSummary = `${title}：${detail}`;
      }
    } else if (currentSection.startsWith('今日首推') && line && !line.startsWith('#') && !line.startsWith('---')) {
      const detail = line.replace(/\*\*/g, '').trim();
      signals.push({ title: currentSection.replace(/\*\*/g, '').trim(), detail });
      if (!sourceSummary) sourceSummary = `${currentSection} — ${detail}`;
    }
  }

  currentSection = '';
  let activeNumberedItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s+/, '');
      activeNumberedItem = null;
      continue;
    }
    if (line.startsWith('### ')) {
      const rawSub = line.replace(/^###\s+/, '');
      const isExcludedSection = NEWS_SECTION_RE.test(currentSection) || /附录|观察/.test(currentSection);
      // Matches:
      //  - ### 1. ✅ Hy4 preview — tagline
      //  - ### 1. **Name**（meta）—— tagline
      //  - ### ✅ Name（meta）—— tagline
      //  - ### Koed（https://koed.ai/）—— tagline
      const h3ProdMatch = rawSub.match(
        /^(?:(?:\d+\.\s*)?(?:[✅⚠️🔥]\s*)?)(?:\*\*([^*]+)\*\*|([^（(—]+?))\s*(?:[（(](.+?)[）)])?\s*(?:——|--|—|\s+-\s+)\s*(.+)$/
      );
      if (!isExcludedSection && h3ProdMatch && !/^[A-Z]\.\s/.test(rawSub)) {
        const name = (h3ProdMatch[1] || h3ProdMatch[2] || '').trim();
        const rawMeta = (h3ProdMatch[3] || '').trim();
        const taglineRaw = (h3ProdMatch[4] || '').replace(/★今日首推/g, '').trim();
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(`${rawMeta} ${taglineRaw}`, '');
        activeNumberedItem = {
          key,
          date,
          name,
          rawMeta: rawMeta || taglineRaw,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          tagline: taglineRaw.replace(/^真实[，,\s]*/, '').trim(),
          description: ''
        };
        Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
        items.push(activeNumberedItem);
        continue;
      }

      currentSubCategory = rawSub.replace(/^[A-Z]\.\s*/, '').replace(/（.*）/, '').trim();
      activeNumberedItem = null;
      continue;
    }

    if (activeNumberedItem && line.startsWith('- ')) {
      const moreMeta = extractLinksAndMeta(activeNumberedItem.rawMeta, line);
      activeNumberedItem.githubRepo = activeNumberedItem.githubRepo || moreMeta.githubRepo;
      if (!activeNumberedItem.directUrl && moreMeta.directUrl && !DIRECTORY_URL_RE.test(moreMeta.directUrl)) {
        activeNumberedItem.directUrl = moreMeta.directUrl;
      }
      activeNumberedItem.stars = activeNumberedItem.stars || moreMeta.stars;
      activeNumberedItem.license = activeNumberedItem.license || moreMeta.license;
      if (activeNumberedItem.directUrl) activeNumberedItem.url = activeNumberedItem.directUrl;

      if (!/^-\s*\*\*(?:核实状态|热度与来源)\*\*/.test(line)) {
        const subText = line
          .replace(/^-\s*(\*\*[^*]+\*\*|一句话|关键数字|定价与可用性|用法|价格\/开源|价格|缓解|做什么|值得关注|上手|热度|看点|链接|数据|注意)[：:]\s*/, '')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
          .replace(/\*\*/g, '')
          .trim();
        if (subText && !/^https?:\/\//.test(subText)) {
          activeNumberedItem.description = activeNumberedItem.description
            ? `${activeNumberedItem.description}；${subText}`
            : subText;
        }
      }
      Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
      continue;
    }

    // Numbered bold block inside product sections
    const isProductSection =
      currentSection.includes('重点产品') ||
      currentSection.includes('必看') ||
      currentSection.includes('Product Hunt') ||
      currentSection.includes('Show HN') ||
      currentSection.includes('BetaList');

    if (isProductSection) {
      const numBlockMatch = line.match(/^\*\*\d+\.\s*([^（(—-]+?)(?:[（(]([^）)]+)[）)])?\s*[—-]+\s*(.+?)\*\*$/);
      if (numBlockMatch) {
        const name = numBlockMatch[1].trim();
        const rawMeta = numBlockMatch[2] || '';
        const taglineRaw = numBlockMatch[3].trim();
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(`${rawMeta} ${taglineRaw}`, '');
        activeNumberedItem = {
          key,
          date,
          name,
          rawMeta: rawMeta || taglineRaw,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          tagline: taglineRaw.replace(/（✅[^）]*）/, '').trim(),
          description: ''
        };
        Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
        items.push(activeNumberedItem);
        continue;
      }
    }

    // Markdown tables (in any non-excluded section when cells contain bold product name)
    const isExcluded = NEWS_SECTION_RE.test(currentSection);
    if (!isExcluded && line.startsWith('|') && !line.includes('---|') && !/^\|\s*[-:]+/.test(line)) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const hasIdx = /^(?:\d+|[—–-]+)$/.test(cells[0]);
      const nameCell = hasIdx ? cells[1] : cells[0];
      if (cells.length >= 3 && nameCell && nameCell.startsWith('**')) {
        const name = nameCell.replace(/\*\*/g, '').trim();
        const rest = cells.slice(hasIdx ? 2 : 1);
        // Find longest text cell as description/tagline, others as rawMeta
        let detail = '';
        const metaParts = [];
        for (const c of rest) {
          if (!detail && c.length >= 16 && !/^\d+\s*\/\s*\d+$/.test(c)) {
            detail = c;
          } else {
            metaParts.push(c);
          }
        }
        if (!detail) detail = rest[rest.length - 1] || '';
        const rawMeta = metaParts.join(' · ');
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(rawMeta, detail);
        const item = {
          key,
          date,
          name,
          rawMeta,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          tagline: detail.split(/[；;——]/)[0].replace(/\*\*/g, '').trim(),
          description: detail.replace(/\*\*/g, '')
        };
        Object.assign(item, classifyProductType(item));
        items.push(item);
      }
    }

    if (
      currentSection.includes('重点产品') &&
      ((!currentSubCategory.includes('Hacker News') && !currentSubCategory.includes('Product Hunt')) ||
        (currentSubCategory.includes('BetaList') && line.includes('✅')))
    ) {
      const bMatch = line.match(/^-\s+\*\*([^*]+)\*\*(?:[（(]([^）)]+)[）)])?\s*[：:—-]+\s*(.+)$/);
      if (bMatch) {
        const name = bMatch[1].trim();
        if (
          ['判断', '一句话', '关键数字', '用法', '价格', '缓解', '定价与可用性', '背景', '核验来源', '是什么', '定价', '开放/私有', '安全', '关键发现', '可信度', '设计取舍诚实', '体积极小'].includes(name) ||
          name.startsWith('其余') ||
          name.startsWith('持续') ||
          name.startsWith('可信度') ||
          name.startsWith('基准')
        ) continue;
        const rawMeta = bMatch[2] || '';
        const detail = bMatch[3].trim();
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(rawMeta, detail);
        const item = {
          key,
          date,
          name,
          rawMeta,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          tagline: detail.split(/[；;。]/)[0].replace(/\*\*/g, '').trim(),
          description: detail.replace(/\*\*/g, '')
        };
        Object.assign(item, classifyProductType(item));
        items.push(item);
      }
    }
  }

  return { intro: sourceSummary, signals, items };
}

export function parseAnyBriefMarkdown(content, date) {
  // 1. Prefer structured JSON blocks if upstream agent emitted them
  const structuredItems = parseStructuredJsonBlocks(content, date);

  const isDetailedReport =
    content.includes('## 一、今日核心信号') ||
    content.includes('## 🧭 今日核心信号') ||
    content.includes('## 一、今日信号') ||
    content.includes('## 一、今日必看') ||
    content.includes('## 今日趋势') ||
    content.includes('## 二、重点产品') ||
    content.includes('## 三、亲自验证的重点产品') ||
    content.includes('## 🔬 亲自验证的重点产品') ||
    /###\s+(?:\d+\.\s*)?(?:[✅⚠️🔥]\s*)?[^#\n]+[（(]https?:\/\/[^）)]+[）)]\s*(?:——|--|—)/.test(content) ||
    /###\s+\d+\.\s+(?:[✅⚠️🔥]\s*)?\*?\*/.test(content);

  const primary = isDetailedReport
    ? parseDetailedBriefMarkdown(content, date)
    : parseListBriefMarkdown(content, date);

  if (structuredItems.length > 0) {
    return {
      intro: primary.intro,
      signals: primary.signals,
      items: structuredItems
    };
  }

  // Fallback: if primary mode returned 0 items, try the other parser before giving up
  if (primary.items.length === 0) {
    const fallback = isDetailedReport
      ? parseListBriefMarkdown(content, date)
      : parseDetailedBriefMarkdown(content, date);
    if (fallback.items.length > 0) {
      return {
        intro: primary.intro || fallback.intro,
        signals: primary.signals.length ? primary.signals : fallback.signals,
        items: fallback.items
      };
    }
  }

  return primary;
}
