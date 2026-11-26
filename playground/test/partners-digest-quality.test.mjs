import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPartners, activeAffiliate, activeSponsored } from '../lib/partners.mjs';
import { renderDigestHtml, renderDigestMarkdown, renderWeeklyFeed } from '../lib/digest.mjs';
import { looksSuspiciousName, isVagueGuide, parseReview, ruleChecks } from '../quality-report.mjs';
import { computeTrialCost } from '../public/trial-cost.js';
import { getTrialCandidates, selectTrials } from '../public/trial-desk.js';

const partners = {
  affiliates: {
    snag: { url: 'https://snag.example/?ref=picks', coupon: 'PICKS20', couponNote: '首月 8 折', until: '2026-12-31' },
    old: { url: 'https://old.example/?ref=picks', until: '2026-01-01' },
    evil: { url: 'javascript:alert(1)' }
  },
  sponsored: [
    { key: 'snag', from: '2026-11-20', to: '2026-11-30', pitch: '把购物意图变成比价清单' },
    { key: 'snag', from: '2027-01-01', to: '2027-01-07' }
  ]
};

test('partners: active window, URL safety, disclosure', () => {
  const a = activeAffiliate(partners, 'snag', '2026-11-27');
  assert.equal(a.url, 'https://snag.example/?ref=picks');
  assert.equal(a.coupon, 'PICKS20');
  assert.equal(a.disclosure, '含返佣链接');
  assert.equal(activeAffiliate(partners, 'old', '2026-11-27'), null, 'expired');
  assert.equal(activeAffiliate(partners, 'evil', '2026-11-27'), null, 'non-http URL rejected');
  assert.equal(activeAffiliate(partners, 'nobody', '2026-11-27'), null);
  const index = new Map([['snag', { key: 'snag', name: 'Snag', directUrl: 'https://snag.example' }]]);
  assert.equal(activeSponsored(partners, '2026-11-27', index).length, 1);
  assert.equal(activeSponsored(partners, '2026-12-15', index).length, 0);
});

test('partners never change trial cost or the curated order', () => {
  const base = [
    { key: 'snag', name: 'Snag', url: 'https://snag.example', deliveryForm: 'web', experienceGuide: ['打开', '试一个任务'] },
    { key: 'easy', name: 'Easy', url: 'https://easy.dev', deliveryForm: 'web', frictionLevel: '免注册直玩', setupMinutes: 1, experienceGuide: ['打开', '试一个任务'] }
  ];
  const withPartner = base.map(p => ({ ...p, partner: activeAffiliate(partners, p.key, '2026-11-27') || undefined }));
  assert.deepEqual(withPartner.map(computeTrialCost), base.map(computeTrialCost));
  assert.equal(selectTrials(withPartner, null, {}).featured.product.key, selectTrials(base, null, {}).featured.product.key);
  assert.deepEqual(getTrialCandidates(withPartner).map(c => c.mode.priority), getTrialCandidates(base).map(c => c.mode.priority));
});

test('loadPartners tolerates a missing or broken file', () => {
  assert.deepEqual(loadPartners('/nonexistent/partners.json'), { affiliates: {}, sponsored: [] });
  const tmp = path.join(os.tmpdir(), `partners-${process.pid}.json`);
  fs.writeFileSync(tmp, '{ not json');
  assert.deepEqual(loadPartners(tmp), { affiliates: {}, sponsored: [] });
  fs.unlinkSync(tmp);
});

test('digest renders escaped, email-safe HTML with disclosure only when needed', () => {
  const picks = [{ key: 'x', name: '<b>X</b>', tagline: 'a & b', categoryLabel: 'Agent', trialCost: computeTrialCost({ deliveryForm: 'web', frictionLevel: '免注册直玩', setupMinutes: 1, pricingModel: 'Freemium' }) }];
  const html = renderDigestHtml({ week: '2026-W48', range: '2026-11-23 ~ 2026-11-26', picks, quick: [], origin: 'https://picks.chunlin.ch' });
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('有免费档'));
  assert.ok(!html.includes('返佣'));
  const withAff = renderDigestMarkdown({ week: 'W', range: '', picks: [{ ...picks[0], partner: { url: 'https://a.example/?ref=1', coupon: 'C1' } }], quick: [], origin: 'https://o' });
  assert.ok(withAff.includes('读者专属：`C1`'));
  assert.ok(withAff.includes('含返佣'));
  const feed = renderWeeklyFeed({ weeks: [{ week: '2026-W48', picks }], origin: 'https://o' });
  assert.ok(feed.includes('<guid isPermaLink="true">https://o/digest/2026-W48.html</guid>'));
});

test('quality rules: names, vague guides, LLM output parsing', () => {
  assert.equal(looksSuspiciousName('Glassmail'), null);
  assert.equal(looksSuspiciousName('The Riemann Handbook'), null);
  assert.ok(looksSuspiciousName('Show HN: something'));
  assert.ok(looksSuspiciousName('A C++ Compiler That Is Faster Than GCC and Clang'));
  assert.equal(isVagueGuide(['打开官网', '阅读首页规则说明，尝试进行第一次投掷并观察阻挡效果']), null);
  assert.ok(isVagueGuide(['打开官网', '浏览官网展示的案例和功能介绍页面了解产品']));
  assert.ok(isVagueGuide(['只有一步']));
  assert.deepEqual(parseReview('好的：\n[{"key":"a","issues":["not_a_product"],"note":"是新闻"},{"key":"b","issues":[]}]'),
    [{ key: 'a', issues: ['not_a_product'], note: '是新闻' }]);
  assert.equal(parseReview('no json here'), null);
});

test('ruleChecks summarises coverage and flags thin recent issues', () => {
  const f = ruleChecks({
    explore: { items: [
      { key: 'a', name: 'Alpha', date: '2026-11-26', enriched: true, trialCost: { level: 'instant', verified: true }, directUrl: 'https://a' },
      { key: 'b', name: 'Show HN: Beta thing', date: '2026-11-26', trialCost: { level: 'web', verified: false } }
    ] },
    products: [{ key: 'a', enriched: true, experienceGuide: ['打开', '浏览官网了解功能介绍和定价方案'] }],
    failed: { z: { attempts: 3, lastError: 'Bad JSON' } },
    days: { days: [{ date: '2026-11-26', briefCount: 2, productCount: 2 }] }
  });
  assert.deepEqual([f.coverage.total, f.coverage.enriched, f.coverage.instant], [2, 1, 1]);
  assert.equal(f.suspicious.length, 1);
  assert.equal(f.noLink.length, 1);
  assert.equal(f.vague.length, 1);
  assert.equal(f.failed.exhausted.length, 1);
  assert.equal(f.thinDays.length, 1);
});
