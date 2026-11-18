import fs from 'node:fs';
import path from 'node:path';
import {
  getAllDates,
  getDayData,
  fetchGitHubDetails,
  fetchPageInfo,
  extractReadableFromHtml,
  findGithubRepoInHtml,
  cleanRepoSlug,
  extractMetaTag,
  stripTags,
  PRODUCT_TYPES,
  DELIVERY_LABELS,
  ENRICHED_FILE
} from './server.mjs';

const QWEN_ENDPOINT = process.env.QWEN_BASE_URL || 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen3.8-flash';
const LOCAL_QWEN_ENV = '/Users/alone/.local/share/claude-qwen-gateway/.env';

function loadQwenApiKey() {
  if (process.env.QWEN_API_KEY) return process.env.QWEN_API_KEY.trim();
  if (process.env.ALIYUN_TOKEN_PLAN_API_KEY) return process.env.ALIYUN_TOKEN_PLAN_API_KEY.trim();
  if (fs.existsSync(LOCAL_QWEN_ENV)) {
    const raw = fs.readFileSync(LOCAL_QWEN_ENV, 'utf-8');
    const m = raw.match(/^QWEN_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 2, date: '', limit: 0, force: false, concurrency: 4 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--days' && args[i + 1]) opts.days = parseInt(args[++i], 10) || 2;
    else if (a === '--date' && args[i + 1]) opts.date = args[++i];
    else if (a === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10) || 0;
    else if (a === '--concurrency' && args[i + 1]) opts.concurrency = Math.max(1, parseInt(args[++i], 10) || 4);
    else if (a === '--force') opts.force = true;
  }
  return opts;
}

function loadEnrichedStore() {
  try {
    if (fs.existsSync(ENRICHED_FILE)) {
      return JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf-8')) || {};
    }
  } catch {
    // ignore
  }
  return {};
}

function saveEnrichedStore(store) {
  fs.writeFileSync(ENRICHED_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

const DIRECTORY_DOMAINS = [
  'producthunt.com', 'betalist.com', 'news.ycombinator.com', 'duckduckgo.com',
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

async function searchDuckDuckGoForOfficialUrl(productName, tagline = '') {
  const shortKw = (tagline || '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
  const query = `"${productName}" ${shortKw} -site:producthunt.com -site:betalist.com`.trim();

  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const linkMatches = [...html.matchAll(/class="result__a"[^>]+href="([^"]+)"/gi)];
    for (const m of linkMatches) {
      let href = m[1];
      if (href.startsWith('//')) href = `https:${href}`;
      if (href.includes('duckduckgo.com/l/?')) {
        try {
          const u = new URL(href);
          const uddg = u.searchParams.get('uddg');
          if (uddg) href = decodeURIComponent(uddg);
        } catch { /* ignore */ }
      }
      if (/^https?:\/\//i.test(href) && !isDirectoryUrl(href)) {
        return href;
      }
    }
  } catch {
    // ignore search failure
  }
  return null;
}

async function searchGithubRepoByName(productName) {
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
      const repoNorm = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (repoNorm === normTarget && (item.stargazers_count || 0) >= 2) {
        return cleanRepoSlug(item.full_name);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function investigateProduct(product) {
  let directUrl = product.directUrl || (product.url && !isDirectoryUrl(product.url) ? product.url : null);
  let githubRepo = cleanRepoSlug(product.githubRepo);

  // 1. Resolve BetaList external link if needed
  if (!directUrl && product.url && product.url.includes('betalist.com/startups/')) {
    try {
      const page = await fetchPageInfo(product.url);
      if (page.ok && page.html) {
        const visitMatch =
          page.html.match(/href=["'](https?:\/\/[^"']+\?utm_source=betalist[^"']*)["']/i) ||
          page.html.match(/href=["'](\/startups\/[^"']+\/visit)["']/i);
        if (visitMatch) {
          if (visitMatch[1].startsWith('/')) {
            const vp = await fetchPageInfo(`https://betalist.com${visitMatch[1]}`);
            if (vp.finalUrl && !isDirectoryUrl(vp.finalUrl)) {
              directUrl = vp.finalUrl.replace(/\?utm_source=betalist.*$/, '');
            }
          } else {
            directUrl = visitMatch[1].replace(/\?utm_source=betalist.*$/, '');
          }
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Bypass Product Hunt Cloudflare or missing URL via Search + GitHub Search
  if (!directUrl && !githubRepo) {
    const foundUrl = await searchDuckDuckGoForOfficialUrl(product.name, product.tagline);
    if (foundUrl) {
      if (foundUrl.includes('github.com/')) {
        const gh = cleanRepoSlug(foundUrl.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1]);
        if (gh) githubRepo = gh;
      } else {
        directUrl = foundUrl;
      }
    }
    if (!githubRepo && (!directUrl || /开源|open\s*source|cli|mcp/i.test(`${product.tagline} ${product.description}`))) {
      const foundRepo = await searchGithubRepoByName(product.name);
      if (foundRepo) githubRepo = foundRepo;
    }
  }

  // 3. Scrape official website (non-GitHub)
  let siteTitle = '';
  let siteDesc = '';
  let siteText = '';
  if (directUrl && !directUrl.includes('github.com/')) {
    try {
      const page = await fetchPageInfo(directUrl);
      if (page.finalUrl && !isDirectoryUrl(page.finalUrl)) directUrl = page.finalUrl;
      if (page.ok && page.html) {
        siteTitle = extractMetaTag(page.html, 'property', 'og:title') || stripTags(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || '';
        siteDesc = extractMetaTag(page.html, 'property', 'og:description') || extractMetaTag(page.html, 'name', 'description') || '';
        const blocks = extractReadableFromHtml(page.html);
        siteText = blocks.map(b => b.text).join('\n').slice(0, 2600);
        if (!githubRepo) {
          const discovered = findGithubRepoInHtml(page.html);
          if (discovered) githubRepo = discovered;
        }
      }
    } catch { /* ignore */ }
  }

  // 4. Inspect GitHub repo & README
  let ghDetails = null;
  if (githubRepo) {
    ghDetails = await fetchGitHubDetails(githubRepo);
    if (ghDetails?.meta?.homepage && !directUrl && !isDirectoryUrl(ghDetails.meta.homepage)) {
      if (/^https?:\/\//i.test(ghDetails.meta.homepage)) {
        directUrl = ghDetails.meta.homepage.trim();
      }
    }
  }

  return {
    directUrl: directUrl || (githubRepo ? `https://github.com/${githubRepo}` : product.url || ''),
    githubRepo: githubRepo || null,
    stars: ghDetails?.meta?.stargazers_count != null ? String(ghDetails.meta.stargazers_count) : product.stars || null,
    license: ghDetails?.meta?.license || product.license || null,
    quickCommands: ghDetails?.installCommands?.length ? ghDetails.installCommands : (product.quickCommands || []),
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
你的任务是根据给出的产品线索、官网抓包文本与 GitHub README 信息，判断产品所属种类和交付形态，并撰写清晰的产品介绍与可落地的上手体验步骤。

必须严格返回合法 JSON 对象（不要输出任何多余解释或 Markdown 包裹），字段如下：
{
  "categoryType": "agent | devtools | productivity | models | vertical 中的一个",
  "deliveryForm": "github | web | desktop | api 中的一个",
  "deliveryLabel": "开源项目 | 在线网页 | 客户端/插件 | 模型/API 中与 deliveryForm 对应的一项",
  "pricingModel": "免费开源 | Freemium | 一次性买断 | 商业付费 | 免费可用 中的一个",
  "tagline": "精炼的一句话中文定位（不超过35字，不带感叹号）",
  "introduction": "2~3句客观、扎实的产品核心功能与实现机制介绍（严禁提及任何简报作者、来源平台排名或投票数）",
  "experienceGuide": [
    "步骤1：具体的上手或试玩入口说明（如访问官网点哪里/或运行哪条安装命令）",
    "步骤2：核心功能体验建议或注意事项"
  ],
  "defaultPort": 3000
}

分类标准：
- agent: AI Agent、Coding Agent、MCP Server、Agent Skill、工作流自动化、智能体护栏与记忆
- devtools: CLI工具、数据库、编译器、测试/Diff、运维沙箱、SDK/API基建、硬件开发工具
- productivity: 笔记、会议转写、任务日历、邮箱、Mac增强工具、浏览器插件、文档排版处理
- models: 独立基础模型、决策模型、TTS/ASR语音模型、视频/3D生成模型、量化器、arXiv论文与评测集
- vertical: 教育学习、金融量化/FOF、医疗健康、客服电商营销、游戏与创意娱乐

交付形态标准：
- github: 有开源 GitHub 仓库且主要通过克隆/本地运行/Codespace 体验
- web: 直接通过浏览器网页即可体验或使用的在线应用
- desktop: 需下载安装的桌面客户端（macOS/Windows/Linux）、移动 App 或浏览器扩展
- api: 模型权重发布、API 服务或研究论文`;

  const userPrompt = `产品名称：${product.name}
原始简报定位：${product.tagline || '无'}
原始简报补充：${product.description || '无'}
直达官网：${intel.directUrl || '未知'}
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
      max_tokens: 700,
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

  return {
    categoryType: validCategory,
    categoryLabel: PRODUCT_TYPES[validCategory].label,
    deliveryForm: validDelivery,
    deliveryLabel: DELIVERY_LABELS[validDelivery],
    pricingModel: parsed.pricingModel || product.pricingModel || null,
    tagline: parsed.tagline || product.tagline,
    introduction: parsed.introduction || product.description || product.tagline,
    experienceGuide: Array.isArray(parsed.experienceGuide) ? parsed.experienceGuide.slice(0, 4) : [],
    defaultPort: Number.isInteger(parsed.defaultPort) ? parsed.defaultPort : 3000
  };
}

async function main() {
  const opts = parseCliArgs();
  const apiKey = loadQwenApiKey();
  if (!apiKey) {
    console.error('ERROR: QWEN_API_KEY not found in env or local gateway config.');
    process.exit(1);
  }

  const allDates = getAllDates();
  const targetDates = opts.date ? [opts.date] : allDates.slice(0, opts.days);
  console.log(`Enrich Agent starting -> model: ${QWEN_MODEL}, dates: ${targetDates.join(', ')}`);

  const store = loadEnrichedStore();
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

  const tasks = opts.limit > 0 ? queue.slice(0, opts.limit) : queue;
  console.log(`Found ${queue.length} pending products; processing ${tasks.length} with concurrency=${opts.concurrency}...`);

  if (tasks.length === 0) {
    console.log('All target products are already enriched.');
    return;
  }

  let cursor = 0;
  let completed = 0;
  let failed = 0;

  async function worker(workerId) {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const product = tasks[idx];
      try {
        const intel = await investigateProduct(product);
        const synthesized = await synthesizeWithQwen(apiKey, product, intel);
        store[product.key] = {
          key: product.key,
          name: product.name,
          date: product.date,
          updatedAt: new Date().toISOString(),
          ...synthesized,
          directUrl: intel.directUrl,
          githubRepo: intel.githubRepo,
          stars: intel.stars,
          license: intel.license,
          quickCommands: intel.quickCommands
        };
        completed++;
        console.log(`[${completed + failed}/${tasks.length}] (w${workerId}) OK: ${product.name} -> ${synthesized.categoryLabel} | ${synthesized.deliveryLabel} | ${intel.githubRepo || intel.directUrl}`);
        if (completed % 5 === 0) saveEnrichedStore(store);
      } catch (e) {
        failed++;
        console.warn(`[${completed + failed}/${tasks.length}] (w${workerId}) FAIL: ${product.name} -> ${e.message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency, tasks.length) }, (_, i) => worker(i + 1))
  );

  saveEnrichedStore(store);
  console.log(`Enrich Agent finished. Success: ${completed}, Failed: ${failed}. Saved to ${ENRICHED_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
