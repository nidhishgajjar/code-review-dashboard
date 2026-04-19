import { getAgents, requireGithubToken } from "./config";
import {
  fetchOurLatestComment,
  fetchViewerLogin,
  parseAssessment,
  parseSummary,
  countIssues,
} from "./github";

const API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${requireGithubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export type ReviewRow = {
  agent_id: string;
  repo: string;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  pr_state: string;
  pr_merged: boolean;
  author: string;
  comment_url: string | null;
  reviewed_at: number;
  assessment: string | null;
  summary: string | null;
  issues: { critical: number; warning: number; suggestion: number };
};

export type LoadReviewsOptions = {
  limit?: number;
  offset?: number;
};

export type LoadReviewsResult = {
  rows: ReviewRow[];
  total: number;
};

// Search API result item (subset we use).
type SearchItem = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  user?: { login?: string };
  repository_url: string; // https://api.github.com/repos/OWNER/REPO
  pull_request?: { merged_at?: string | null };
  updated_at: string;
};

// Walk GitHub search to find every PR our login ever commented on. Search
// caps at 1000 results (10 pages × 100) and 30 req/min — plenty of headroom
// for one dashboard render. Replaces the old per-repo walk (72 repos × 50
// comments = 3,600+ calls) with ~4-10 search calls, plus one comment fetch
// per matching PR that lands in a watched repo.
async function searchOurPrs(login: string): Promise<SearchItem[]> {
  const q = encodeURIComponent(`commenter:${login} type:pr`);
  const all: SearchItem[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(
      `${API}/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`,
      { headers: ghHeaders(), next: { revalidate: 300 } },
    );
    if (!r.ok) break;
    const d = (await r.json()) as { items?: SearchItem[]; total_count?: number };
    const items = d.items ?? [];
    all.push(...items);
    if (items.length < 100) break;
    if (all.length >= (d.total_count ?? 0)) break;
  }
  return all;
}

function ownerRepo(repository_url: string): string {
  return repository_url.replace(`${API}/repos/`, "");
}

/**
 * Find every PR across every watched repo with a review from us, merge-sort
 * by review time, return a page. Uses GitHub search + selective comment
 * fetches — cheap enough to fit comfortably under the 5000/hr core limit
 * and nowhere near the secondary (concurrency) limit.
 */
export async function loadReviews(
  opts: LoadReviewsOptions = {},
): Promise<LoadReviewsResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));
  const offset = Math.max(0, opts.offset ?? 0);

  const agents = getAgents();
  const login = await fetchViewerLogin();
  if (!login) return { rows: [], total: 0 };

  const repoToAgent = new Map<string, string>();
  for (const a of agents) {
    for (const r of a.repos) repoToAgent.set(r, a.id);
  }

  const items = await searchOurPrs(login);
  const matches = items.filter((it) => repoToAgent.has(ownerRepo(it.repository_url)));

  // Bounded concurrency for comment fetches. 6 is low enough to stay under
  // GitHub's secondary (concurrent request) limit even when several dashboard
  // instances render at once.
  const concurrency = 6;
  const rows: ReviewRow[] = new Array(matches.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, matches.length) }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= matches.length) return;
        const it = matches[idx];
        const repo = ownerRepo(it.repository_url);
        const agentId = repoToAgent.get(repo)!;
        const c = await fetchOurLatestComment(repo, it.number, login);
        if (!c) {
          rows[idx] = null as unknown as ReviewRow;
          continue;
        }
        rows[idx] = {
          agent_id: agentId,
          repo,
          pr_number: it.number,
          pr_title: it.title,
          pr_url: it.html_url,
          pr_state: it.state,
          pr_merged: !!it.pull_request?.merged_at,
          author: it.user?.login ?? "",
          comment_url: c.url,
          reviewed_at: Math.floor(new Date(c.created_at).getTime() / 1000),
          assessment: parseAssessment(c.body),
          summary: parseSummary(c.body),
          issues: countIssues(c.body),
        };
      }
    }),
  );

  const merged = rows.filter(Boolean);
  merged.sort((a, b) => b.reviewed_at - a.reviewed_at);
  return { rows: merged.slice(offset, offset + limit), total: merged.length };
}
