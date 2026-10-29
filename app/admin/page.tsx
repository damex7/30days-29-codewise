import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { getAdminDashboard } from "@/lib/services/admin";
import { runDailyIfStale } from "@/lib/services/cron";
import { NotFoundError } from "@/lib/services/errors";
import { formatMicroUsd } from "@/lib/ai/pricing";
import { MODE_INFO, languageLabel, type Mode } from "@/lib/constants";
import { formatWhen } from "@/lib/format";
import { StatusBadge } from "@/components/badges";
import { UserToggle } from "@/components/admin-user-toggle";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-ink">Admin</h1>
      <p className="mt-1 max-w-3xl text-muted">
        Usage and outcomes across everyone, calculated in SQL. You can see counts, tokens and costs, never anyone&apos;s code or answers: a person&apos;s
        code is theirs unless they share a snippet.
      </p>
      <Suspense fallback={<div className="mt-6 h-[40rem] skeleton" aria-hidden="true" />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

const th = "border-b border-line px-3 py-2 text-left text-sm font-semibold text-ink";
const td = "border-b border-line px-3 py-2 text-sm text-ink";

async function Dashboard() {
  const actor = await requireUser("/admin");
  if (actor.role !== "admin") notFound();
  // Lazy cron: if the scheduled job hasn't run in 12 hours, run it now.
  await runDailyIfStale().catch(() => false);
  let d;
  try {
    d = await getAdminDashboard(actor);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const modes = d.top.filter((t) => t.kind === "mode");
  const languages = d.top.filter((t) => t.kind === "language").slice(0, 6);

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="usage-h">
        <h2 id="usage-h" className="text-xl font-bold text-ink">
          Usage and estimated cost
        </h2>
        <p className="mt-1 text-sm text-muted">
          Free-tier real cost is $0. &quot;Estimated paid cost&quot; is what the same tokens would cost at list prices (integer micro-dollars, lib/ai/pricing.ts).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {d.usage.map((u) => (
            <div key={u.days} className="rounded-lg border border-line bg-card p-4">
              <h3 className="text-lg font-bold text-ink">Last {u.days} days</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Runs</dt>
                <dd className="font-mono text-ink">{u.runs.toLocaleString("en-US")}</dd>
                <dt className="text-muted">Tokens in / out</dt>
                <dd className="font-mono text-ink">
                  {u.input_tokens.toLocaleString("en-US")} / {u.output_tokens.toLocaleString("en-US")}
                </dd>
                <dt className="text-muted">Est. paid cost</dt>
                <dd className="font-mono font-bold text-ink">{formatMicroUsd(u.cost_micro_usd)}</dd>
                <dt className="text-muted">Avg latency</dt>
                <dd className="font-mono text-ink">{u.avg_latency_ms !== null ? `${(u.avg_latency_ms / 1000).toFixed(1)}s` : "–"}</dd>
                <dt className="text-muted">Mock fallbacks</dt>
                <dd className="font-mono text-ink">{u.fallback}</dd>
                <dt className="text-muted">Rate-limited</dt>
                <dd className="font-mono text-ink">{u.rate_limited}</dd>
                <dt className="text-muted">Blocked (secret)</dt>
                <dd className="font-mono text-ink">{u.blocked_secret}</dd>
                <dt className="text-muted">Unstructured output</dt>
                <dd className="font-mono text-ink">{u.invalid_output}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="outcomes-h" className="min-w-0">
          <h2 id="outcomes-h" className="text-xl font-bold text-ink">
            Run outcomes (30 days)
          </h2>
          {d.outcomes.length ? (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Runs by outcome, last 30 days</caption>
                <thead>
                  <tr>
                    <th className={th}>Outcome</th>
                    <th className={`${th} text-right`}>Runs</th>
                    <th className={`${th} text-right`}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {d.outcomes.map((o) => (
                    <tr key={o.status}>
                      <td className={td}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={`${td} text-right font-mono`}>{o.n}</td>
                      <td className={`${td} text-right font-mono`}>{o.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-muted">No runs in the last 30 days.</p>
          )}
        </section>

        <section aria-labelledby="top-h" className="min-w-0">
          <h2 id="top-h" className="text-xl font-bold text-ink">
            Top modes and languages (30 days)
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { title: "Modes", rows: modes, label: (n: string) => MODE_INFO[n as Mode]?.label ?? n },
              { title: "Languages", rows: languages, label: languageLabel },
            ].map((group) => (
              <table key={group.title} className="w-full">
                <caption className="pb-1 text-left text-sm font-semibold text-muted">{group.title}</caption>
                <tbody>
                  {group.rows.map((r) => (
                    <tr key={r.name}>
                      <td className={td}>{group.label(r.name)}</td>
                      <td className={`${td} text-right font-mono`}>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="fb-h">
        <h2 id="fb-h" className="text-xl font-bold text-ink">
          Feedback (30 days)
        </h2>
        <p className="mt-2 text-ink">
          {d.feedback.total
            ? `${d.feedback.down} of ${d.feedback.total} ratings were thumbs-down (${d.feedback.down_pct}%).`
            : "No ratings yet."}
        </p>
        {d.reasons.length ? (
          <ul className="mt-3 space-y-2">
            {d.reasons.map((r, i) => (
              <li key={i} className="rounded-md border border-line p-3 text-sm text-ink">
                <span className="font-semibold">{MODE_INFO[r.mode as Mode]?.label ?? r.mode}</span> · {languageLabel(r.language)} ·{" "}
                <time dateTime={new Date(r.created_at).toISOString()}>{formatWhen(new Date(r.created_at).toISOString())}</time>
                <p className="mt-1">“{r.reason}”</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="users-h">
        <h2 id="users-h" className="text-xl font-bold text-ink">
          Users
        </h2>
        <p className="mt-1 text-sm text-muted">
          {d.demos} demo account{d.demos === 1 ? "" : "s"} currently exist (deleted after 24 hours, not listed). Disabling signs the person out everywhere,
          turns off their share links and emails them.
        </p>
        {/* relative: the buttons' sr-only labels are absolutely positioned; this keeps them inside the scroll box */}
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem]">
            <caption className="sr-only">Registered users</caption>
            <thead>
              <tr>
                <th className={th}>Email</th>
                <th className={th}>Role</th>
                <th className={`${th} text-right`}>Runs (30d)</th>
                <th className={`${th} text-right`}>Est. cost (30d)</th>
                <th className={th}>Last run</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.users.map((u) => (
                <tr key={u.id}>
                  <td className={`${td} break-all`}>{u.email}</td>
                  <td className={td}>{u.role}</td>
                  <td className={`${td} text-right font-mono`}>{u.runs_30d}</td>
                  <td className={`${td} text-right font-mono`}>{formatMicroUsd(u.cost_30d)}</td>
                  <td className={td}>{u.last_run_at ? formatWhen(new Date(u.last_run_at).toISOString()) : "–"}</td>
                  <td className={td}>
                    {u.role === "admin" || u.id === actor.id ? (
                      <span className="text-muted">{u.disabled_at ? "Disabled" : "Active"}</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{u.disabled_at ? "Disabled" : "Active"}</span>
                        <UserToggle userId={u.id} email={u.email} disabled={Boolean(u.disabled_at)} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cron-h">
        <h2 id="cron-h" className="text-xl font-bold text-ink">
          Daily cleanup
        </h2>
        <p className="mt-1 text-sm text-ink">
          {d.cron
            ? `Last run ${formatWhen(new Date(d.cron.started_at).toISOString())} (${d.cron.trigger}, ${d.cron.ok ? "ok" : d.cron.ok === false ? "failed" : "running"}): ${Object.entries(d.cron.details ?? {})
                .map(([k, v]) => `${k} ${v}`)
                .join(", ") || "no details"}.`
            : "The daily job has not run yet."}
        </p>
      </section>
    </div>
  );
}
