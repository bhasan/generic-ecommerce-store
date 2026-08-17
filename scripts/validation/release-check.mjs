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

const reportDir = path.join(repoRoot, 'build', 'release-report');
const results = [];

function runGate(name, command, args, summary, required = true) {
  const result = runCommand(name, command, args);
  addResult(results, name, result.status, result.status === 'PASS' ? summary : result.stderrTail || result.stdoutTail || result.error || 'Gate failed.', {
    command: result.command,
    required,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
  });
}

function skipGate(name, summary, required = false) {
  addResult(results, name, 'SKIP', summary, { required });
}

function main() {
  runGate('backend_tests', npmCommand, ['run', 'test:backend'], 'Backend tests passed.');
  runGate('frontend_tests', npmCommand, ['run', 'test:web'], 'Frontend tests passed.');
  runGate('prisma_generate', npmCommand, ['--prefix', 'backend', 'run', 'prisma:generate'], 'Prisma client generated.');
  runGate('backend_build', npmCommand, ['--prefix', 'backend', 'run', 'build'], 'Backend build passed.');
  runGate('frontend_build', npmCommand, ['--prefix', 'web', 'run', 'build'], 'Frontend build passed.');
  runGate('root_audit_high', npmCommand, ['audit', '--audit-level=high'], 'Root dependency audit passed at high severity.');
  runGate('backend_audit_high', npmCommand, ['--prefix', 'backend', 'audit', '--audit-level=high'], 'Backend dependency audit passed at high severity.');
  runGate('frontend_audit_high', npmCommand, ['--prefix', 'web', 'audit', '--audit-level=high'], 'Frontend dependency audit passed at high severity.');
  runGate(
    'migration_status',
    'docker',
    ['exec', 'generic-ecommerce-store-delivery-backend', 'npx', 'prisma', 'migrate', 'status'],
    'Local dev database migration history is clean.',
  );

  if (process.env.SMOKE_STATION_RELEASE_DOCKER_BUILD === 'true') {
    runGate(
      'docker_dev_build',
      'docker',
      ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'build'],
      'Docker dev images built.',
    );
  } else {
    skipGate('docker_dev_build', 'Set SMOKE_STATION_RELEASE_DOCKER_BUILD=true to run this external build gate.');
  }

  runGate('app_health_and_smoke', 'node', ['scripts/validation/local-smoke.mjs'], 'App health and local smoke checks passed.');
  runGate('local_e2e_verification', 'node', ['scripts/validation/verify-local.mjs'], 'Local verification chain passed.');

  skipGate('live_verification_review', 'Run configured deployed/live Playwright suite and attach reports before production readiness approval.');
  skipGate('security_tenant_isolation_review', 'Run live/local security project and review skipped checks before production readiness approval.');
  skipGate('backup_restore_review', 'No backup/restore script is currently mapped for this repo; attach operator evidence if applicable.');
  skipGate('docs_changelog_review', 'Operator must confirm docs/changelog are updated for the release scope.', false);

  const requiredFailures = results.filter((result) => result.required !== false && result.status !== 'PASS');
  const report = {
    generatedAt: nowIso(),
    status: hasFailures(results) || requiredFailures.length > 0 ? 'FAIL' : 'PASS',
    approvalRule: 'Release approval requires every required gate to PASS or be explicitly documented as SKIP/not applicable with reason and reviewer signoff.',
    results,
  };

  writeJson(path.join(reportDir, 'summary.json'), report);
  writeText(path.join(reportDir, 'summary.md'), markdownSummary('Generic Ecommerce Store Release Gate Report', report));

  if (report.status === 'FAIL') {
    process.exitCode = 1;
  }
}

main();
