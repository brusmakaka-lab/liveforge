import readline from 'node:readline';
import process from 'node:process';
import console from 'node:console';
import { setInterval, setTimeout } from 'node:timers';
import { existsSync } from 'node:fs';
if (process.argv.includes('--fail')) {
  console.error('ERROR test startup');
  process.exit(3);
}
if (!process.argv.includes('--no-ready')) process.stdout.write('Done (0.1s)! For help, type "help"\n');
console.error('WARN diagnostic fixture');
const rl = readline.createInterface({ input: process.stdin });
let ignored = false;
rl.on('line', (line) => {
  if (line === 'stop' && process.argv.includes('--ignore-first-stop') && !ignored) {
    ignored = true;
    return;
  }
  if (line === 'stop') {
    console.log('Saving world');
    rl.close();
    if (process.argv.includes('--wait-release')) {
      // Remain alive after EOF, like server threads still saving or blocked.
      // The test releases this fixture through its own temporary directory.
      setInterval(() => {
        if (existsSync('stop.release')) process.exit(0);
      }, 50);
      return;
    }
    if (process.argv.includes('--slow-stop')) {
      setTimeout(() => process.exit(0), 500);
      return;
    }
    process.exit(0);
  }
  if (line === 'flood') for (let i = 0; i < 600; i++) console.log('line ' + i);
  else console.log('received: ' + line);
});
