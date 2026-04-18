import { getAgents } from "@/lib/config";
import { fetchAgentState, fetchUsage, type AgentState } from "@/lib/orb";
import { loadReviews, type ReviewRow } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAgentStates() {
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
  if (delta < 5) return "just now";
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

type OrbState = "awake" | "asleep" | "reviewing" | "waking" | "err";

function aggregateOrbState(states: AgentState[]): {
  orb: OrbState;
  chip: string;
  headline: string;
  desc: string;
} {
  const running = states.filter((s) => s === "running").length;
  const frozen = states.filter((s) => s === "frozen").length;
  const checkpointed = states.filter((s) => s === "checkpointed").length;
  const failed = states.filter((s) => s === "failed" || s === "absent").length;
  const awake = running + frozen;
  const n = states.length;

  if (n === 0) {
    return {
      orb: "err",
      chip: "offline",
      headline: "No agents configured.",
      desc: "The dashboard is live, but there are no agent deployments wired up yet.",
    };
  }
  if (failed === n) {
    return {
      orb: "err",
      chip: "offline",
      headline: "No agents are running right now.",
      desc: "The Orb sandboxes aren’t reachable. If this persists, check the agent logs.",
    };
  }
  if (running > 0) {
    return {
      orb: "reviewing",
      chip: "reviewing now",
      headline: `Reading a pull request on <em>${running}</em> ${running === 1 ? "repo" : "repos"} right now.`,
      desc: `${running} ${running === 1 ? "agent is" : "agents are"} actively reviewing. ${awake} of ${n} are awake; the rest are checkpointed to disk, costing nothing.`,
    };
  }
  if (frozen > 0 && checkpointed === 0) {
    return {
      orb: "waking",
      chip: "waiting on the model",
      headline: "Waiting on the language model.",
      desc: `${frozen} ${frozen === 1 ? "agent is" : "agents are"} frozen mid-review while the LLM responds. Orb will restore ${frozen === 1 ? "it" : "them"} in under a second.`,
    };
  }
  if (awake === 0) {
    return {
      orb: "asleep",
      chip: "all asleep",
      headline: "All reviewers are asleep.",
      desc: `${n} of ${n} agents checkpointed to disk. They cost nothing right now. The moment a pull request opens on a watched repository, GitHub will fire a webhook and the owning agent will wake up in under a second.`,
    };
  }
  return {
    orb: "awake",
    chip: "awake",
    headline: `<em>${awake}</em> of <em>${n}</em> reviewers awake.`,
    desc: "Some agents are on standby between reviews. Orb will park them back on disk if no webhook arrives soon.",
  };
}

function fmtState(s: AgentState): { label: string; cls: string } {
  switch (s) {
    case "running":
      return { label: "reviewing", cls: "reviewing" };
    case "frozen":
      return { label: "awake", cls: "awake" };
    case "checkpointed":
      return { label: "asleep", cls: "" };
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

  try {
    agentStates = await loadAgentStates();
  } catch {}
  try {
    reviews = await loadReviews(20);
  } catch {}
  try {
    usage = await fetchUsage();
  } catch {}

  const stateList = agentStates.map((a) => a.state);
  const agg = aggregateOrbState(stateList);
  const awakeCount = stateList.filter((s) => s === "running" || s === "frozen").length;
  const totalReviews = reviews.length;
  const lastReviewTs = reviews[0]?.reviewed_at ?? 0;
  const reposWatched = new Set(agentStates.flatMap((a) => a.repos)).size;

  const runtimeCost = usage ? usage.runtime_gb_hours * 0.005 : null;
  const diskCost = usage ? (usage.disk_gb_hours / (30 * 24)) * 0.05 : null;
  const totalCost = runtimeCost != null && diskCost != null ? runtimeCost + diskCost : null;

  const livePill =
    agg.orb === "reviewing" || agg.orb === "awake" || agg.orb === "waking"
      ? { cls: "", label: "live" }
      : agg.orb === "err"
      ? { cls: "off", label: "offline" }
      : { cls: "idle", label: "idle" };

  return (
    <main>
      <header className="site">
        <div className="brand">
          <div className="h">The Code Reviewer</div>
          <div className="sub">a pool of agents running on cloud, reviewing pull requests</div>
        </div>
        <div className="live">
          <span className={`live-dot ${livePill.cls}`} />
          <span>{livePill.label}</span>
        </div>
      </header>

      <section className="hero">
        <h1>
          An AI reviewer, running on cloud, reading pull requests and catching{" "}
          <em>the bugs</em> before they ship.
        </h1>
        <p className="lede">
          A pool of autonomous OpenHands agents. Each one watches a set of GitHub repositories. When a pull
          request opens, GitHub fires a webhook, the agent wakes up in under a second, explores the
          codebase, and posts a review with real file and line citations.
        </p>
      </section>

      <section className="now-card">
        <div className="now-orb" data-state={agg.orb}>
          <div className="ring" />
          <div className="core" />
        </div>
        <div className="now-copy">
          <div className="state-label">{agg.chip}</div>
          <div className="headline" dangerouslySetInnerHTML={{ __html: agg.headline }} />
          <div className="desc">{agg.desc}</div>
        </div>
      </section>

      <section className="story-section">
        <div className="eyebrow">how it works</div>
        <h2>Asleep by default, awake only when there is work.</h2>
        <p className="blurb">
          Each agent is a sandbox parked to disk with zero memory cost while idle. GitHub webhooks wake them
          up. Reviews take a couple of minutes; the rest of the day they are checkpointed. That is how the
          whole pool runs for the price of a coffee.
        </p>
        {agentStates.length > 0 && (
          <div className="agent-grid">
            {agentStates.map((a) => {
              const f = fmtState(a.state);
              return (
                <div key={a.id} className={`agent-card ${f.cls}`}>
                  <span className="dot" />
                  <div className="body">
                    <div className="name">{a.id}</div>
                    <div className="repos" title={a.repos.join(", ")}>
                      {a.repos.length === 0 ? "no repos assigned" : a.repos.join(", ")}
                    </div>
                  </div>
                  <div className="state">{f.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="story-section">
        <div className="eyebrow">what it has done</div>
        <h2>Reviews posted so far, across the watched repositories.</h2>
        <p className="blurb">
          Each review is a markdown comment on the pull request. Sections: summary, architecture, issues with
          severity and line numbers, cross-file impact, assessment. The agents are told to cite real files
          they read and to flag nothing if nothing is wrong.
        </p>
        <div className="stats-grid">
          <div className="stat">
            <div className="eye">reviews posted</div>
            <div className="v">{totalReviews}</div>
            <div className="sub">{lastReviewTs ? `most recent ${timeAgo(lastReviewTs)}` : "waiting for the first one"}</div>
          </div>
          <div className="stat">
            <div className="eye">repos watched</div>
            <div className="v">{reposWatched}</div>
            <div className="sub">
              {awakeCount} of {agentStates.length} {agentStates.length === 1 ? "agent" : "agents"} awake now
            </div>
          </div>
          <div className="stat">
            <div className="eye">cloud cost</div>
            <div className="v">{totalCost != null ? `$${totalCost.toFixed(2)}` : "—"}</div>
            <div className="sub">≈ past 30 days on orb · runtime plus disk</div>
          </div>
        </div>
      </section>

      <section className="story-section">
        <div className="eyebrow">recent reviews</div>
        <h2>The latest pull requests the pool has read.</h2>
        <p className="blurb">
          Each line is a review posted on GitHub. Click through to read the full markdown comment on the pull
          request itself.
        </p>
        {reviews.length === 0 ? (
          <div className="empty-rv">warming up — no reviews posted yet.</div>
        ) : (
          <div className="reviews-list">
            {reviews.map((r, i) => (
              <div key={`${r.repo}#${r.pr_number}`} className="rv-row">
                <div className="rv-n">{String(i + 1).padStart(2, "0")}</div>
                <div className="rv-body">
                  <div className="rv-title">
                    <a href={r.comment_url ?? r.pr_url}>{r.pr_title}</a>
                  </div>
                  <div className="rv-id">
                    {r.repo}#{r.pr_number}
                    {r.author ? ` · by ${r.author}` : ""}
                    {" · "}
                    <span style={{ color: "var(--ink-faint)" }}>{r.agent_id}</span>
                  </div>
                  {r.summary && <div className="rv-summary">{r.summary}</div>}
                  <div className="rv-tags">
                    {r.assessment && (
                      <span
                        className={`rv-tag assessment ${
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
                    {r.issues.critical > 0 && <span className="rv-tag crit">{r.issues.critical} critical</span>}
                    {r.issues.warning > 0 && <span className="rv-tag warn">{r.issues.warning} warning</span>}
                    {r.issues.suggestion > 0 && <span className="rv-tag">{r.issues.suggestion} suggestion</span>}
                  </div>
                </div>
                <div className="rv-ago">{timeAgo(r.reviewed_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="explain">
        <h3>A note on what this is and isn&rsquo;t.</h3>
        <p>
          Each review is written by an <strong>OpenHands</strong> agent — the same open-source software-engineering
          SDK that powers OpenHands Cloud — given a terminal and a file editor inside a cloned copy of the
          repository. The agent decides on its own what to read and how to reason about the diff.
        </p>
        <p>
          The agents run on <strong>Orb Cloud</strong>, which checkpoints them to disk the moment they are idle and
          restores them in under a second when a webhook arrives. The language model is connected via LiteLLM,
          which lets us swap providers without code changes.
        </p>
        <p>
          Reviews are automated opinions. They can be wrong. They are meant to be read, rebutted, or ignored.
        </p>
      </section>

      <footer className="site">
        <div>
          <span>powered by </span>
          <a href="https://github.com/OpenHands/software-agent-sdk">OpenHands</a>
          {" on "}
          <a href="https://docs.orbcloud.dev">Orb Cloud</a>
          {"  ·  "}
          <a href="https://github.com/nidhishgajjar/code-review-agent">agent source</a>
          {"  ·  "}
          <a href="https://github.com/nidhishgajjar/code-review-dashboard">dashboard source</a>
          {"  ·  auto-refresh every 5 min"}
        </div>
        <div className="right">automated reviews, not a replacement for a human reviewer · MIT licence</div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){location.reload()}, 300000);`,
        }}
      />
    </main>
  );
}
