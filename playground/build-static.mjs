import fs from 'node:fs';
import path from 'node:path';
import { getAllDates, getDayData, ROOT_DIR, MUSE_DIR, PUBLIC_DIR } from './server.mjs';

const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const DAY_DIR = path.join(DATA_DIR, 'day');

fs.mkdirSync(DAY_DIR, { recursive: true });

const dates = getAllDates();
const daysSummary = dates.map(d => ({
  date: d,
  hasAgentA: fs.existsSync(path.join(ROOT_DIR, `今日产品简报-${d}.md`)),
  hasMuse: fs.existsSync(path.join(MUSE_DIR, `brief_${d}.md`))
}));

fs.writeFileSync(
  path.join(DATA_DIR, 'days.json'),
  JSON.stringify({
    days: daysSummary,
    generatedAt: new Date().toISOString()
  }),
  'utf-8'
);

const allProducts = [];

for (const d of dates) {
  const dayData = getDayData(d);
  // Strip user-specific local state before writing public static data
  const cleanDay = {
    ...dayData,
    products: dayData.products.map(({ userStatus, userNote, userUpdatedAt, ...rest }) => rest)
  };
  fs.writeFileSync(
    path.join(DAY_DIR, `${d}.json`),
    JSON.stringify(cleanDay),
    'utf-8'
  );
  for (const p of cleanDay.products) {
    allProducts.push(p);
  }
}

fs.writeFileSync(
  path.join(DATA_DIR, 'explore.json'),
  JSON.stringify({
    total: allProducts.length,
    items: allProducts
  }),
  'utf-8'
);

console.log(`Built static dataset: ${dates.length} days, ${allProducts.length} products -> ${DATA_DIR}`);
