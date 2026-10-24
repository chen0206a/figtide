const fs = require('node:fs');
const path = require('node:path');
const arg = key => process.argv[process.argv.indexOf('--' + key) + 1];
const lock = JSON.parse(fs.readFileSync(arg('lock'), 'utf8'));
const stage = path.dirname(path.resolve(arg('modules')));
const lines = ['FigTide third-party notices', '', 'The project MIT license does not replace dependency licenses.',
  'Backend dependency license files remain inside the nested JARs. Java runtime notices are in runtime/legal.',
  'Frontend production dependency notices follow. Optional packages not installed for Windows are omitted.', ''];
let count = 0;
for (const [key, entry] of Object.entries(lock.packages || {})) {
  if (!key || entry.dev === true || !key.startsWith('node_modules/')) continue;
  const directory = path.resolve(stage, key);
  if (!directory.startsWith(stage + path.sep)) throw Error('Invalid dependency path');
  if (!fs.existsSync(directory)) continue;
  const name = key.split('node_modules/').pop();
  lines.push(`===== ${name}@${entry.version} (${entry.license || 'see included license'}) =====`, '');
  const files = fs.readdirSync(directory).filter(file => /^(licen[sc]e|notice|ofl|copying)([._-].*)?$/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
  for (const file of files) lines.push(fs.readFileSync(path.join(directory, file), 'utf8'), '');
  if (!files.length) lines.push('No top-level license file in this package; see SPDX declaration and bundled source notices.', '');
  if (name.startsWith('@fontsource-variable/') && !files.length) throw Error(`Missing font license: ${name}`);
  count++;
}
if (!count) throw Error('No installed frontend dependency notices found');
fs.writeFileSync(arg('out'), lines.join('\n'));
console.log(`Included notices for ${count} frontend packages`);
