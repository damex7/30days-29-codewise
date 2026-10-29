import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type Actor } from "@/lib/auth/current-user";

/** For pages and actions: the acting user, or off to sign in. */
export async function requireUser(next = "/workbench"): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}
