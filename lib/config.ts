export type AgentConfig = {
  id: string;
  computer_id: string;
  url: string;
  repos: string[];
};

export function getAgents(): AgentConfig[] {
  const raw = process.env.AGENTS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AgentConfig[];
  } catch {
    return [];
  }
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
