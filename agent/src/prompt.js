// Hidden prompt for the connection string. Echo is suppressed on a TTY; piped stdin is read as-is.
import readline from 'node:readline';

export function readHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) {
    return new Promise((resolve, reject) => {
      let data = '';
      input.setEncoding('utf8');
      input.on('data', (c) => { data += c; });
      input.on('end', () => resolve(data.split(/\r?\n/).find((l) => l.trim()) ?? ''));
      input.on('error', reject);
    });
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) output.write(s); };
    rl.question(question, (answer) => {
      output.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}
