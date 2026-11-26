import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAnyBriefMarkdown,
  parseStructuredJsonBlocks,
  normalizeLicense,
  normalizePricing,
  extractQuickCommands
} from '../lib/parser.mjs';

test('parses new list format: 1. **[Name](url)** —— tagline', () => {
  const md = `## 今日精选\n1. **[MyClaw 3.0](https://myclaw.ai)** —— 一键托管 OpenClaw 的云端 Agent 平台，免费试用。\n2. **[Acme CLI](https://github.com/acme/cli)** —— 终端工作流助手，MIT 开源。`;
  const { items } = parseAnyBriefMarkdown(md, '2026-11-26');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'MyClaw 3.0');
  assert.equal(items[0].url, 'https://myclaw.ai');
  assert.equal(items[1].githubRepo, 'acme/cli');
  assert.equal(items[1].pricingModel, '免费开源');
});

test('parses detailed heading with full-width parens: ### Koed（url）—— tagline', () => {
  const md = `### Koed（https://koed.ai/）—— 面向开发者的结构化代码评审工具\n\n支持 GitHub PR 自动审查与本地 CLI 运行。\n\n### LocalBox (https://github.com/local/box) - 本地沙箱\n\n无需联网即可运行代码。`;
  const { items } = parseAnyBriefMarkdown(md, '2026-11-26');
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'Koed');
  assert.equal(items[0].url, 'https://koed.ai/');
  assert.equal(items[1].name, 'LocalBox');
  assert.equal(items[1].githubRepo, 'local/box');
});

test('prefers structured JSON code block when present in brief', () => {
  const md = `# 2026-11-26 简报\n给人类看的文字...\n\n\`\`\`json\n{\n  "products": [\n    {\n      "name": "DemoKit",\n      "url": "https://demokit.dev",\n      "repo": "demokit/demokit",\n      "tagline": "零配置在线演示框架",\n      "pricing": "MIT",\n      "license": "MIT",\n      "demoUrl": "https://demokit.dev/playground",\n      "source": "hark"\n    }\n  ]\n}\n\`\`\``;
  const jsonItems = parseStructuredJsonBlocks(md, '2026-11-26');
  assert.equal(jsonItems.length, 1);
  assert.equal(jsonItems[0].name, 'DemoKit');
  assert.equal(jsonItems[0].githubRepo, 'demokit/demokit');
  assert.equal(jsonItems[0].license, 'MIT');
  assert.equal(jsonItems[0].pricingModel, '免费开源');
  assert.equal(jsonItems[0].demoUrl, 'https://demokit.dev/playground');

  const parsed = parseAnyBriefMarkdown(md, '2026-11-26');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, 'DemoKit');
});

test('separates pricingModel from SPDX license and filters NOASSERTION', () => {
  assert.equal(normalizeLicense('NOASSERTION'), null);
  assert.equal(normalizeLicense('Other'), null);
  assert.equal(normalizeLicense('MIT'), 'MIT');
  assert.equal(normalizePricing('MIT', { githubRepo: 'org/repo', license: 'MIT' }), '免费开源');
  assert.equal(normalizePricing('Apache-2.0', { githubRepo: 'org/repo' }), '免费开源');
  assert.equal(normalizePricing('Freemium'), 'Freemium');
  assert.equal(normalizePricing('一次性买断'), '一次性买断');
});

test('merges backslash-continued multi-line shell commands without truncation', () => {
  const md = '```bash\ndocker run --rm --platform linux/amd64 \\\n  -v "$PWD:/src" -w /src \\\n  ghcr.io/example/zero-cs:latest build\n```';
  const cmds = extractQuickCommands(md);
  assert.equal(cmds.length, 1);
  assert.ok(!cmds[0].endsWith('\\'));
  assert.ok(cmds[0].includes('ghcr.io/example/zero-cs:latest build'));
});

test('regression: all committed raw/day briefs parse with zero empty days and recent days >= 3 items', () => {
  const rawDir = path.resolve(import.meta.dirname, '../public/data/raw');
  const files = fs.readdirSync(rawDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  assert.ok(files.length > 0, 'Expected committed raw brief files');
  for (let i = 0; i < files.length; i++) {
    const data = JSON.parse(fs.readFileSync(path.join(rawDir, files[i]), 'utf-8'));
    const briefs = data.rawBriefs || [];
    if (briefs.length === 0) continue;
    const keys = new Set();
    for (const b of briefs) {
      const { items } = parseAnyBriefMarkdown(b.content, data.date);
      for (const p of items) keys.add(p.key);
    }
    assert.ok(keys.size > 0, `Expected >0 products for ${data.date}, got 0`);
    if (i < 3) {
      assert.ok(keys.size >= 3, `Expected >=3 products for recent date ${data.date}, got ${keys.size}`);
    }
  }
});
