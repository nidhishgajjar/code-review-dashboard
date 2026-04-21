import agentsFromFile from "@/config/agents.json";

export type AgentConfig = {
  id: string;
  computer_id: string;
  url: string;
  repos: string[];
};

// Source of truth is config/agents.json (committed to the repo). Rotating a
// CID is a git commit, not a Vercel env edit. AGENTS_JSON env var is no
// longer read — delete it from Vercel to avoid drift.
export function getAgents(): AgentConfig[] {
  return agentsFromFile as AgentConfig[];
}

export function requireOrbKey(): string {
  const k = process.env.ORB_API_KEY;
  if (!k) throw new Error("ORB_API_KEY not set");
  return k;
}

export function requireGithubToken(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_TOKEN not set");
  return t;
}
