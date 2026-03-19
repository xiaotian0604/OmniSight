import { apiClient } from './client';

export interface SourcemapRecord {
  id: string;
  appId: string;
  version: string;
  filename: string;
  mapPath: string;
  gitCommit?: string;
  gitAuthor?: string;
  gitMessage?: string;
  gitBranch?: string;
  createdAt: string;
}

interface RawSourcemapRecord {
  id: string;
  app_id: string;
  version: string;
  filename: string;
  map_path: string;
  git_commit?: string | null;
  git_author?: string | null;
  git_message?: string | null;
  git_branch?: string | null;
  created_at: string;
}

export async function getSourcemaps(version?: string): Promise<SourcemapRecord[]> {
  const { data } = await apiClient.get<RawSourcemapRecord[]>('/sourcemap', {
    params: version ? { version } : undefined,
  });

  return data.map((item) => ({
    id: item.id,
    appId: item.app_id,
    version: item.version,
    filename: item.filename,
    mapPath: item.map_path,
    gitCommit: item.git_commit ?? undefined,
    gitAuthor: item.git_author ?? undefined,
    gitMessage: item.git_message ?? undefined,
    gitBranch: item.git_branch ?? undefined,
    createdAt: item.created_at,
  }));
}
