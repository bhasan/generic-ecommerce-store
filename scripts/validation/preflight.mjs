#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  addResult,
  envKeyPresent,
  fetchJson,
  fetchText,
  hasFailures,
  loadEnvFile,
  markdownSummary,
  nowIso,
  npmCommand,
  repoRoot,
  runCommand,
  writeJson,
  writeText,
} from './lib.mjs';

const reportDir = path.join(repoRoot, 'build', 'preflight-report');
const results = [];
const envFiles = ['.env', 'backend/.env', 'web/.env', '.env.prod'].map(loadEnvFile);
const apiBaseUrl = (process.env.SMOKE_STATION_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const webBaseUrl = (process.env.SMOKE_STATION_WEB_BASE_URL || 'http://localhost:5843').replace(/\/$/, '');

function commandGate(name, command, args, passSummary) {
  const result = runCommand(name, command, args);
  addResult(results, name, result.status, result.status === 'PASS' ? passSummary : result.stderrTail || result.stdoutTail || result.error || 'Command failed.', {
    command: result.command,
    durationMs: result.durationMs,
  });
  return result;
}

function envGate(name, keys, required = true) {
  const missing = keys.filter((key) => !envKeyPresent(key, envFiles));
  if (missing.length === 0) {
    addResult(results, name, 'PASS', `Required keys present: ${keys.join(', ')}.`);
    return;
  }

  addResult(
    results,
    name,
    required ? 'FAIL' : 'SKIP',
    `${required ? 'Missing required' : 'Optional keys not configured'}: ${missing.join(', ')}.`,
  );
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  addResult(
    results,
    'node_runtime',
    nodeMajor >= 20 ? 'PASS' : 'FAIL',
    `Node ${process.version}; required >= 20.`,
  );

  commandGate('npm_runtime', npmCommand, ['--version'], 'npm command is available.');
  commandGate('docker_runtime', 'docker', ['--version'], 'Docker command is available.');
  commandGate('docker_compose_runtime', 'docker', ['compose', 'version'], 'Docker Compose command is available.');

  const compose = commandGate(
    'docker_compose_dev_services',
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'ps'],
    'Docker Compose dev services are inspectable.',
  );
  if (compose.status === 'PASS') {
    const output = `${compose.stdoutTail || ''} ${compose.stderrTail || ''}`;
    for (const service of ['smoke-station-delivery-db', 'smoke-station-delivery-backend', 'smoke-station-delivery-web-dev']) {
      addResult(
        results,
        `compose_service_${service}`,
        output.includes(service) ? 'PASS' : 'FAIL',
        output.includes(service) ? `${service} appears in compose ps output.` : `${service} was not found in compose ps output.`,
      );
    }
  }

  envGate('root_local_env', ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']);
  envGate('backend_local_env', ['DATABASE_URL', 'PORT', 'NODE_ENV', 'REQUEST_TIMEOUT_MS']);
  envGate('frontend_optional_env', ['VITE_API_BASE_URL', 'VITE_API_TIMEOUT_MS'], false);
  envGate('provider_live_env', ['GOOGLE_GEOCODING_API_KEY', 'MAKE_WEBHOOK_URL', 'MAKE_API_KEY'], false);
  envGate('print_agent_env', ['PRINT_AGENT_SHARED_KEY'], false);
  envGate('production_live_env', ['SMOKE_STATION_LIVE_BASE_URL', 'SMOKE_STATION_LIVE_ADMIN_USERNAME', 'SMOKE_STATION_LIVE_ADMIN_PASSWORD'], false);

  try {
    const health = await fetchJson(`${apiBaseUrl}/health`);
    const healthy = health.status === 200 && health.json?.checks?.database === 'ok';
    addResult(
      results,
      'backend_health',
      healthy ? 'PASS' : 'FAIL',
      `GET ${apiBaseUrl}/health returned ${health.status}; database=${health.json?.checks?.database ?? 'unknown'}.`,
      { requestId: health.requestId },
    );
  } catch (error) {
    addResult(results, 'backend_health', 'FAIL', `GET ${apiBaseUrl}/health failed: ${error.message}.`);
  }

  try {
    const web = await fetchText(webBaseUrl);
    addResult(
      results,
      'frontend_entrypoint',
      web.status === 200 ? 'PASS' : 'FAIL',
      `GET ${webBaseUrl} returned ${web.status}; body length ${web.textLength}.`,
    );
  } catch (error) {
    addResult(results, 'frontend_entrypoint', 'FAIL', `GET ${webBaseUrl} failed: ${error.message}.`);
  }

  const report = {
    generatedAt: nowIso(),
    status: hasFailures(results) ? 'FAIL' : 'PASS',
    apiBaseUrl,
    webBaseUrl,
    envFiles: envFiles.map((file) => ({ file: file.file, present: file.present, keyCount: file.keys.size })),
    results,
  };

  writeJson(path.join(reportDir, 'summary.json'), report);
  writeText(path.join(reportDir, 'summary.md'), markdownSummary('Smoke Station Preflight Report', report));

  if (report.status === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
