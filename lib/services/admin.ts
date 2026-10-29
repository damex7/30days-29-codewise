import "server-only";
import type { Actor } from "@/lib/auth/current-user";
import { transaction } from "@/lib/db";
import * as repo from "@/lib/repos/admin";
import { setUserDisabled } from "@/lib/repos/users";
import { deleteSessionsForUser } from "@/lib/repos/sessions";
import { recordAudit } from "@/lib/repos/audit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/services/errors";

/** Non-admins get "not found", same as any page they have no business seeing. */
function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new NotFoundError();
}

export async function getAdminDashboard(actor: Actor) {
  assertAdmin(actor);
  const [usage, outcomes, top, feedback, reasons, users, demos, cron] = await Promise.all([
    repo.usageWindows(),
    repo.outcomesByStatus(),
    repo.topModesAndLanguages(),
    repo.feedbackSummary(),
    repo.recentDownReasons(),
    repo.listUsers(),
    repo.demoCount(),
    repo.lastCronRun(),
  ]);
  return { usage, outcomes, top, feedback, reasons, users, demos, cron };
}

export async function setUserDisabledByAdmin(actor: Actor, userId: string, disabled: boolean): Promise<void> {
  assertAdmin(actor);
  if (userId === actor.id) throw new NotFoundError(); // admins can't lock themselves out
  const user = await transaction(async (tx) => {
    const row = await setUserDisabled(userId, disabled, tx); // refuses other admins (role <> 'admin')
    if (!row) return null;
    if (disabled) await deleteSessionsForUser(userId, tx); // signed out everywhere, now
    await recordAudit(actor.id, disabled ? "admin.disable_user" : "admin.enable_user", { type: "user", id: userId }, {}, tx);
    return row;
  });
  if (!user) throw new NotFoundError();
  if (disabled) {
    await sendEmail({
      to: user.email,
      subject: "Your Codewise account has been disabled",
      text: `Hello,\n\nAn administrator has disabled your Codewise account, so you can no longer sign in. Your saved runs and snippets have not been deleted, and any share links you created stop working while the account is disabled.\n\nIf you think this is a mistake, reply to this email.\n\n${env().APP_URL}`,
    });
  }
}
