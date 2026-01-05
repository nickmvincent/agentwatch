/**
 * Git repository monitoring types
 * Ported from agentwatch/models.py
 */

/** Special repository states (merge, rebase, etc.) */
export interface RepoSpecialState {
  conflict: boolean;
  rebase: boolean;
  merge: boolean;
  cherryPick: boolean;
  revert: boolean;
}

/** Upstream tracking info */
export interface RepoUpstream {
  /** Commits ahead of upstream */
  ahead?: number;
  /** Commits behind upstream */
  behind?: number;
  /** Upstream branch name */
  upstreamName?: string;
}

/** Repository health/error tracking */
export interface RepoHealth {
  /** Last error message */
  lastError?: string;
  /** Whether last operation timed out */
  timedOut: boolean;
  /** Unix timestamp until backoff expires */
  backoffUntil: number;
}

/** Repository status */
export interface RepoStatus {
  /** Unique repository ID (path hash) */
  repoId: string;
  /** Full path to repository */
  path: string;
  /** Repository name (directory name) */
  name: string;
  /** Current branch name */
  branch?: string;
  /** Number of staged files */
  stagedCount: number;
  /** Number of unstaged modified files */
  unstagedCount: number;
  /** Number of untracked files */
  untrackedCount: number;
  /** Special states (merge, rebase, etc.) */
  specialState: RepoSpecialState;
  /** Upstream tracking info */
  upstream: RepoUpstream;
  /** Unix timestamp of last scan */
  lastScanTime: number;
  /** Unix timestamp of last detected change */
  lastChangeTime: number;
  /** Health/error tracking */
  health: RepoHealth;
}

/** Check if repository has uncommitted changes */
export function isRepoDirty(repo: RepoStatus): boolean {
  return repo.stagedCount + repo.unstagedCount + repo.untrackedCount > 0;
}

/** Check if repository is in a special state */
export function hasSpecialState(repo: RepoStatus): boolean {
  const s = repo.specialState;
  return s.conflict || s.rebase || s.merge || s.cherryPick || s.revert;
}

/** Create default repo special state */
export function defaultRepoSpecialState(): RepoSpecialState {
  return {
    conflict: false,
    rebase: false,
    merge: false,
    cherryPick: false,
    revert: false
  };
}

/** Create default repo upstream */
export function defaultRepoUpstream(): RepoUpstream {
  return {};
}

/** Create default repo health */
export function defaultRepoHealth(): RepoHealth {
  return {
    timedOut: false,
    backoffUntil: 0
  };
}
