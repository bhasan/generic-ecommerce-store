#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  addResult,
  hasFailures,
  markdownSummary,
  nowIso,
  npmCommand,
  repoRoot,
  runCommand,
  writeJson,
  writeText,
} from './lib.mjs';

const reportDir = path.join(repoRoot, 'build', 'e2e-report');
const results = [];

function runGate(name, command, args, summary) {
  const result = runCommand(name, command, args);
  addResult(results, name, result.status, result.status === 'PASS' ? summary : result.stderrTail || result.stdoutTail || result.error || 'Gate failed.', {
    command: result.command,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  });
  return result.status === 'PASS';
}

function main() {
  runGate('preflight', 'node', ['scripts/validation/preflight.mjs'], 'Preflight completed.');
  runGate('prisma_generate', npmCommand, ['--prefix', 'backend', 'run', 'prisma:generate'], 'Prisma client generated from current schema.');
  runGate(
    'migration_status',
    'docker',
    ['exec', 'smoke-station-delivery-backend', 'npx', 'prisma', 'migrate', 'status'],
    'Local dev database migration history is clean.',
  );
  runGate('backend_tests', npmCommand, ['run', 'test:backend'], 'Backend Vitest suite passed.');
  runGate('backend_build', npmCommand, ['--prefix', 'backend', 'run', 'build'], 'Backend TypeScript build passed.');
  runGate('frontend_tests', npmCommand, ['run', 'test:web'], 'Frontend Vitest suite passed.');
  runGate('frontend_build', npmCommand, ['--prefix', 'web', 'run', 'build'], 'Frontend Vite build passed.');
  runGate('local_smoke', 'node', ['scripts/validation/local-smoke.mjs'], 'Local API smoke checks passed.');

  const report = {
    generatedAt: nowIso(),
    status: hasFailures(results) ? 'FAIL' : 'PASS',
    meaning: 'PASS means controlled local/preproduction verification passed. It does not mean production readiness, security signoff, provider reconciliation, or backup/restore acceptance.',
    results,
  };

  writeJson(path.join(reportDir, 'summary.json'), report);
  writeText(path.join(reportDir, 'summary.md'), markdownSummary('Smoke Station Local E2E Verification Report', report));

  if (report.status === 'FAIL') {
    process.exitCode = 1;
  }
}

main();
