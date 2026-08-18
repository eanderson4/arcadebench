import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SAFE_EMAIL_DOMAINS = new Set([
  'arcadebench.org',
  'example.com',
  'example.net',
  'example.org',
  'users.noreply.github.com',
]);

const SENSITIVE_FILENAMES = [
  /^\.dev\.vars(?:\.|$)/i,
  /^\.env(?:\.|$)/i,
  /^credentials(?:\.[a-z0-9_-]+)?$/i,
  /^id_(?:dsa|ecdsa|ed25519|rsa)$/i,
  /^service[-_]?account(?:\.[a-z0-9_-]+)?$/i,
  /\.(?:jks|key|keystore|p12|pem|pfx)$/i,
];

const TEXT_RULES = [
  {
    name: 'absolute user home path',
    expression: /\/(?:Users|home)\/[^/\s"'`]+(?:\/|\b)|[A-Za-z]:\\Users\\[^\\\s"'`]+(?:\\|\b)/g,
  },
  {
    name: 'private network address',
    expression: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
  },
];

const EMAIL_EXPRESSION = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const requested = process.argv.slice(2);
const files = requested.includes('--all')
  ? execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  : requested.filter((value) => value !== '--all');

const findings = [];

for (const path of [...new Set(files)]) {
  const filename = basename(path);
  if (filename !== '.env.example' && SENSITIVE_FILENAMES.some((pattern) => pattern.test(filename))) {
    findings.push({ path, line: 1, reason: 'sensitive credential filename' });
  }

  let content;
  try {
    content = readFileSync(path);
  } catch {
    continue;
  }
  if (content.includes(0)) continue;

  const lines = content.toString('utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.includes('privacylint-allow')) continue;

    EMAIL_EXPRESSION.lastIndex = 0;
    for (const match of line.matchAll(EMAIL_EXPRESSION)) {
      if (!SAFE_EMAIL_DOMAINS.has(match[1].toLowerCase())) {
        findings.push({ path, line: index + 1, reason: 'personal or unapproved email address' });
      }
    }

    for (const rule of TEXT_RULES) {
      rule.expression.lastIndex = 0;
      if (rule.expression.test(line)) findings.push({ path, line: index + 1, reason: rule.name });
    }
  }
}

if (findings.length > 0) {
  console.error('Private-detail scan blocked this change:');
  for (const finding of findings) console.error(`  ${finding.path}:${finding.line} — ${finding.reason}`);
  console.error('Remove the detail. For an intentional public fixture, add privacylint-allow on that line.');
  process.exit(1);
}

console.log(`Private-detail scan passed (${files.length} files).`);
