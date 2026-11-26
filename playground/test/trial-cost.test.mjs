import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTrialCost, isDemoUrl, describeTrialCost, QUICK_FILTERS } from '../public/trial-cost.js';
import { drawTrials, getTrialCandidates } from '../public/trial-desk.js';

test('isDemoUrl: sandboxes and explicit demo paths only — not docs on static hosting', () => {
  assert.ok(isDemoUrl('https://huggingface.co/spaces/MiniMaxAI/minimax-h3-image'));
  assert.ok(isDemoUrl('https://stackblitz.com/edit/foo'));
  assert.ok(isDemoUrl('https://cursedcam.com/demo'));
  assert.equal(isDemoUrl('https://onurgumus.github.io/zero-csharp/index.html'), false);
  assert.equal(isDemoUrl('https://www.npmjs.com/package/@hatchet-dev/sandbox'), false);
  assert.equal(isDemoUrl('https://github.com/acme/demo'), false);
  assert.equal(isDemoUrl('javascript:alert(1)'), false);
});

test('hardware requirements win over everything else', () => {
  const tokenTv = computeTrialCost({
    deliveryForm: 'github',
    frictionLevel: '需本地安装',
    enriched: true,
    demoUrl: 'https://click6067-ship-it.github.io/token-tv/collection/',
    experienceGuide: ['步骤1：若已拥有 SmallTV 硬件，确保其与电脑在同一 Wi-Fi 下', '步骤2：运行 npx token-tv start']
  });
  assert.equal(tokenTv.level, 'hardware');
  assert.equal(tokenTv.demoUrl, null);
});

test('hardware keywords do not misfire on "无需…设备" or in-browser emulation', () => {
  assert.notEqual(computeTrialCost({ deliveryForm: 'web', introduction: '无需下载应用即可在任意设备上流畅体验' }).level, 'hardware');
  assert.notEqual(computeTrialCost({ deliveryForm: 'web', tagline: '浏览器里跑真实 ESP32 固件' }).level, 'hardware');
  assert.notEqual(computeTrialCost({ deliveryForm: 'web', tagline: '买硬件前先感受本地 LLM 速度' }).level, 'hardware');
});

test('verified enrichment beats estimates; estimates are flagged', () => {
  const verified = computeTrialCost({ deliveryForm: 'web', frictionLevel: '免注册直玩', setupMinutes: 1, pricingModel: '免费可用' });
  assert.deepEqual([verified.level, verified.minutes, verified.verified, verified.free], ['instant', 1, true, true]);
  assert.equal(describeTrialCost(verified), '免注册直玩 · 1 分钟 · 免费');

  const estimate = computeTrialCost({ deliveryForm: 'github', pricingModel: '免费开源' });
  assert.deepEqual([estimate.level, estimate.verified], ['install', false]);
  assert.equal(describeTrialCost(estimate), '需本地安装 · 约 10 分钟 · 免费');
});

test('"5 分钟内" only counts verified timings or genuine demos', () => {
  const fast = QUICK_FILTERS.fast.test;
  assert.equal(fast(computeTrialCost({ deliveryForm: 'web' })), false, 'estimated web is not "fast"');
  assert.equal(fast(computeTrialCost({ deliveryForm: 'web', frictionLevel: '需注册登录', setupMinutes: 3 })), true);
  assert.equal(fast(computeTrialCost({ deliveryForm: 'web', demoUrl: 'https://huggingface.co/spaces/a/b' })), true);
});

const product = (key, extra = {}) => ({
  key, name: key, url: `https://${key}.dev`, deliveryForm: 'web',
  experienceGuide: ['打开网页', '试一个具体任务'], ...extra
});

test('drawTrials: one featured + two alternatives, diverse forms, deterministic with a seeded rng', () => {
  const candidates = getTrialCandidates([
    product('a'), product('b'),
    product('c', { deliveryForm: 'github', url: 'https://github.com/c/c' }),
    product('d', { deliveryForm: 'desktop' })
  ]);
  const rng = () => 0.42;
  const sample = drawTrials(candidates, {}, [], rng);
  assert.equal(sample.length, 3);
  assert.equal(new Set(sample.map(e => e.product.key)).size, 3);
  assert.equal(new Set(sample.map(e => e.group)).size, 3, 'alternatives cover different delivery forms');
});

test('drawTrials: "换一组" always changes the featured product', () => {
  const candidates = getTrialCandidates([product('a'), product('b'), product('c')]);
  for (let i = 0; i < 50; i++) {
    const first = drawTrials(candidates);
    const next = drawTrials(candidates, {}, first.map(e => e.product.key));
    assert.notEqual(next[0].product.key, first[0].product.key);
  }
});

test('drawTrials: easy, untried products lead far more often than hardware or tried ones', () => {
  const candidates = getTrialCandidates([
    product('easy', { frictionLevel: '免注册直玩', setupMinutes: 1 }),
    product('hw', { deliveryForm: 'desktop', experienceGuide: ['准备一块 ESP32 开发板', '烧录固件'] }),
    product('done', { frictionLevel: '免注册直玩', setupMinutes: 1 })
  ]);
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leads = { easy: 0, hw: 0, done: 0 };
  for (let i = 0; i < 2000; i++) leads[drawTrials(candidates, { done: { status: 'tried' } }, [], rng)[0].product.key]++;
  assert.ok(leads.easy > 1800, JSON.stringify(leads));
  assert.ok(leads.hw < 60, JSON.stringify(leads));
});
