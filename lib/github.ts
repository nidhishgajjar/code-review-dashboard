import { requireGithubToken } from "./config";

const API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${requireGithubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export type PRInfo = {
  number: number;
  title: string;
  html_url: string;
  user: string;
  merged: boolean;
  state: string;
};

export async function fetchPr(repo: string, number: number): Promise<PRInfo | null> {
  const r = await fetch(`${API}/repos/${repo}/pulls/${number}`, {
    headers: headers(),
    next: { revalidate: 60 },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return {
    number: d.number,
    title: d.title,
    html_url: d.html_url,
    user: d.user?.login ?? "",
    merged: !!d.merged,
    state: d.state,
  };
}

export type OurComment = {
  id: number;
  url: string;
  created_at: string;
  body: string;
};

export async function fetchOurLatestComment(repo: string, prNumber: number, login: string): Promise<OurComment | null> {
  const r = await fetch(`${API}/repos/${repo}/issues/${prNumber}/comments?per_page=100`, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!r.ok) return null;
  const comments = (await r.json()) as Array<{
    id: number;
    user?: { login?: string };
    html_url: string;
    created_at: string;
    body: string;
  }>;
  const ours = comments.filter((c) => c.user?.login === login);
  if (ours.length === 0) return null;
  const latest = ours[ours.length - 1];
  return {
    id: latest.id,
    url: latest.html_url,
    created_at: latest.created_at,
    body: latest.body,
  };
}

export async function fetchViewerLogin(): Promise<string | null> {
  const r = await fetch(`${API}/user`, { headers: headers(), next: { revalidate: 86400 } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.login ?? null;
}

export function parseAssessment(body: string): string | null {
  // The review always ends with an "## Assessment" section starting with approve/request-changes/comment
  const m = body.match(/##\s*Assessment\s*\n\s*([a-zA-Z-]+)/);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (["approve", "request-changes", "comment"].includes(v)) return v;
  return null;
}

export function parseSummary(body: string): string | null {
  const m = body.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##\s)/);
  if (!m) return null;
  return m[1].trim().split(/\n\n/)[0].trim();
}

export function countIssues(body: string): { critical: number; warning: number; suggestion: number } {
  const issues = body.match(/##\s*Issues\s*\n([\s\S]*?)(?=\n##\s)/)?.[1] ?? "";
  return {
    critical: (issues.match(/\[critical\]/gi) || []).length,
    warning: (issues.match(/\[warning\]/gi) || []).length,
    suggestion: (issues.match(/\[suggestion\]/gi) || []).length,
  };
}
