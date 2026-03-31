export interface GitMetadata {
  gitCommit?: string;
  gitAuthor?: string;
  gitMessage?: string;
  gitBranch?: string;
}

export interface UploadSourcemapsOptions extends GitMetadata {
  appId: string;
  dsn: string;
  apiKey: string;
  dir: string;
  release?: string;
  failOnError?: boolean;
}

export interface UploadSourcemapsResult {
  release: string;
  uploaded: Array<{
    filename: string;
    filePath: string;
    response: unknown;
  }>;
  failed: Array<{
    filePath: string;
    error: string;
  }>;
}

export interface OmniSightVitePluginOptions extends UploadSourcemapsOptions {}

export declare function resolveRelease(explicitRelease?: string): Promise<string | undefined>;
export declare function collectGitMetadata(overrides?: GitMetadata): GitMetadata;
export declare function uploadSourcemaps(options: UploadSourcemapsOptions): Promise<UploadSourcemapsResult>;
export declare function omniSightVitePlugin(options: OmniSightVitePluginOptions): unknown;
