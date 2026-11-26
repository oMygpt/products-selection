// Merge this run's enrichment state into the latest main after a rejected push.
// Usage: node playground/merge-state.mjs <ours-enriched.json> <ours-failed.json>
// Writes the merged result over playground/enriched-products.json and .enrich-failed.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const readJson = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) || fallback; } catch { return fallback; }
};

/** Per key, keep whichever side was enriched more recently. */
export function mergeEnriched(theirs = {}, ours = {}) {
  const merged = { ...theirs };
  for (const [key, entry] of Object.entries(ours)) {
    const other = merged[key];
    if (!other || String(entry?.updatedAt || '') >= String(other?.updatedAt || '')) merged[key] = entry;
  }
  return merged;
}

/** A key enriched successfully on either side leaves the failure queue; otherwise keep the higher attempt count. */
export function mergeFailed(theirs = {}, ours = {}, enriched = {}) {
  const merged = {};
  for (const key of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
    if (enriched[key]) continue;
    const a = theirs[key];
    const b = ours[key];
    merged[key] = !a ? b : !b ? a : ((b.attempts || 0) >= (a.attempts || 0) ? b : a);
  }
  return merged;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [oursEnrichedFile, oursFailedFile] = process.argv.slice(2);
  const enrichedFile = path.join(HERE, 'enriched-products.json');
  const failedFile = path.join(HERE, '.enrich-failed.json');
  const enriched = mergeEnriched(readJson(enrichedFile), readJson(oursEnrichedFile));
  const failed = mergeFailed(readJson(failedFile), readJson(oursFailedFile), enriched);
  fs.writeFileSync(enrichedFile, JSON.stringify(enriched, null, 2), 'utf-8');
  fs.writeFileSync(failedFile, JSON.stringify(failed, null, 2), 'utf-8');
  console.log(`Merged state: ${Object.keys(enriched).length} enriched, ${Object.keys(failed).length} in retry queue.`);
}
