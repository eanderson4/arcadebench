import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const allowedNames = new Set(['ArcadeBench']);
const allowedEmailDomains = new Set(['arcadebench.org', 'users.noreply.github.com']);
const identityLog = execFileSync('git', ['log', '--all', '--format=%H%x09%an%x09%ae'], { encoding: 'utf8' });
const identityFindings = [];

for (const line of identityLog.trim().split('\n').filter(Boolean)) {
  const [commit = '', name = '', email = ''] = line.split('\t');
  const domain = email.includes('@') ? email.split('@').at(-1).toLowerCase() : '';
  if (!allowedNames.has(name) || !allowedEmailDomains.has(domain)) {
    identityFindings.push(commit.slice(0, 12));
  }
}

if (identityFindings.length > 0) {
  console.error('Git history contains a personal-looking author identity:');
  for (const commit of [...new Set(identityFindings)]) console.error(`  commit ${commit}`);
  console.error('Rewrite author metadata to an approved public identity before pushing.');
}

const history = execFileSync('git', ['log', '-p', '--all', '--full-history', '--no-color'], {
  maxBuffer: 256 * 1024 * 1024,
});
const executable = process.platform === 'win32' ? 'secretlint.cmd' : 'secretlint';
const secretlint = spawnSync(resolve('node_modules', '.bin', executable), ['--stdinFileName=git-history.patch'], {
  input: history,
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (secretlint.error) throw secretlint.error;
if (secretlint.status !== 0) process.exit(secretlint.status ?? 2);
console.log('Git history credential scan passed.');
if (identityFindings.length > 0) process.exit(1);
