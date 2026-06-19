import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const isWindows = process.platform === 'win32';
export const npmCommand = isWindows ? 'npm.cmd' : 'npm';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

export function nowIso() {
  return new Date().toISOString();
}

export function redact(text = '') {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED]"')
    .replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"[REDACTED]"')
    .replace(/(api[_-]?key|jwt[_-]?secret|password|token|secret)=([^\s&]+)/gi, '$1=[REDACTED]');
}

export function runCommand(name, command, args = [], options = {}) {
  const startedAt = Date.now();
  const usesWindowsCmdShim = isWindows && /\.cmd$/i.test(command);
  const actualCommand = usesWindowsCmdShim ? 'cmd.exe' : command;
  const actualArgs = usesWindowsCmdShim ? ['/d', '/s', '/c', command, ...args] : args;
  const result = spawnSync(actualCommand, actualArgs, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
  });

  const stdout = redact(result.stdout || '');
  const stderr = redact(result.stderr || '');
  const exitCode = typeof result.status === 'number' ? result.status : 1;

  return {
    name,
    command: [command, ...args].join(' '),
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode,
    durationMs: Date.now() - startedAt,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
    error: result.error ? redact(result.error.message) : undefined,
  };
}

export function tail(text, maxLines = 40) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
}

export function addResult(results, name, status, summary, details = {}) {
  results.push({
    name,
    status,
    summary,
    ...details,
  });
}

export function hasFailures(results) {
  return results.some((result) => result.status === 'FAIL');
}

export function loadEnvFile(file) {
  const absolute = path.resolve(repoRoot, file);
  if (!fs.existsSync(absolute)) {
    return { file, present: false, keys: new Set() };
  }

  const keys = new Set();
  const content = fs.readFileSync(absolute, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }

  return { file, present: true, keys };
}

export function envKeyPresent(key, files) {
  return Boolean(process.env[key]) || files.some((file) => file.keys.has(key));
}

export async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      textLength: text.length,
      requestId: response.headers.get('x-request-id') || undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, textLength: text.length };
  } finally {
    clearTimeout(timeout);
  }
}

export function markdownSummary(title, report) {
  const lines = [
    `# ${title}`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| Check | Status | Summary |',
    '| --- | --- | --- |',
  ];

  for (const result of report.results) {
    lines.push(`| ${result.name} | ${result.status} | ${String(result.summary || '').replace(/\|/g, '\\|')} |`);
  }

  lines.push('');
  lines.push(`Overall status: ${report.status}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
