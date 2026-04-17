import { getAgents } from "./config";
import {
  fetchOurLatestComment,
  fetchViewerLogin,
  parseAssessment,
  parseSummary,
  countIssues,
  type PRInfo,
} from "./github";
import { requireGithubToken } from "./config";

const API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${requireGithubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// List PRs for a repo (any state). Cheap for small fixture repos; for big repos
// we'd paginate or cap. per_page=50 keeps each call under the secondary limits.
async function listRepoPrs(repo: string): Promise<PRInfo[]> {
  const r = await fetch(
    `${API}/repos/${repo}/pulls?state=all&per_page=50&sort=updated&direction=desc`,
    { headers: ghHeaders(), next: { revalidate: 60 } },
  );
  if (!r.ok) return [];
  const data = (await r.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
    user?: { login?: string };
    merged_at: string | null;
    state: string;
  }>;
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    html_url: p.html_url,
    user: p.user?.login ?? "",
    merged: !!p.merged_at,
    state: p.state,
  }));
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
  reviewed_at: number; // unix ts
  assessment: string | null;
  summary: string | null;
  issues: { critical: number; warning: number; suggestion: number };
};

export async function loadReviews(limit = 20): Promise<ReviewRow[]> {
  const agents = getAgents();
  const login = await fetchViewerLogin();
  if (!login) return [];

  // map repo -> agent_id
  const repoToAgent = new Map<string, string>();
  for (const a of agents) {
    for (const r of a.repos) repoToAgent.set(r, a.id);
  }

  const rows: ReviewRow[] = [];
  for (const [repo, agentId] of repoToAgent) {
    const prs = await listRepoPrs(repo);
    // pull our latest comment per PR concurrently
    const withComments = await Promise.all(
      prs.map(async (pr) => {
        const c = await fetchOurLatestComment(repo, pr.number, login);
        return { pr, comment: c };
      }),
    );
    for (const { pr, comment } of withComments) {
      if (!comment) continue;
      rows.push({
        agent_id: agentId,
        repo,
        pr_number: pr.number,
        pr_title: pr.title,
        pr_url: pr.html_url,
        pr_state: pr.state,
        pr_merged: pr.merged,
        author: pr.user,
        comment_url: comment.url,
        reviewed_at: Math.floor(new Date(comment.created_at).getTime() / 1000),
        assessment: parseAssessment(comment.body),
        summary: parseSummary(comment.body),
        issues: countIssues(comment.body),
      });
    }
  }

  rows.sort((a, b) => b.reviewed_at - a.reviewed_at);
  return rows.slice(0, limit);
}
