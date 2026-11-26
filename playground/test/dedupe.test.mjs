import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnyBriefMarkdown, parseListBriefMarkdown, cleanProductName, isNonProductEntry } from '../lib/parser.mjs';
import { getDayDataFromBriefs } from '../server.mjs';

test('cleanProductName strips HN prefixes and splits "Name – tagline"', () => {
  assert.deepEqual(cleanProductName('Show HN: Lmux – Lightweight macOS Terminal for Claude Code'), {
    name: 'Lmux',
    tagline: 'Lightweight macOS Terminal for Claude Code'
  });
  assert.deepEqual(cleanProductName('Memorilla：Latent Semantic Memory for LLMs'), {
    name: 'Memorilla',
    tagline: 'Latent Semantic Memory for LLMs'
  });
  assert.equal(cleanProductName('Realtime sync engine without any new infra (tandem)').name, 'tandem');
  // Short, normal names are left alone
  assert.deepEqual(cleanProductName('MyClaw 3.0'), { name: 'MyClaw 3.0', tagline: '' });
});

test('isNonProductEntry flags paid placement rows', () => {
  assert.equal(isNonProductEntry({ name: 'Boosted 付费位' }), true);
  assert.equal(isNonProductEntry({ name: 'Glassmail' }), false);
});

test('HN front-page news tables are not parsed as products', () => {
  const md = [
    '# 今日产品简报 · 2026-11-07',
    '## 一、今日核心信号',
    '1. **信号**：多代理指挥台升温',
    '## 二、重点产品（亲自验证）',
    '| # | 产品 | 一句话 | 链接 |',
    '|---|---|---|---|',
    '| 1 | **crystl** | 专为 CLI agent 设计的 Mac 终端，支持 worktree 隔离 | https://crystl.dev |',
    '## 🌐 Hacker News 首页重点（取产品 / AI 发布 / 技术向）',
    '| 赞 | 条目 | 说明 | 核实 |',
    '|----|------|------|------|',
    '| 161 | **Anthropic IPO buyers see valuation as low as $1.1T** | 宏观弱信号，与产品无关 | ✓ |'
  ].join('\n');
  const names = parseAnyBriefMarkdown(md, '2026-11-07').items.map(i => i.name);
  assert.ok(names.includes('crystl'));
  assert.ok(!names.some(n => n.includes('Anthropic IPO')));
});

test('table rows with "—" index and "一句话 | 评论/赞 | 备注" column order are parsed', () => {
  const md = [
    '# 今日产品简报 · 2026-09-19',
    '## 一、Product Hunt（美西 9-18 日榜）',
    '| # | 产品 | 一句话 | 评论/赞 | 备注 |',
    '|---|------|--------|---------|------|',
    '| 1 | **Ami AI** | 用 GPT-6 Astra 做会思考的反向获客 AI SDR | 167 / 419 | ✓真实·闭源 SaaS |',
    '| — | **Replay（Boosted）** | 自主应用测试，给快速发布团队的 QA 蜂群 | 93 / 437 | 付费赞助块 |'
  ].join('\n');
  const items = parseListBriefMarkdown(md, '2026-09-19').items;
  const ami = items.find(i => i.name === 'Ami AI');
  assert.ok(ami, 'Ami AI should be parsed');
  assert.match(ami.tagline, /反向获客/);
  assert.ok(items.some(i => i.name.startsWith('Replay')), 'dash-index row keeps its product name');
  assert.ok(!items.some(i => i.name === '—'));
});

test('day merge: no short-prefix swallowing, but same repo / same site merges', () => {
  const brief = name => ({ name, content: '' });
  const a = [
    '# 每日新产品简报 · 2026-11-26',
    '1. **[Open](https://open.example.com)** —— 一个叫 Open 的笔记应用，本地优先',
    '2. **[OpenClaw Cloud](https://openclaw.ai)** —— 托管 OpenClaw 的云端 Agent 平台',
    '3. **[Fleetify](https://github.com/fleetifydev/fleetify)** —— 开源 coding agent 指挥中心'
  ].join('\n');
  const b = [
    '# 每日新产品简报 · 2026-11-26',
    '1. **[Show HN: Fleetify Desktop – run 10 agents side by side](https://github.com/fleetifydev/fleetify)** —— 同一个项目的另一种叫法'
  ].join('\n');
  const day = getDayDataFromBriefs('2026-11-26', [{ ...brief('a.md'), content: a }, { ...brief('b.md'), content: b }]);
  const names = day.products.map(p => p.name);
  assert.ok(names.includes('Open'));
  assert.ok(names.includes('OpenClaw Cloud'));
  const fleet = day.products.filter(p => p.githubRepo === 'fleetifydev/fleetify');
  assert.equal(fleet.length, 1, 'same GitHub repo merges into one product');
  assert.equal(fleet[0].sourceCount, 2);
});

test('cleanProductName removes split emoji, status marks and verification labels', () => {
  assert.equal(cleanProductName('\udfe2 Migma AI').name, 'Migma AI'); // half of 🟢 left by a non-unicode regex
  assert.equal(cleanProductName('🟢 Migma AI').name, 'Migma AI');
  assert.equal(cleanProductName('🔧 HN 补充核实：OtoDock').name, 'OtoDock');
  assert.doesNotThrow(() => encodeURIComponent(cleanProductName('\ud83d broken').name));
});
