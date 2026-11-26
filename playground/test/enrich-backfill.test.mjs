import test from 'node:test';
import assert from 'node:assert/strict';
import { repoMatchesProduct } from '../lib/parser.mjs';
import { selectBackfillBatch, isStaleEnrichment } from '../enrich-agent.mjs';

test('repoMatchesProduct accepts the product’s own repo', () => {
  assert.ok(repoMatchesProduct('rokoov/smorza', { productName: 'Smorza', siteUrl: 'https://smorza.app' }));
  assert.ok(repoMatchesProduct('OnurGumus/zero-csharp', { productName: 'Zero C#' }));
  assert.ok(repoMatchesProduct('fleetifydev/fleetify', { productName: 'Fleetify' }));
  assert.ok(repoMatchesProduct('acme/whatever', { productName: 'Whatever Studio' }));
  // Owner matches the site's domain
  assert.ok(repoMatchesProduct('glassmail/mac', { productName: 'Glassmail', siteUrl: 'https://glassmail.app' }));
});

test('repoMatchesProduct rejects competitor / dependency links from landing pages', () => {
  // quebec.yarn.so compares itself to WhisperX on its landing page
  assert.equal(repoMatchesProduct('m-bain/whisperX', { productName: 'Quebec', siteUrl: 'https://quebec.yarn.so/' }), false);
  assert.equal(repoMatchesProduct('Vector35/debugger', { productName: 'Win11 遥测曝光', siteUrl: 'https://xusheng.dev/' }), false);
  assert.equal(repoMatchesProduct('vercel/next.js', { productName: 'Glassmail', siteUrl: 'https://glassmail.app' }), false);
});

test('selectBackfillBatch: stale upgrades first, then linked, then link-less; skips exhausted failures', () => {
  const days = {
    '2026-11-20': { products: [
      { key: 'fresh', name: 'Fresh', directUrl: 'https://fresh.dev' },
      { key: 'nolink', name: 'NoLink' },
      { key: 'old', name: 'Quebec', directUrl: 'https://quebec.yarn.so/', githubRepo: 'm-bain/whisperX' },
      { key: 'done', name: 'Done', directUrl: 'https://done.dev' },
      { key: 'broken', name: 'Broken', directUrl: 'https://broken.dev' }
    ] },
    '2026-11-19': { products: [{ key: 'fresh', name: 'Fresh (dup)' }, { key: 'older', name: 'Older', githubRepo: 'older/older' }] }
  };
  const store = {
    old: { key: 'old', githubRepo: 'm-bain/whisperX', directUrl: 'https://quebec.yarn.so/' }, // no frictionLevel => stale
    done: { key: 'done', frictionLevel: '免注册直玩' }
  };
  const batch = selectBackfillBatch({
    dates: ['2026-11-20', '2026-11-19'],
    getDay: d => days[d],
    store,
    failedMap: { broken: { attempts: 3 } },
    limit: 10
  });
  assert.deepEqual(batch.map(p => p.key), ['old', 'fresh', 'older', 'nolink']);
  assert.equal(batch[0].__stale, true);
  assert.equal(batch[0].githubRepo, null, 'mis-matched inherited repo is dropped before re-enrichment');
  assert.equal(selectBackfillBatch({ dates: ['2026-11-20'], getDay: d => days[d], store, limit: 2 }).length, 2);
  assert.equal(isStaleEnrichment(store.old), true);
  assert.equal(isStaleEnrichment(store.done), false);
});

test('acceptSearchHit: exact-name GitHub search must be cross-checked', async () => {
  const { acceptSearchHit } = await import('../enrich-agent.mjs');
  const hit = (name, homepage = '', stars = 500) => ({ name, homepage, stargazers_count: stars });
  // Site known: homepage must match
  assert.ok(acceptSearchHit(hit('glassmail', 'https://glassmail.app'), { normTarget: 'glassmail', siteUrl: 'https://www.glassmail.app/' }));
  assert.equal(acceptSearchHit(hit('carry', 'https://other.dev'), { normTarget: 'carry', siteUrl: 'https://carry.so' }), false);
  // No site known: short / common names are rejected, distinctive ones need some traction
  assert.equal(acceptSearchHit(hit('carry'), { normTarget: 'carry' }), false);
  assert.ok(acceptSearchHit(hit('fleetify', '', 40), { normTarget: 'fleetify' }));
  assert.equal(acceptSearchHit(hit('fleetify', '', 3), { normTarget: 'fleetify' }), false);
});
