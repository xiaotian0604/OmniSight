#!/usr/bin/env node
import { uploadSourcemaps } from './index.js';

function readArg(name) {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main() {
  const failOnError = readArg('--fail-on-error') !== 'false';

  const options = {
    appId: readArg('--app-id') || readArg('--appId'),
    dsn: readArg('--dsn'),
    apiKey: readArg('--api-key') || readArg('--apiKey'),
    release: readArg('--release'),
    dir: readArg('--dir') || 'dist',
    failOnError,
    gitCommit: readArg('--git-commit'),
    gitAuthor: readArg('--git-author'),
    gitMessage: readArg('--git-message'),
    gitBranch: readArg('--git-branch'),
  };

  const result = await uploadSourcemaps(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
