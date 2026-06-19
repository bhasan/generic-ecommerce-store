import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { liveEnv } from './helpers/env';

type Entry = {
  title: string;
  status: string;
  durationMs: number;
  project?: string;
  error?: string;
};

class LiveSummaryReporter implements Reporter {
  private entries: Entry[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    this.entries.push({
      title: test.titlePath().slice(1).join(' > '),
      status: result.status.toUpperCase(),
      durationMs: result.duration,
      project: test.parent.project()?.name,
      error: result.error?.message,
    });
  }

  onEnd(result: FullResult) {
    fs.mkdirSync(liveEnv.reportsDir, { recursive: true });
    const summary = {
      generatedAt: new Date().toISOString(),
      status: result.status.toUpperCase(),
      baseUrl: liveEnv.baseUrl,
      apiBaseUrl: liveEnv.apiBaseUrl,
      allowSafeWrites: liveEnv.allowSafeWrites,
      allowProviderTests: liveEnv.allowProviderTests,
      allowAiTests: liveEnv.allowAiTests,
      tests: this.entries,
    };

    fs.writeFileSync(path.join(liveEnv.reportsDir, 'latest-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(path.join(liveEnv.reportsDir, 'latest-summary.md'), toMarkdown(summary));
  }
}

function toMarkdown(summary: {
  generatedAt: string;
  status: string;
  baseUrl: string;
  apiBaseUrl: string;
  tests: Entry[];
}) {
  const lines = [
    '# Smoke Station Live Verification Summary',
    '',
    `Generated: ${summary.generatedAt}`,
    `Overall status: ${summary.status}`,
    `Base URL: ${summary.baseUrl}`,
    `API Base URL: ${summary.apiBaseUrl}`,
    '',
    '| Project | Test | Status | Duration ms |',
    '| --- | --- | --- | --- |',
  ];

  for (const test of summary.tests) {
    lines.push(`| ${test.project || ''} | ${test.title.replace(/\|/g, '\\|')} | ${test.status} | ${test.durationMs} |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export default LiveSummaryReporter;
