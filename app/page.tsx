import { getAgents } from "@/lib/config";
import { fetchAgentState, fetchUsage, type AgentState } from "@/lib/orb";
import { loadReviews, type ReviewRow } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAgentStates(): Promise<Array<{ id: string; repos: string[]; state: AgentState }>> {
  const agents = getAgents();
  return Promise.all(
    agents.map(async (a) => ({
      id: a.id,
      repos: a.repos,
      state: await fetchAgentState(a.computer_id),
    })),
  );
}

function timeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const delta = Math.max(0, now - ts);
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

function stateDisplay(s: AgentState): { label: string; cls: string } {
  switch (s) {
    case "running":
      return { label: "awake · reviewing", cls: "reviewing" };
    case "frozen":
      return { label: "awake · waiting on llm", cls: "awake" };
    case "checkpointed":
      return { label: "asleep · checkpointed", cls: "" };
    case "failed":
      return { label: "failed", cls: "failed" };
    default:
      return { label: "absent", cls: "failed" };
  }
}

export default async function Page() {
  let agentStates: Awaited<ReturnType<typeof loadAgentStates>> = [];
  let reviews: ReviewRow[] = [];
  let usage: Awaited<ReturnType<typeof fetchUsage>> = null;
  const errors: string[] = [];

  try {
    agentStates = await loadAgentStates();
  } catch (e) {
    errors.push(`agent states: ${(e as Error).message}`);
  }
  try {
    reviews = await loadReviews(20);
  } catch (e) {
    errors.push(`reviews: ${(e as Error).message}`);
  }
  try {
    usage = await fetchUsage();
  } catch (e) {
    errors.push(`usage: ${(e as Error).message}`);
  }

  const awakeCount = agentStates.filter((a) => a.state === "running" || a.state === "frozen").length;
  const totalReviews = reviews.length;
  const lastReviewTs = reviews[0]?.reviewed_at ?? 0;

  const runtimeCost = usage ? usage.runtime_gb_hours * 0.005 : null;
  const diskCost = usage ? (usage.disk_gb_hours / (30 * 24)) * 0.05 : null;
  const totalCost = runtimeCost != null && diskCost != null ? runtimeCost + diskCost : null;

  return (
    <>
      <header className="hero">
        <div className="eyebrow">
          <span className={`live ${awakeCount > 0 ? "awake" : ""}`}>
            <span className="dot" />
            {awakeCount > 0 ? `${awakeCount} awake` : "all asleep"}
          </span>
        </div>
        <h1>AI code reviewers · live</h1>
        <p className="lede">
          A pool of OpenHands agents running on Orb Cloud. Each agent owns a set of GitHub repositories. When a
          pull request opens, GitHub fires a webhook, the agent wakes up, reads the diff and explores the
          surrounding code, and posts a review. Otherwise it&rsquo;s checkpointed to disk and costs nothing.
        </p>
      </header>

      <section className="metrics">
        <div className="metric">
          <div className="label">reviews posted</div>
          <div className="value mono">{totalReviews}</div>
          <div className="sub">
            {lastReviewTs ? `last one ${timeAgo(lastReviewTs)}` : "none yet"}
          </div>
        </div>
        <div className="metric">
          <div className="label">agents awake now</div>
          <div className="value mono">
            {awakeCount}
            <span style={{ color: "var(--ink-faint)", fontSize: "0.9rem" }}>
              {" / "}
              {agentStates.length}
            </span>
          </div>
          <div className="sub">{agentStates.length === 0 ? "no agents configured" : "the rest are asleep"}</div>
        </div>
        <div className="metric">
          <div className="label">est. monthly cost</div>
          <div className="value mono">
            {totalCost != null ? `$${totalCost.toFixed(2)}` : "—"}
          </div>
          <div className="sub">orb runtime + disk, past 30 days</div>
        </div>
      </section>

      <section>
        <h2>Agents</h2>
        {agentStates.length === 0 ? (
          <div className="placeholder">No agents configured. Set AGENTS_JSON.</div>
        ) : (
          <div className="agents">
            {agentStates.map((a) => {
              const s = stateDisplay(a.state);
              return (
                <div key={a.id} className={`agent ${s.cls}`}>
                  <div className="id">
                    <span className="status-dot" />
                    {a.id}
                  </div>
                  <div className="repos">
                    {a.repos.length === 0 ? "no repos" : a.repos.join(" · ")}
                  </div>
                  <div className="state">{s.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2>Recent reviews</h2>
        {reviews.length === 0 ? (
          <div className="placeholder">No reviews yet.</div>
        ) : (
          <div className="feed">
            {reviews.map((r) => (
              <article key={`${r.repo}#${r.pr_number}`} className="review">
                <div className="top">
                  <span className="repo">
                    {r.repo}
                    <span className="num"> #{r.pr_number}</span>
                  </span>
                  <span className="ts mono">{timeAgo(r.reviewed_at)}</span>
                </div>
                <div className="title">
                  <a href={r.pr_url}>{r.pr_title}</a>
                </div>
                {r.summary && <div className="summary">{r.summary}</div>}
                <div className="meta">
                  <span className="pill">{r.agent_id}</span>
                  {r.assessment && (
                    <span
                      className={`pill assessment ${
                        r.assessment === "request-changes"
                          ? "warn"
                          : r.assessment === "approve"
                          ? "ok"
                          : ""
                      }`}
                    >
                      {r.assessment}
                    </span>
                  )}
                  {r.issues.critical > 0 && <span className="pill crit">{r.issues.critical} critical</span>}
                  {r.issues.warning > 0 && <span className="pill warn">{r.issues.warning} warning</span>}
                  {r.issues.suggestion > 0 && <span className="pill">{r.issues.suggestion} suggestion</span>}
                  {r.author && <span>by {r.author}</span>}
                  {r.comment_url && (
                    <a href={r.comment_url} style={{ marginLeft: "auto" }}>
                      open review →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <section>
          <div className="error">{errors.map((e) => `· ${e}`).join("  ")}</div>
        </section>
      )}

      <footer>
        <div className="row">
          <span>code-review-agent · read-only dashboard</span>
          <a href="https://github.com/nidhishgajjar/code-review-agent">source</a>
          <span>auto-refresh every 10s</span>
        </div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){location.reload()}, 10000);`,
        }}
      />
    </>
  );
}
