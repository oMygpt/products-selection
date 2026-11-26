import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeEnriched, mergeFailed } from '../merge-state.mjs';

test('mergeEnriched keeps the newer entry per key and the union of keys', () => {
  const theirs = { a: { updatedAt: '2026-11-26T10:00:00Z', v: 'old' }, b: { updatedAt: '2026-11-26T09:00:00Z' } };
  const ours = { a: { updatedAt: '2026-11-26T11:00:00Z', v: 'new' }, c: { updatedAt: '2026-11-26T11:00:00Z' } };
  const merged = mergeEnriched(theirs, ours);
  assert.deepEqual(Object.keys(merged).sort(), ['a', 'b', 'c']);
  assert.equal(merged.a.v, 'new');
  assert.equal(mergeEnriched({ a: { updatedAt: 'Z9', v: 'theirs' } }, { a: { updatedAt: 'A1', v: 'ours' } }).a.v, 'theirs');
});

test('mergeFailed drops keys that got enriched and keeps the higher attempt count', () => {
  const merged = mergeFailed(
    { x: { attempts: 2 }, y: { attempts: 1 } },
    { x: { attempts: 1 }, y: { attempts: 3 }, z: { attempts: 1 } },
    { z: { updatedAt: 'now' } }
  );
  assert.deepEqual(merged, { x: { attempts: 2 }, y: { attempts: 3 } });
});
