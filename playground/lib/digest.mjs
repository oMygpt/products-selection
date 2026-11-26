// Weekly digest: an email-ready HTML (inline styles, no scripts), a Markdown version for
// WeChat / newsletter tools, and a weekly RSS feed. Pure functions; build-static writes the files.

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const COST_COLORS = {
  instant: '#1f5c41', web: '#1d4282', signup: '#1d4282', key: '#9a4a06',
  install: '#706a60', desktop: '#706a60', hardware: '#c23b28'
};

function costText(cost) {
  if (!cost) return '';
  const parts = [cost.label];
  if (cost.minutes != null) parts.push(`${cost.verified ? '' : '约 '}${cost.minutes} 分钟`);
  if (cost.free === true) parts.push('免费');
  else if (cost.free === 'freemium') parts.push('有免费档');
  return parts.join(' · ') + (cost.verified ? '' : '（估）');
}

const productUrl = (origin, key, campaign) =>
  `${origin}/?utm_source=${campaign}&utm_medium=digest#/product/${encodeURIComponent(key)}`;

export function renderDigestHtml({ week, range, picks, quick, origin }) {
  const card = (p, i) => `
    <tr><td style="padding:14px 0;border-top:1px solid #e0d9cc;">
      <div style="font:600 12px/1.4 -apple-system,'PingFang SC',sans-serif;color:#c23b28;">#${String(i + 1).padStart(2, '0')} · ${esc(p.categoryLabel || '')}</div>
      <a href="${esc(productUrl(origin, p.key, 'weekly-email'))}" style="font:800 20px/1.3 -apple-system,'PingFang SC',sans-serif;color:#171615;text-decoration:none;">${esc(p.name)}</a>
      <div style="font:15px/1.6 -apple-system,'PingFang SC',sans-serif;color:#36332e;margin:4px 0 6px;">${esc(p.tagline || '')}</div>
      ${p.trialCost ? `<span style="display:inline-block;font:12px/1.4 -apple-system,'PingFang SC',sans-serif;color:${COST_COLORS[p.trialCost.level] || '#706a60'};border:1px solid #e0d9cc;border-radius:999px;padding:2px 9px;">● ${esc(costText(p.trialCost))}</span>` : ''}
      ${p.partner?.coupon ? `<span style="display:inline-block;margin-left:6px;font:12px/1.4 monospace;color:#1f5c41;border:1px dashed #1f5c41;border-radius:4px;padding:2px 7px;">读者专属 ${esc(p.partner.coupon)}${p.partner.couponNote ? ` · ${esc(p.partner.couponNote)}` : ''}</span>` : ''}
    </td></tr>`;
  const quickRow = quick.length ? `
    <tr><td style="padding:22px 0 6px;font:800 16px/1.4 -apple-system,'PingFang SC',sans-serif;color:#171615;">现在就能玩 <span style="font-weight:400;font-size:13px;color:#706a60;">不装软件，点开就试</span></td></tr>
    ${quick.map(p => `<tr><td style="padding:6px 0;font:14px/1.6 -apple-system,'PingFang SC',sans-serif;"><a href="${esc(p.partner?.url || p.tryUrl)}" style="color:#1d4282;font-weight:700;">${esc(p.name)} ↗</a> <span style="color:#36332e;">${esc(p.tagline || '')}</span></td></tr>`).join('')}` : '';
  const hasAffiliate = [...picks, ...quick].some(p => p.partner?.url);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Products Selection 周精选 · ${esc(week)}</title></head>
<body style="margin:0;background:#f7f5f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e0d9cc;border-radius:10px;padding:26px 28px;">
  <tr><td style="font:700 12px/1.4 monospace;color:#706a60;">PRODUCTS SELECTION · ${esc(week)} · ${esc(range || '')}</td></tr>
  <tr><td style="padding:6px 0 4px;font:800 30px/1.2 -apple-system,'PingFang SC',sans-serif;color:#171615;letter-spacing:-1px;">本周值得试的 ${picks.length} 款</td></tr>
  <tr><td style="padding-bottom:8px;font:14px/1.6 -apple-system,'PingFang SC',sans-serif;color:#706a60;">每款都标了试用成本：要不要注册、几分钟能上手、是否免费。「估」表示尚未经 Agent 查验。</td></tr>
  ${picks.map(card).join('')}
  ${quickRow}
  <tr><td style="padding-top:24px;border-top:1px solid #e0d9cc;font:12px/1.7 -apple-system,'PingFang SC',sans-serif;color:#706a60;">
    <a href="${esc(origin)}/?utm_source=weekly-email&utm_medium=digest" style="color:#171615;">打开体验台</a> ·
    <a href="${esc(origin)}/feed-weekly.xml" style="color:#171615;">订阅 RSS</a>
    ${hasAffiliate ? '<br>部分链接含返佣，不影响入选与排序。' : ''}
  </td></tr>
</table></td></tr></table>
</body></html>
`;
}

export function renderDigestMarkdown({ week, range, picks, quick, origin }) {
  const lines = [`# 本周值得试的 ${picks.length} 款 · ${week}`, '', `> ${range || ''} · 每款都标了试用成本；「估」= 尚未经 Agent 查验`, ''];
  picks.forEach((p, i) => {
    lines.push(`## ${i + 1}. ${p.name}`, '', p.tagline || '', '');
    if (p.trialCost) lines.push(`- 试用成本：${costText(p.trialCost)}`);
    if (p.partner?.coupon) lines.push(`- 读者专属：\`${p.partner.coupon}\`${p.partner.couponNote ? `（${p.partner.couponNote}）` : ''}`);
    lines.push(`- 详情：${productUrl(origin, p.key, 'weekly-md')}`, '');
  });
  if (quick.length) {
    lines.push('## 现在就能玩（不装软件，点开就试）', '');
    for (const p of quick) lines.push(`- **${p.name}**：${p.tagline || ''} → ${p.partner?.url || p.tryUrl}`);
    lines.push('');
  }
  if ([...picks, ...quick].some(p => p.partner?.url)) lines.push('_部分链接含返佣，不影响入选与排序。_', '');
  return lines.join('\n');
}

export function renderWeeklyFeed({ weeks, origin }) {
  const items = weeks.map(w => {
    const link = `${origin}/digest/${w.week}.html`;
    return `    <item>
      <title>${esc(`周精选 ${w.week}：${w.picks.map(p => p.name).slice(0, 3).join('、')}${w.picks.length > 3 ? ' 等' : ''}`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <description>${esc(w.picks.map(p => `${p.name}：${p.tagline || ''}`).join('\n'))}</description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Products Selection · 周精选</title>
    <link>${esc(origin)}/#/weekly</link>
    <description>每周值得试的产品，标注试用成本</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>
`;
}
