import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MUSE_DIR = path.join(ROOT_DIR, '.muse-repo');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'user-state.json');
const INSPECT_CACHE_FILE = path.join(__dirname, '.inspect-cache.json');

// Ensure user-state.json exists
if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      items: {} // key: normalizedId -> { status: 'tried'|'stack'|'bookmark'|'skip', note: '', updatedAt: '' }
    }, null, 2),
    'utf-8'
  );
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

// Persistent disk + in-memory cache for /api/inspect
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
    // ignore corrupted cache
  }
}
function persistInspectCache() {
  try {
    const obj = {};
    // Keep up to 400 recent entries
    const entries = Array.from(urlResolveCache.entries()).slice(-400);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    fs.writeFileSync(INSPECT_CACHE_FILE, JSON.stringify(obj), 'utf-8');
  } catch {
    // ignore write errors
  }
}
loadInspectCache();

function normalizeProductKey(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

const GITHUB_RESERVED_OWNERS = new Set([
  'features', 'login', 'signup', 'join', 'about', 'pricing', 'enterprise',
  'topics', 'trending', 'explore', 'orgs', 'sponsors', 'marketplace', 'site',
  'security', 'customer-stories', 'solutions', 'resources', 'settings', 'notifications',
  'issues', 'pulls', 'codespaces', 'copilot', 'collections', 'events', 'blog', 'apps'
]);

function cleanRepoSlug(slug) {
  if (!slug) return null;
  const cleaned = slug.replace(/\.git$/, '').replace(/[),.;:]+$/, '');
  const parts = cleaned.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo || GITHUB_RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `${owner}/${repo}`;
}

// Extract GitHub owner/repo or URLs from raw parenthetical metadata and description
function extractLinksAndMeta(rawMeta, description = '') {
  const combined = `${rawMeta || ''} ${description || ''}`;
  let githubRepo = null;
  let directUrl = null;
  let stars = null;
  let license = null;
  const verified = combined.includes('✅');

  const starMatch =
    combined.match(/★\s*([0-9.]+k?)/i) ||
    combined.match(/([0-9.]+k?)\s*★/i) ||
    combined.match(/([0-9,]+)\s*stars/i);
  if (starMatch) {
    stars = starMatch[1];
  }

  const licMatch = combined.match(/\b(MIT(?:-0)?|Apache-2\.0|AGPL-3\.0|GPL-3\.0|BSD-[23]-Clause|MPL-2\.0)\b/i);
  if (licMatch) {
    license = licMatch[1];
  }

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
        !/^(10|11|12|0\d)\/\d+$/.test(tok) &&
        !/^(Win|Mac|Linux|iOS|Android|Claude|ChatGPT|HTML|CSS|JS|TS|AI|FOF|LLM|RAG|MCP|API)/i.test(tok)
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
    const domainRegex = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|ai|io|dev|app|org|net|sh|rs|xyz|fyi|live|email|finance|studio|tech|co|me|edu|gov|br|uk|de|jp|land)(?:\/[^\s，,。；;）)】]*)?)\b/gi;
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

// Strict 5-category Product Type Classification + Delivery Form
const PRODUCT_TYPES = {
  agent: {
    label: 'Agent 与自动化',
    keywords: [
      'agent', 'mcp', 'skill', 'claude code', 'codex', 'cursor', 'opencode',
      'harness', '多体', '编排', '护栏', '记忆', '替你打', '代办', 'errand',
      'workflow', '工作流', '自动化', 'sidecar', 'a2a', '智能体', '助手'
    ]
  },
  devtools: {
    label: '开发与基础设施',
    keywords: [
      'cli', 'rust', 'go ', '编译器', '数据库', 'sql', 'postgres', 'mysql',
      'zfs', 'git', 'docker', 'wasm', 'api', 'sdk', '测试', 'diff', '调试',
      '监控', '运维', '沙箱', '模拟', '单片机', 'kicad', '硬件', '安全', '扫描',
      'csv', 'ide', '终端', '部署', 'github', '代码', '开源框架', 'compiler', 'emulator'
    ]
  },
  models: {
    label: 'AI 模型与多模态',
    keywords: [
      '模型', 'llm', 'tts', 'asr', '语音识别', '配音', '生成模型', '视频生成',
      '3d', '决策模型', '量化器', 'gguf', '推理', 'arxiv', 'benchmark', '数据集',
      'omnimodal', 'speech-to-speech', '语音合成', '多模态'
    ]
  },
  productivity: {
    label: '效率与桌面工具',
    keywords: [
      '笔记', '会议', '转写', '转录', '任务', '待办', 'todo', '日历', '日程',
      '邮箱', '邮件', '收件箱', 'mac app', 'macos', '菜单栏', 'dock', '触控板',
      'chrome 扩展', 'chrome 插件', '浏览器', 'obsidian', 'markdown', 'docx',
      'pdf', '本体', '文档', '去 ai 腔', '去ai腔', '写作', '剪贴板', '录音'
    ]
  },
  vertical: {
    label: '垂直与行业应用',
    keywords: [
      '教育', '课程', '课堂', '学习', '抽认卡', '金融', '股票', '期权', '交易',
      '量化', '理财', '发票', '账单', '客服', '营销', 'seo', '电商', '健康',
      '医疗', '游戏', '解谜', '画笔', '像素', '投资', '基金', 'fof', '保险',
      '房地产', '影视', '相机', '摄影'
    ]
  }
};

function classifyProductType(item) {
  const titleAndTag = `${item.name || ''} ${item.tagline || ''}`.toLowerCase();
  const body = `${item.why || ''} ${item.agentAWhy || ''} ${item.rawMeta || ''}`.toLowerCase();

  const scores = { agent: 0, devtools: 0, models: 0, productivity: 0, vertical: 0 };

  for (const [typeKey, cfg] of Object.entries(PRODUCT_TYPES)) {
    for (const kw of cfg.keywords) {
      if (titleAndTag.includes(kw)) scores[typeKey] += 3;
      else if (body.includes(kw)) scores[typeKey] += 1;
    }
  }

  // Slight disambiguation: if it's an AI model release from Section A or explicitly "模型发布/arxiv"
  if (/\barxiv\b|official|官方发布|决策模型|视频生成|gguf|量化器/i.test(`${titleAndTag} ${item.rawMeta || ''}`)) {
    scores.models += 4;
  }
  // If it's a pure coding agent tool/harness/MCP
  if (/\bmcp\b|coding agent|agent harness|agent\s*记忆|agent\s*护栏|派\s*agent/i.test(titleAndTag)) {
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

  // Delivery form classification
  const fullText = `${titleAndTag} ${body}`;
  const url = item.directUrl || item.url || '';
  let deliveryForm = 'web';
  let deliveryLabel = 'Web 在线';
  let quickCommand = null;

  if (item.githubRepo || url.includes('github.com/')) {
    deliveryForm = 'github';
    deliveryLabel = 'GitHub 开源';
    const repo = item.githubRepo || cleanRepoSlug(url.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1]);
    if (repo) {
      item.githubRepo = repo;
      quickCommand = `gh repo clone ${repo}`;
    }
  } else if (
    fullText.includes('chrome 扩展') ||
    fullText.includes('chrome 插件') ||
    fullText.includes('浏览器扩展') ||
    fullText.includes('mac app') ||
    fullText.includes('macos') ||
    fullText.includes('不出 mac') ||
    fullText.includes('桌面端') ||
    fullText.includes('ios') ||
    fullText.includes('客户端')
  ) {
    deliveryForm = 'desktop';
    deliveryLabel = fullText.includes('chrome') ? '浏览器扩展' : '桌面 / 客户端';
  }

  const badges = [];
  if (fullText.includes('免费') || fullText.includes('free')) badges.push('免费可用');
  if (fullText.includes('开源') || item.license || item.githubRepo) badges.push(item.license || '开源');
  if (fullText.includes('本地') || fullText.includes('离线') || fullText.includes('local') || fullText.includes('无账号')) {
    badges.push('本地优先');
  }

  return {
    categoryType: bestType,
    categoryLabel: PRODUCT_TYPES[bestType].label,
    deliveryForm,
    deliveryLabel,
    type: deliveryForm,
    typeLabel: deliveryLabel,
    quickCommand,
    badges
  };
}

// Parse Muse markdown file
function parseMuseMarkdown(content, date) {
  const lines = content.split(/\r?\n/);
  let intro = '';
  let editorNote = '';
  const items = [];

  for (const line of lines.slice(1, 8)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      intro = trimmed;
      break;
    }
  }

  const noteIdx = lines.findIndex(l => l.trim().startsWith('注：') || l.trim().startsWith('> 注：'));
  if (noteIdx !== -1) {
    editorNote = lines.slice(noteIdx).join('\n').trim();
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    const m1 =
      line.match(/^\*\*(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)\*\*\s*(?:——|--|—|-|[：:])\s*(.+)$/) ||
      line.match(/^-\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*(?:——|--|—|-|[：:])\s*(.+)$/);
    if (m1) {
      const hasNum = m1.length === 5;
      const rank = hasNum ? parseInt(m1[1], 10) : items.length + 1;
      const name = (hasNum ? m1[2] : m1[1]).trim();
      const url = (hasNum ? m1[3] : m1[2]).trim();
      const tagline = (hasNum ? m1[4] : m1[3]).trim();
      let why = '';
      let source = '';

      while (i + 1 < lines.length) {
        const nextTrim = lines[i + 1].trim();
        if (nextTrim.startsWith('为什么有趣：')) {
          const body = nextTrim.replace(/^为什么有趣：/, '');
          const srcSplit = body.split(/来源：/);
          why = srcSplit[0].trim();
          if (srcSplit[1]) source = srcSplit[1].trim();
          i++;
        } else if (nextTrim.startsWith('来源：')) {
          source = nextTrim.replace(/^来源：/, '').trim();
          i++;
        } else {
          break;
        }
      }

      const meta = extractLinksAndMeta(url, `${tagline} ${why}`);
      const item = {
        id: `${date}-muse-${normalizeProductKey(name)}`,
        key: normalizeProductKey(name),
        date,
        name,
        url,
        directUrl: !url.includes('producthunt.com') && !url.includes('betalist.com') ? url : meta.directUrl,
        githubRepo: meta.githubRepo,
        stars: meta.stars,
        license: meta.license,
        tagline,
        why,
        source: source || 'Muse 精选',
        fromMuse: true,
        fromAgentA: false,
        museRank: rank
      };
      Object.assign(item, classifyProductType(item));
      items.push(item);
      i++;
      continue;
    }

    const m2 = line.match(/^\*\*([^*]+)\*\*[（(](https?:\/\/[^）)]+)[）)]$/);
    if (m2) {
      const name = m2[1].trim();
      const url = m2[2].trim();
      let tagline = '';
      let why = '';
      let source = '';
      if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('为什么有趣：')) {
        tagline = lines[i + 1].trim();
        i++;
      }
      if (i + 1 < lines.length && lines[i + 1].trim().startsWith('为什么有趣：')) {
        const nextLine = lines[i + 1].trim().replace(/^为什么有趣：/, '');
        const srcSplit = nextLine.split(/来源：/);
        why = srcSplit[0].trim();
        if (srcSplit[1]) source = srcSplit[1].trim().replace(/。$/, '');
        i++;
      }
      const meta = extractLinksAndMeta(url, `${tagline} ${why}`);
      const item = {
        id: `${date}-muse-${normalizeProductKey(name)}`,
        key: normalizeProductKey(name),
        date,
        name,
        url,
        directUrl: !url.includes('producthunt.com') && !url.includes('betalist.com') ? url : meta.directUrl,
        githubRepo: meta.githubRepo,
        stars: meta.stars,
        license: meta.license,
        tagline,
        why,
        source: source || 'Muse 精选',
        fromMuse: true,
        fromAgentA: false,
        museRank: items.length + 1
      };
      Object.assign(item, classifyProductType(item));
      items.push(item);
      i++;
      continue;
    }

    i++;
  }

  return { intro, editorNote, items };
}

// Parse Agent A markdown file (without chenTips / chenTopic)
function parseAgentAMarkdown(content, date) {
  const lines = content.split(/\r?\n/);
  const signals = [];
  const items = [];
  let sourceSummary = '';

  let currentSection = '';
  let currentSubCategory = '精选核实';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('> 数据来源：')) {
      sourceSummary = line.replace(/^>\s*/, '');
    }
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s+/, '');
      continue;
    }
    if (currentSection.includes('今日核心信号') || currentSection.includes('今日信号')) {
      const sigMatch = line.match(/^\d+\.\s+\*\*([^*]+)\*\*[：:]\s*(.+)$/);
      if (sigMatch) {
        signals.push({
          title: sigMatch[1].trim(),
          detail: sigMatch[2].trim()
        });
      }
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
      const h3ProdMatch = rawSub.match(/^(?:[✅⚠️]\s*|\d+\.\s*)([^（(—-]+?)(?:[（(]([^）)]+)[）)])?\s*[—-]+\s*(.+)$/);
      if (currentSection.includes('重点产品') && h3ProdMatch && !/^[A-Z]\.\s/.test(rawSub)) {
        const name = h3ProdMatch[1].trim();
        const rawMeta = h3ProdMatch[2] || '';
        const taglineRaw = h3ProdMatch[3].trim();
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(`${rawMeta} ${taglineRaw}`, '');
        activeNumberedItem = {
          id: `${date}-agenta-${key}`,
          key,
          date,
          name,
          rawMeta: rawMeta || taglineRaw,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          verified: true,
          tagline: taglineRaw.replace(/^真实[，,\s]*/, '').trim(),
          why: '',
          fromMuse: false,
          fromAgentA: true
        };
        Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
        items.push(activeNumberedItem);
        continue;
      }

      currentSubCategory = rawSub.replace(/^[A-Z]\.\s*/, '').replace(/（.*）/, '').trim();
      activeNumberedItem = null;
      continue;
    }

    if (!currentSection.includes('重点产品')) continue;

    const numBlockMatch = line.match(/^\*\*\d+\.\s*([^（(—-]+?)(?:[（(]([^）)]+)[）)])?\s*[—-]+\s*(.+?)\*\*$/);
    if (numBlockMatch) {
      const name = numBlockMatch[1].trim();
      const rawMeta = numBlockMatch[2] || '';
      const taglineRaw = numBlockMatch[3].trim();
      const key = normalizeProductKey(name);
      const meta = extractLinksAndMeta(`${rawMeta} ${taglineRaw}`, '');
      activeNumberedItem = {
        id: `${date}-agenta-${key}`,
        key,
        date,
        name,
        rawMeta: rawMeta || taglineRaw,
        url: meta.directUrl || '',
        directUrl: meta.directUrl,
        githubRepo: meta.githubRepo,
        stars: meta.stars,
        license: meta.license,
        verified: true,
        tagline: taglineRaw.replace(/（✅[^）]*）/, '').trim(),
        why: '',
        fromMuse: false,
        fromAgentA: true
      };
      Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
      items.push(activeNumberedItem);
      continue;
    }

    if (activeNumberedItem && line.startsWith('- ')) {
      const subText = line.replace(/^-\s*(\*\*[^*]+\*\*|一句话|关键数字|定价与可用性|用法|价格|缓解)[：:]\s*/, '').replace(/\*\*/g, '');
      activeNumberedItem.why = activeNumberedItem.why
        ? `${activeNumberedItem.why} | ${subText}`
        : subText;
      const moreMeta = extractLinksAndMeta(activeNumberedItem.rawMeta, activeNumberedItem.why);
      activeNumberedItem.githubRepo = activeNumberedItem.githubRepo || moreMeta.githubRepo;
      activeNumberedItem.directUrl = activeNumberedItem.directUrl || moreMeta.directUrl;
      activeNumberedItem.stars = activeNumberedItem.stars || moreMeta.stars;
      activeNumberedItem.license = activeNumberedItem.license || moreMeta.license;
      if (activeNumberedItem.directUrl) activeNumberedItem.url = activeNumberedItem.directUrl;
      Object.assign(activeNumberedItem, classifyProductType(activeNumberedItem));
      continue;
    }

    if (line.startsWith('|') && !line.includes('---|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3 && cells[0].startsWith('**')) {
        const name = cells[0].replace(/\*\*/g, '').trim();
        const rawMeta = cells[1];
        const detail = cells[2];
        const key = normalizeProductKey(name);
        const meta = extractLinksAndMeta(rawMeta, detail);
        const item = {
          id: `${date}-agenta-${key}`,
          key,
          date,
          name,
          rawMeta,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          verified: meta.verified,
          tagline: detail.split(/[；;——]/)[0].replace(/\*\*/g, '').trim(),
          why: detail.replace(/\*\*/g, ''),
          fromMuse: false,
          fromAgentA: true
        };
        Object.assign(item, classifyProductType(item));
        items.push(item);
      }
    }

    if (
      (!currentSubCategory.includes('Hacker News') && !currentSubCategory.includes('Product Hunt')) ||
      (currentSubCategory.includes('BetaList') && line.includes('✅'))
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
          id: `${date}-agenta-${key}`,
          key,
          date,
          name,
          rawMeta,
          url: meta.directUrl || '',
          directUrl: meta.directUrl,
          githubRepo: meta.githubRepo,
          stars: meta.stars,
          license: meta.license,
          verified: meta.verified,
          tagline: detail.split(/[；;。]/)[0].replace(/\*\*/g, '').trim(),
          why: detail.replace(/\*\*/g, ''),
          fromMuse: false,
          fromAgentA: true
        };
        Object.assign(item, classifyProductType(item));
        items.push(item);
      }
    }
  }

  return { sourceSummary, signals, items };
}

// Merge Muse and Agent A for a single date
function getDayData(date) {
  const agentAPath = path.join(ROOT_DIR, `今日产品简报-${date}.md`);
  const musePath = path.join(MUSE_DIR, `brief_${date}.md`);

  const hasAgentA = fs.existsSync(agentAPath);
  const hasMuse = fs.existsSync(musePath);

  const agentARaw = hasAgentA ? fs.readFileSync(agentAPath, 'utf-8') : '';
  const museRaw = hasMuse ? fs.readFileSync(musePath, 'utf-8') : '';

  const agentA = hasAgentA ? parseAgentAMarkdown(agentARaw, date) : { sourceSummary: '', signals: [], items: [] };
  const muse = hasMuse ? parseMuseMarkdown(museRaw, date) : { intro: '', editorNote: '', items: [] };

  const mergedMap = new Map();

  for (const mItem of muse.items) {
    mergedMap.set(mItem.key, { ...mItem });
  }

  for (const aItem of agentA.items) {
    let matchedKey = mergedMap.has(aItem.key) ? aItem.key : null;
    if (!matchedKey) {
      for (const existingKey of mergedMap.keys()) {
        if (
          (existingKey.length >= 4 && aItem.key.startsWith(existingKey)) ||
          (aItem.key.length >= 4 && existingKey.startsWith(aItem.key))
        ) {
          matchedKey = existingKey;
          break;
        }
      }
    }

    if (matchedKey) {
      const existing = mergedMap.get(matchedKey);
      existing.fromAgentA = true;
      existing.consensus = true;
      existing.agentAWhy = aItem.why;
      existing.rawMeta = aItem.rawMeta || existing.rawMeta;
      existing.githubRepo = existing.githubRepo || aItem.githubRepo;
      existing.directUrl = existing.directUrl || aItem.directUrl;
      if (!existing.url && aItem.url) existing.url = aItem.url;
      existing.stars = existing.stars || aItem.stars;
      existing.license = existing.license || aItem.license;
      Object.assign(existing, classifyProductType(existing));
    } else {
      mergedMap.set(aItem.key, { ...aItem, consensus: false });
    }
  }

  const state = loadState();
  const products = Array.from(mergedMap.values()).map(p => {
    const userEntry = state.items[p.key] || null;
    return {
      ...p,
      userStatus: userEntry?.status || null,
      userNote: userEntry?.note || '',
      userUpdatedAt: userEntry?.updatedAt || null
    };
  });

  // Sort: Consensus first -> Muse curated -> GitHub / Direct URL -> others
  products.sort((a, b) => {
    const score = (x) =>
      (x.consensus ? 1000 : 0) +
      (x.fromMuse ? 500 - (x.museRank || 0) : 0) +
      (x.githubRepo ? 150 : 0) +
      (x.directUrl ? 100 : 0);
    return score(b) - score(a);
  });

  return {
    date,
    hasAgentA,
    hasMuse,
    museIntro: muse.intro,
    museEditorNote: muse.editorNote,
    sourceSummary: agentA.sourceSummary,
    signals: agentA.signals,
    products,
    raw: {
      agentA: agentARaw,
      muse: museRaw
    }
  };
}

function getAllDates() {
  const dates = new Set();
  if (fs.existsSync(ROOT_DIR)) {
    for (const f of fs.readdirSync(ROOT_DIR)) {
      const m = f.match(/^今日产品简报-(\d{4}-\d{2}-\d{2})\.md$/);
      if (m) dates.add(m[1]);
    }
  }
  if (fs.existsSync(MUSE_DIR)) {
    for (const f of fs.readdirSync(MUSE_DIR)) {
      const m = f.match(/^brief_(\d{4}-\d{2}-\d{2})\.md$/);
      if (m) dates.add(m[1]);
    }
  }
  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

// Helper: Extract clean install/run commands from README markdown
function extractQuickCommands(readmeText, safeRepo = '') {
  const cmdMatches = [];
  const codeBlocks = [...readmeText.matchAll(/```(?:bash|sh|zsh|shell|console|cmd)?\r?\n([\s\S]*?)```/gi)];
  for (const block of codeBlocks) {
    const lines = block[1]
      .split(/\r?\n/)
      .map(l => l.trim().replace(/^\$\s+/, ''))
      .filter(l =>
        /^(npx |npm (i|install|exec|create)|pnpm |bunx |bun |uvx |uv |pip3? install|pipx |brew install|cargo install|go install|docker (run|compose)|curl .*\|.*sh|git clone |claude |codex )/i.test(l)
      );
    for (let l of lines) {
      if (safeRepo && /<repository[-_]url>|<repo[-_]url>/i.test(l)) {
        l = l.replace(/<repository[-_]url>|<repo[-_]url>/gi, `https://github.com/${safeRepo}.git`);
      }
      if (!cmdMatches.includes(l) && cmdMatches.length < 6) {
        cmdMatches.push(l);
      }
    }
  }
  return cmdMatches;
}

// Helper: Fetch GitHub metadata & full README via user token, gh CLI (authenticated), or raw HTTP fallback
async function fetchGitHubDetails(repo, userToken = '') {
  const safeRepo = cleanRepoSlug(repo);
  if (!safeRepo) return null;

  let repoMeta = null;
  let readmeText = null;
  let readmeDownloadUrl = null;
  let readmeHtmlUrl = null;

  if (userToken) {
    const authHeaders = {
      'User-Agent': 'Daily-Product-Workbench',
      'Authorization': `Bearer ${userToken}`,
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
      // fall through to gh CLI / raw fallback
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
          // try next branch
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

// Check if X-Frame-Options / CSP blocks embedding in http://127.0.0.1:4321
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

// Extract clean readable summary blocks from HTML page
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

  // 1. Resolve BetaList / Product Hunt wrapper URLs first
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

  // 2. If we have a GitHub repo, fetch its full metadata & README via token or gh api
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

  // 3. Determine primary web page URL to inspect (skip GitHub page itself & Cloudflare-blocked PH wrapper)
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

        // Discover GitHub repo from the official website if not known yet
        if (!discoveredRepo) {
          const foundRepo = findGithubRepoInHtml(page.html);
          if (foundRepo) {
            discoveredRepo = foundRepo;
            githubDetails = await fetchGitHubDetails(discoveredRepo, userToken);
          }
        }
      }
    } catch {
      // ignore webpage timeout
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

  // API: list all dates & global stats
  if (pathname === '/api/days' && req.method === 'GET') {
    const dates = getAllDates();
    const state = loadState();
    const daysSummary = dates.map(d => {
      const hasAgentA = fs.existsSync(path.join(ROOT_DIR, `今日产品简报-${d}.md`));
      const hasMuse = fs.existsSync(path.join(MUSE_DIR, `brief_${d}.md`));
      return { date: d, hasAgentA, hasMuse };
    });

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

  // API: get single day data
  if (pathname.startsWith('/api/day/') && req.method === 'GET') {
    const date = pathname.replace('/api/day/', '');
    const data = getDayData(date);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return;
  }

  // API: global search & type-based explore across all days
  if (pathname === '/api/explore' && req.method === 'GET') {
    const type = urlObj.searchParams.get('type') || 'all'; // all | agent | devtools | productivity | models | vertical
    const form = urlObj.searchParams.get('form') || 'all'; // all | consensus | muse | github
    const status = urlObj.searchParams.get('status') || 'all'; // all | stack | tried
    const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
    const limit = parseInt(urlObj.searchParams.get('limit') || '160', 10);

    const dates = getAllDates();
    const matched = [];
    for (const d of dates) {
      const dayData = getDayData(d);
      for (const p of dayData.products) {
        if (type !== 'all' && p.categoryType !== type) continue;
        if (form === 'consensus' && !p.consensus) continue;
        if (form === 'muse' && !p.fromMuse) continue;
        if (form === 'github' && !p.githubRepo) continue;
        if (status === 'stack' && p.userStatus !== 'stack') continue;
        if (status === 'tried' && p.userStatus !== 'tried' && p.userStatus !== 'stack') continue;

        if (q) {
          const hay = `${p.name} ${p.tagline || ''} ${p.why || ''} ${p.agentAWhy || ''} ${p.categoryLabel || ''} ${p.githubRepo || ''}`.toLowerCase();
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

  // API: resolve product workbench details (README via token or gh api, install commands, OG tags, canEmbed)
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

  // API: local proxy to embed websites that send X-Frame-Options / CSP frame-ancestors
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
        // Strip meta CSP frame-ancestors if present
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

  // API: update user state (tried / stack / bookmark / note)
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

  // API: launch local macOS Terminal.app and clone repository into /tmp/dpb-sandbox
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

  // API: sync Muse repo via git pull
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

  // Serve static files from PUBLIC_DIR
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
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

export { getAllDates, getDayData, ROOT_DIR, MUSE_DIR, PUBLIC_DIR };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) {
  const PORT = process.env.PORT || 4321;
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Daily Product Playground running at http://127.0.0.1:${PORT}`);
  });
}
