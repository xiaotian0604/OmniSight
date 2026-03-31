import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function trimTrailingSlash(input) {
  return input.replace(/\/+$/, '');
}

function runGit(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
  } catch {
    return undefined;
  }
}

function getEnvRelease() {
  const candidates = [
    process.env.OMNISIGHT_RELEASE,
    process.env.RELEASE,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim();
}

export async function resolveRelease(explicitRelease) {
  return (
    explicitRelease?.trim() ||
    getEnvRelease() ||
    runGit('git rev-parse --short HEAD') ||
    undefined
  );
}

export function collectGitMetadata(overrides = {}) {
  return {
    gitCommit: overrides.gitCommit || process.env.GIT_COMMIT || runGit('git rev-parse HEAD'),
    gitAuthor: overrides.gitAuthor || process.env.GIT_AUTHOR_NAME || runGit('git log -1 --pretty=%an'),
    gitMessage: overrides.gitMessage || process.env.GIT_MESSAGE || runGit('git log -1 --pretty=%s'),
    gitBranch: overrides.gitBranch || process.env.GIT_BRANCH || runGit('git rev-parse --abbrev-ref HEAD'),
  };
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function findJavaScriptSourcemaps(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  return walk(dir).filter((filePath) => filePath.endsWith('.js.map'));
}

function buildUploadUrl(dsn) {
  return `${trimTrailingSlash(dsn)}/v1/sourcemap`;
}

async function uploadSingleSourcemap({ dsn, apiKey, appId, release, filePath, gitMetadata }) {
  const mapContent = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.map');
  const response = await fetch(buildUploadUrl(dsn), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      appId,
      version: release,
      filename,
      mapContent,
      ...gitMetadata,
    }),
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok || responseBody?.success === false) {
    throw new Error(
      responseBody?.message || responseBody?.error || `Upload failed for ${filename}: HTTP ${response.status}`,
    );
  }

  return {
    filename,
    filePath,
    response: responseBody,
  };
}

export async function uploadSourcemaps(options) {
  const {
    appId,
    dsn,
    apiKey,
    dir,
    release: explicitRelease,
    failOnError = true,
    ...gitOverrides
  } = options;

  if (!appId || !dsn || !apiKey || !dir) {
    throw new Error('appId, dsn, apiKey and dir are required');
  }

  const release = await resolveRelease(explicitRelease);
  if (!release) {
    throw new Error('Unable to resolve release. Pass options.release or provide a git/env release source.');
  }

  const sourcemapFiles = findJavaScriptSourcemaps(dir);
  const gitMetadata = collectGitMetadata(gitOverrides);
  const uploaded = [];
  const failed = [];

  for (const filePath of sourcemapFiles) {
    try {
      uploaded.push(
        await uploadSingleSourcemap({
          dsn,
          apiKey,
          appId,
          release,
          filePath,
          gitMetadata,
        }),
      );
    } catch (error) {
      failed.push({
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed.length > 0 && failOnError) {
    throw new Error(`Failed to upload ${failed.length} sourcemap(s): ${failed.map((item) => `${path.basename(item.filePath)} -> ${item.error}`).join('; ')}`);
  }

  return {
    release,
    uploaded,
    failed,
  };
}

export function omniSightVitePlugin(options) {
  let resolvedConfig;
  let cachedReleasePromise;

  const ensureRelease = async () => {
    if (!cachedReleasePromise) {
      cachedReleasePromise = resolveRelease(options.release);
    }

    const release = await cachedReleasePromise;
    if (!release) {
      throw new Error('[OmniSight] Unable to resolve release for Vite plugin');
    }

    return release;
  };

  return {
    name: 'omnisight-vite-plugin',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    async transformIndexHtml() {
      const release = await ensureRelease();
      const escapedRelease = JSON.stringify(release);

      return [
        {
          tag: 'meta',
          injectTo: 'head',
          attrs: {
            name: 'omnisight-release',
            content: release,
          },
        },
        {
          tag: 'script',
          injectTo: 'head',
          children: `window.__OMNISIGHT_RELEASE__ = ${escapedRelease};`,
        },
      ];
    },
    async closeBundle() {
      const release = await ensureRelease();
      const outputDir = path.resolve(
        resolvedConfig?.root || process.cwd(),
        options.dir || resolvedConfig?.build?.outDir || 'dist',
      );

      const result = await uploadSourcemaps({
        ...options,
        dir: outputDir,
        release,
        failOnError: options.failOnError ?? true,
      });

      if (resolvedConfig?.logger) {
        resolvedConfig.logger.info(
          `[omnisight] uploaded ${result.uploaded.length} sourcemap(s) for release ${result.release}`,
        );
      }
    },
  };
}
