'use strict';
// Runs every tests/api-*.js file (each is a separate process) and prints a summary. Exit code 1 if any failed.
//   node tests/run-api.js            all area suites
//   node tests/run-api.js polls      only files whose name contains "polls"
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const only = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter((f) => /^api-[a-z0-9-]+\.js$/.test(f) && f.includes(only)).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 300000 });
  if (r.status !== 0) { bad++; console.log(`!! ${f} failed (exit ${r.status})`); }
}
console.log(`\nAPI suites: ${files.length - bad}/${files.length} passed`);
process.exit(bad ? 1 : 0);
