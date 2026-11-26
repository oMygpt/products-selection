// Weekly data-quality report → Markdown (posted as a GitHub issue by .github/workflows/quality-weekly.yml).
//
// 1. Rule checks (always, free): coverage, suspicious names, link-less items, vague guides,
//    retry queue, thin issues, near-duplicates.
// 2. Optional LLM review of a sample of recently enriched products. Provider order:
//    Copilot CLI (COPILOT_GITHUB_TOKEN) → Qwen (QWEN_API_KEY) → skipped.
//
// Usage: node playground/quality-report.mjs [--out report.md] [--sample 25] [--no-llm]
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'public', 'data');
const execFileAsync = promisify(execFile);

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
};
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const esc = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const siteLink = key => `[${key}](https://picks.chunlin.ch/#/product/${encodeURIComponent(key)})`;

export const VAGUE_GUIDE_RE = /^(?:重点)?(?:浏览|阅读|了解|查看(?:官网|文档|介绍))|根据\s*README[^，。]{0,12}(?:配置|启动|运行)|按照(?:官方)?(?:文档|README)(?:说明)?(?:进行)?(?:配置|安装)|体验(?:其)?(?:核心)?功能$/;
const HN_PREFIX_RE = /^(?:show|launch|ask)\s+hn\b/i;
const SENTENCE_START_RE = /^(?:a|an|the|i|my|we|how|why|what)\s/i;
// A concrete action anywhere in the step means it is a real task, even if it starts with 浏览/阅读
const ACTION_RE = /尝试|试着|创建|新建|生成|运行|执行|输入|上传|提交|点击|编写|写一个|部署|安装|配置一个|对比|测量|记录|完成|发送|导出|构建/;

export function looksSuspiciousName(name = '') {
  const n = String(name).trim();
  if (!n) return '空名称';
  if (n.length > 40) return '名称过长（像标题）';
  if (HN_PREFIX_RE.test(n)) return '带 HN 前缀';
  if (SENTENCE_START_RE.test(n) && n.split(/\s+/).length >= 5) return '像一句标题';
  if (n.split(/\s+/).length >= 6) return '单词过多（像一句话）';
  if (/[：:]\s*\S/.test(n) && n.length > 18) return '含冒号说明';
  return null;
}

export function isVagueGuide(steps) {
  if (!Array.isArray(steps) || steps.length < 2) return '缺少上手步骤';
  const last = String(steps.at(-1) || '').replace(/^步骤\s*\d+\s*[：:]\s*/, '').trim();
  if (last.length < 14) return '最后一步过短';
  if (VAGUE_GUIDE_RE.test(last) && !ACTION_RE.test(last)) return '最后一步没有具体任务';
  return null;
}

export function ruleChecks({ explore, products, failed, days }) {
  const items = explore.items || [];
  const findings = {};
  const total = items.length;
  const enriched = items.filter(p => p.enriched).length;
  const verifiedCost = items.filter(p => p.trialCost?.verified).length;

  findings.coverage = {
    total,
    enriched,
    verifiedCost,
    instant: items.filter(p => p.trialCost?.level === 'instant').length,
    hardware: items.filter(p => p.trialCost?.level === 'hardware').length
  };

  findings.suspicious = items
    .map(p => ({ p, why: looksSuspiciousName(p.name) }))
    .filter(x => x.why)
    .slice(0, 30);

  findings.noLink = items
    .filter(p => !(p.directUrl || p.url || p.githubRepo))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  findings.vague = products
    .filter(p => p.enriched)
    .map(p => ({ p, why: isVagueGuide(p.experienceGuide) }))
    .filter(x => x.why)
    .sort((a, b) => String(b.p.lastSeen || b.p.date).localeCompare(String(a.p.lastSeen || a.p.date)));

  const failedEntries = Object.entries(failed || {});
  findings.failed = {
    total: failedEntries.length,
    exhausted: failedEntries.filter(([, v]) => (v.attempts || 0) >= 3),
    transient: failedEntries.filter(([, v]) => v.transient).length,
    byError: Object.entries(failedEntries.reduce((acc, [, v]) => {
      const k = String(v.lastError || '').slice(0, 60) || '(无信息)';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  };

  findings.thinDays = (days.days || []).slice(0, 7)
    .filter(d => d.briefCount > 0 && (d.productCount ?? 0) < 5);

  // Near-duplicates: same name ignoring case/spaces/punctuation but different keys
  const byNorm = new Map();
  for (const p of items) {
    const norm = String(p.name).toLowerCase().replace(/[^a-z0-9一-龥]/g, '');
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(p);
  }
  findings.duplicates = [...byNorm.values()].filter(list => new Set(list.map(p => p.key)).size > 1).slice(0, 15);
  return findings;
}

// ---------- optional LLM review ----------
const REVIEW_PROMPT = `你是「每日产品体验台」的数据质检员。下面是一组已经由 Agent 查验过的产品条目（JSON）。
逐条判断并只返回 JSON 数组，不要任何其它文字。每个元素：
{"key": "...", "issues": ["not_a_product" | "vague_guide" | "wrong_trial" | "wrong_category" | "bad_name"], "note": "一句话中文说明（20字内）"}
判断标准：
- not_a_product：新闻、公告、融资、观点文章、榜单本身，而不是一个能试用的产品/项目
- vague_guide：上手步骤没有「做成一件具体的事」，如只写浏览官网、按 README 配置
- wrong_trial：trialCost.level 与描述明显矛盾（如需要硬件却标直玩、网页产品标本地安装）
- wrong_category / bad_name：分类或名称明显不对
没有问题的条目不要输出。`;

function buildReviewPayload(sample) {
  return sample.map(p => ({
    key: p.key,
    name: p.name,
    tagline: p.tagline,
    category: p.categoryLabel,
    deliveryForm: p.deliveryForm,
    trialCost: p.trialCost ? { level: p.trialCost.level, minutes: p.trialCost.minutes } : null,
    guide: (p.experienceGuide || []).slice(0, 3),
    url: p.directUrl || p.url || (p.githubRepo ? `https://github.com/${p.githubRepo}` : '')
  }));
}

export function parseReview(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const list = JSON.parse(match[0]);
    return Array.isArray(list)
      ? list.filter(x => x && typeof x.key === 'string' && Array.isArray(x.issues) && x.issues.length)
      : null;
  } catch {
    return null;
  }
}

async function reviewWithCopilot(prompt) {
  const bin = process.env.COPILOT_BIN || 'copilot';
  const args = ['-p', prompt, '-s', '--no-color'];
  if (process.env.COPILOT_MODEL) args.push('--model', process.env.COPILOT_MODEL);
  const { stdout } = await execFileAsync(bin, args, {
    env: process.env,
    timeout: 240_000,
    maxBuffer: 8 * 1024 * 1024
  });
  return stdout;
}

async function reviewWithQwen(prompt) {
  const endpoint = process.env.QWEN_BASE_URL || 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.QWEN_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.QWEN_REVIEW_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash',
      enable_thinking: false,
      temperature: 0,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!res.ok) throw new Error(`Qwen HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function llmReview(products, sampleSize) {
  const recent = products
    .filter(p => p.enriched)
    .sort((a, b) => String(b.lastSeen || b.date).localeCompare(String(a.lastSeen || a.date)))
    .slice(0, sampleSize);
  if (!recent.length) return { provider: null, sampled: 0, flagged: [] };
  const prompt = `${REVIEW_PROMPT}\n\n${JSON.stringify(buildReviewPayload(recent))}`;
  const providers = [];
  if (process.env.COPILOT_GITHUB_TOKEN) providers.push(['Copilot CLI', reviewWithCopilot]);
  if (process.env.QWEN_API_KEY) providers.push(['Qwen', reviewWithQwen]);
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const flagged = parseReview(await fn(prompt));
      if (flagged) return { provider: name, sampled: recent.length, flagged, errors };
      errors.push(`${name}: 返回内容无法解析为 JSON`);
    } catch (e) {
      errors.push(`${name}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  return { provider: null, sampled: recent.length, flagged: [], errors };
}

// ---------- report ----------
export function renderReport({ week, findings, review, generatedAt }) {
  const f = findings;
  const c = f.coverage;
  const lines = [];
  lines.push(`# 数据质检 · ${week}`, '');
  lines.push(`> 自动生成于 ${generatedAt}。规则检查每周运行；勾选或关闭本 Issue 不会影响站点。想让 Copilot 动手修，可以把本 Issue 指派给 Copilot（会消耗 Copilot 额度并开一个 PR 供审核）。`, '');
  lines.push('## 概览', '');
  lines.push('| 指标 | 数值 |', '|---|---|');
  lines.push(`| 产品总数 | ${c.total} |`);
  lines.push(`| 已查验（enriched） | ${c.enriched}（${pct(c.enriched, c.total)}） |`);
  lines.push(`| 试用成本已查验 | ${c.verifiedCost}（${pct(c.verifiedCost, c.total)}） |`);
  lines.push(`| 免注册直玩 / 需特定硬件 | ${c.instant} / ${c.hardware} |`);
  lines.push(`| 重试队列（耗尽 3 次 / 临时错误） | ${f.failed.total}（${f.failed.exhausted.length} / ${f.failed.transient}） |`);
  lines.push(`| 无任何链接的条目 | ${f.noLink.length} |`);
  lines.push(`| 上手步骤空泛（已查验条目中） | ${f.vague.length} |`, '');

  if (f.thinDays.length) {
    lines.push('## ⚠️ 最近 7 天产品偏少的刊期', '', '可能是上游简报改了格式，或解析规则没覆盖到。', '');
    for (const d of f.thinDays) lines.push(`- ${d.date}：${d.productCount ?? 0} 款（${d.briefCount} 份简报）`);
    lines.push('');
  }

  if (review) {
    lines.push('## LLM 抽检', '');
    if (review.provider) {
      lines.push(`抽检最近 ${review.sampled} 个已查验条目，模型：**${review.provider}**，标出 ${review.flagged.length} 条。`, '');
      if (review.flagged.length) {
        lines.push('| 产品 | 问题 | 说明 |', '|---|---|---|');
        for (const x of review.flagged) lines.push(`| ${siteLink(x.key)} | ${x.issues.join(', ')} | ${esc(x.note || '')} |`);
        lines.push('');
      }
    } else {
      lines.push(`未运行（${review.errors?.length ? review.errors.join('；') : '没有配置 COPILOT_GITHUB_TOKEN 或 QWEN_API_KEY'}）。`, '');
    }
  }

  const section = (title, rows, render, max = 15) => {
    if (!rows.length) return;
    lines.push(`## ${title}（${rows.length}）`, '');
    for (const r of rows.slice(0, max)) lines.push(render(r));
    if (rows.length > max) lines.push(`- …另有 ${rows.length - max} 条`);
    lines.push('');
  };
  section('可疑名称', f.suspicious, ({ p, why }) => `- [ ] ${siteLink(p.key)} 「${esc(p.name)}」— ${why}`);
  section('上手步骤空泛', f.vague, ({ p, why }) => `- [ ] ${siteLink(p.key)} ${esc(p.name)} — ${why}：「${esc(String((p.experienceGuide || []).at(-1) || '').slice(0, 60))}」`, 12);
  section('疑似重复', f.duplicates, list => `- [ ] ${list.map(p => `${siteLink(p.key)}（${p.date}）`).join(' ↔ ')}`, 10);
  section('最近无链接的条目', f.noLink, p => `- ${p.date} ${esc(p.name)}`, 10);
  if (f.failed.total) {
    lines.push(`## 重试队列（${f.failed.total}）`, '');
    for (const [err, n] of f.failed.byError) lines.push(`- ${n} 条：\`${esc(err)}\``);
    if (f.failed.exhausted.length) {
      lines.push('', `已耗尽 3 次重试、不再自动处理的：${f.failed.exhausted.slice(0, 15).map(([k]) => siteLink(k)).join('、')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const explore = readJson(path.join(DATA, 'explore.json'), null);
  if (!explore) throw new Error('public/data/explore.json missing — run build-static first');
  const productDir = path.join(DATA, 'products');
  const products = fs.readdirSync(productDir).filter(f => f.endsWith('.json')).map(f => readJson(path.join(productDir, f), null)).filter(Boolean);
  const findings = ruleChecks({
    explore,
    products,
    failed: readJson(path.join(HERE, '.enrich-failed.json'), {}),
    days: readJson(path.join(DATA, 'days.json'), { days: [] })
  });
  const review = args.includes('--no-llm') ? null : await llmReview(products, Number(opt('--sample')) || 25);
  const report = renderReport({ week: isoWeek(), findings, review, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' });
  const out = opt('--out');
  if (out) fs.writeFileSync(out, report, 'utf-8');
  else process.stdout.write(report + '\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
