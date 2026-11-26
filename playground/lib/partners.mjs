// Commercial partnerships, kept strictly separate from curation.
//
// playground/partners.json (edited by hand, committed):
// {
//   "affiliates": {
//     "<productKey>": { "url": "https://…?ref=picks", "coupon": "PICKS20", "couponNote": "首月 8 折", "until": "2026-12-31" }
//   },
//   "sponsored": [
//     { "key": "<productKey>", "from": "2026-12-01", "to": "2026-12-07", "pitch": "一句话卖点", "url": "https://…" }
//   ]
// }
//
// Rules: partners never change ranking, the random draw, quick picks or trial cost.
// They only add a disclosed link / coupon and a separately labelled sponsored slot.
import fs from 'node:fs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function loadPartners(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      affiliates: raw && typeof raw.affiliates === 'object' && raw.affiliates ? raw.affiliates : {},
      sponsored: Array.isArray(raw?.sponsored) ? raw.sponsored : []
    };
  } catch {
    return { affiliates: {}, sponsored: [] };
  }
}

/** Public, display-only partner info for a product on `today` (YYYY-MM-DD), or null. */
export function activeAffiliate(partners, key, today) {
  const a = partners.affiliates?.[key];
  if (!a) return null;
  if (a.until && DATE_RE.test(a.until) && a.until < today) return null;
  const url = safeHttpUrl(a.url);
  const coupon = typeof a.coupon === 'string' ? a.coupon.trim().slice(0, 40) : '';
  if (!url && !coupon) return null;
  return {
    url,
    coupon: coupon || null,
    couponNote: typeof a.couponNote === 'string' ? a.couponNote.trim().slice(0, 60) : null,
    disclosure: url ? '含返佣链接' : '读者专属优惠'
  };
}

/** Sponsored slots running on `today`, resolved against the product index. */
export function activeSponsored(partners, today, productIndex) {
  return (partners.sponsored || [])
    .filter(s => s && DATE_RE.test(s.from || '') && DATE_RE.test(s.to || '') && s.from <= today && today <= s.to)
    .map(s => {
      const p = productIndex.get(s.key) || {};
      const url = safeHttpUrl(s.url) || safeHttpUrl(p.directUrl || p.url);
      if (!url || !(p.name || s.name)) return null;
      return {
        key: s.key,
        name: String(s.name || p.name),
        pitch: String(s.pitch || p.tagline || '').slice(0, 80),
        url,
        ogImage: p.ogImage || null,
        trialCost: p.trialCost || null,
        to: s.to
      };
    })
    .filter(Boolean)
    .slice(0, 1);
}
