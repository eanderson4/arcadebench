import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const identityFindings = [];

if (process.env.ARCADEBENCH_SKIP_IDENTITY_CHECK !== '1') {
  const identityLog = execFileSync('git', ['log', '--all', '--format=%H%x09%an%x09%ae'], { encoding: 'utf8' });

  for (const line of identityLog.trim().split('\n').filter(Boolean)) {
    const [commit = '', name = '', email = ''] = line.split('\t');
    const domain = email.includes('@') ? email.split('@').at(-1).toLowerCase() : '';
    const isArcadeBench = name === 'ArcadeBench' && domain === 'arcadebench.org';
    const isGitHubNoreply = domain === 'users.noreply.github.com';
    const isGitHubBot = domain === 'github.com' && (name === 'GitHub' || name.endsWith('[bot]'));

    if (!isArcadeBench && !isGitHubNoreply && !isGitHubBot) {
      identityFindings.push(commit.slice(0, 12));
    }
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
