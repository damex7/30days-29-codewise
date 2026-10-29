import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { providerStatus } from "@/lib/ai/status";
import { peekLimit, DAY } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/constants";
import { Workbench } from "@/components/workbench/workbench";
import { ProviderBadge } from "@/components/provider-badge";
import { DemoBanner } from "@/components/demo-banner";

export const metadata: Metadata = { title: "Workbench" };

export default function WorkbenchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<WorkbenchSkeleton />}>
        <WorkbenchLoader />
      </Suspense>
    </div>
  );
}

async function WorkbenchLoader() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/workbench");
  const status = providerStatus();
  const cap = user.isDemo ? LIMITS.DEMO_DAILY_RUNS : LIMITS.DAILY_RUNS;
  const used = await peekLimit(`run:day:${user.id}`, DAY);
  return (
    <>
      {user.isDemo ? <DemoBanner status={status} /> : null}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink">Workbench</h1>
          <p className="mt-1 text-sm text-muted">
            {Math.max(0, cap - used)} of {cap} runs left today · up to {LIMITS.PER_MINUTE} a minute
          </p>
        </div>
        <ProviderBadge status={status} />
      </div>
      <Workbench providerLabel={status.label} providerIsMock={status.active === "mock"} />
    </>
  );
}

function WorkbenchSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 h-9 w-48 skeleton" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="h-10 skeleton" />
          <div className="h-11 skeleton" />
          <div className="h-72 skeleton" />
        </div>
        <div className="h-80 skeleton" />
      </div>
    </div>
  );
}
