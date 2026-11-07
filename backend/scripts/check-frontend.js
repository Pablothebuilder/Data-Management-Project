// npm run check - syntax-checks every frontend script (frontend/public/js/*.js).
// The browser only reports a syntax error in its console, and one error stops
// the whole page script, so run this before committing frontend changes.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', '..', 'frontend', 'public', 'js');
let failed = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' });
    console.log(`ok    ${file}`);
  } catch (err) {
    failed += 1;
    console.error(`ERROR ${file}\n${err.stderr.toString()}`);
  }
}
if (failed) {
  console.error(`${failed} file(s) have syntax errors`);
  process.exit(1);
}
console.log('All frontend scripts are valid.');
