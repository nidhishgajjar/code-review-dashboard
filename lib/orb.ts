import { requireOrbKey } from "./config";

const API = "https://api.orbcloud.dev";

function headers() {
  return {
    Authorization: `Bearer ${requireOrbKey()}`,
    Accept: "application/json",
  };
}

export type AgentState = "running" | "frozen" | "checkpointed" | "failed" | "absent";

export async function fetchAgentState(computerId: string): Promise<AgentState> {
  const r = await fetch(`${API}/v1/computers/${computerId}/agents`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!r.ok) return "absent";
  const data = await r.json();
  const agents: Array<{ state?: string }> = data.agents ?? [];
  if (agents.length === 0) return "absent";
  const s = agents[0].state as AgentState | undefined;
  return s ?? "absent";
}

export async function fetchFile(computerId: string, path: string): Promise<string | null> {
  const r = await fetch(`${API}/v1/computers/${computerId}/files/${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.text();
}

export type Usage = {
  period_start: string;
  period_end: string;
  runtime_gb_hours: number;
  disk_gb_hours: number;
  computers_created: number;
  computers_destroyed: number;
  checkpoint_cycles: number;
};

export async function fetchUsage(): Promise<Usage | null> {
  const r = await fetch(`${API}/v1/usage`, { headers: headers(), cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

export type ComputerStats = {
  window: string;
  period_start: string;
  period_end: string;
  wall_secs: number;
  active_secs: number;
  sleep_secs: number;
  sleep_pct: number;
  active_pct: number;
  llm_calls: number;
  checkpoints: number;
  ckpt_full: number;
  ckpt_incremental: number;
  failures: number;
  runtime_gb_hours: number;
  disk_gb_hours: number;
  est_cost_usd: number;
  last_active_ago_secs: number | null;
  avg_restore_ms: number | null;
};

export async function fetchStats(
  computerId: string,
  window: "30d" | "lifetime" = "30d",
): Promise<ComputerStats | null> {
  const r = await fetch(
    `${API}/v1/computers/${computerId}/stats?window=${window}`,
    { headers: headers(), cache: "no-store" },
  );
  if (!r.ok) return null;
  return r.json();
}
