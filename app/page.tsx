import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { MODES, MODE_INFO } from "@/lib/constants";
import { providerStatus } from "@/lib/ai/status";
import { ProviderBadge } from "@/components/provider-badge";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <section aria-labelledby="hero" className="max-w-3xl">
        <h1 id="hero" className="text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
          A calm workbench for reading, writing and fixing code.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Paste code or an error, pick a mode, and get a clear answer: explained at your level, reviewed line by line, or fixed with a diff you can
          check. Made with students and junior developers in Nigeria in mind. Answers come in English or Nigerian Pidgin.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/sign-up" className="inline-flex min-h-11 items-center rounded-md bg-brand-btn px-5 font-semibold text-on-brand no-underline">
            Create a free account
          </Link>
        </div>
        <div className="mt-5">
          <Suspense fallback={<span className="inline-block h-7 w-64 skeleton" aria-hidden="true" />}>
            <ActiveProvider />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="modes" className="mt-14">
        <h2 id="modes" className="text-2xl font-bold text-ink">
          Six modes
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode, i) => (
            <li key={mode} className="rounded-lg border border-line bg-card p-5">
              <p className="font-mono text-xs text-muted" aria-hidden="true">
                0{i + 1}
              </p>
              <h3 className="mt-1 text-lg font-bold text-ink">{MODE_INFO[mode].label}</h3>
              <p className="mt-1 text-muted">{MODE_INFO[mode].blurb}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="promises" className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        <h2 id="promises" className="sr-only">
          How Codewise treats your code
        </h2>
        <div className="rounded-lg bg-code p-5 text-code-fg">
          <h3 className="text-lg font-bold">Never runs your code</h3>
          <p className="mt-2 text-sm text-code-muted">
            The assistant only reads and writes text. Running untrusted code on a server could read secrets, attack other machines or mine crypto, so
            it&apos;s simply not offered.
          </p>
        </div>
        <div className="rounded-lg bg-code p-5 text-code-fg">
          <h3 className="text-lg font-bold">Stops secrets at the door</h3>
          <p className="mt-2 text-sm text-code-muted">
            Before anything is sent to the AI, a scanner looks for API keys, private keys and passwords. If it finds one, nothing is sent. You see
            the line numbers and can mask the values.
          </p>
        </div>
        <div className="rounded-lg bg-code p-5 text-code-fg">
          <h3 className="text-lg font-bold">Checks the answer</h3>
          <p className="mt-2 text-sm text-code-muted">
            Reviews and fixes come back as structured data that is validated before you see it. Line numbers are checked against your code, and diffs
            are computed here, not trusted from the model.
          </p>
        </div>
      </section>
    </div>
  );
}

async function ActiveProvider() {
  await connection(); // read the live provider state per request, not at build time
  return <ProviderBadge status={providerStatus()} />;
}
