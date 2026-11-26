import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const outputArg = process.argv[2];
if (!outputArg) throw new Error('Specify an output directory for the Pages artifact.');
const outputDir = resolve(outputArg);

const entryFiles = {
  'index.html': ['styles.css', 'app.js'],
  'app.js': ['trial-desk.js', 'markdown.js']
};
const uiFiles = ['index.html', 'app.js', 'trial-desk.js', 'markdown.js', 'styles.css'];
const hash = createHash('sha256');
for (const file of uiFiles) {
  hash.update(file).update('\0').update(readFileSync(join(publicDir, file)));
}
const version = hash.digest('hex').slice(0, 16);

cpSync(publicDir, outputDir, { recursive: true });
for (const [file, dependencies] of Object.entries(entryFiles)) {
  const path = join(outputDir, file);
  let content = readFileSync(path, 'utf8');
  for (const dependency of dependencies) {
    const url = `./${dependency}`;
    if (!content.includes(url)) throw new Error(`Missing ${url} in ${file}.`);
    content = content.replace(url, `${url}?v=${version}`);
  }
  writeFileSync(path, content);
}
