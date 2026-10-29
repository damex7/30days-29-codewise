import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// Sends through Resend when RESEND_API_KEY is set; otherwise prints the
// email to the terminal so the flow can be seen in development. (That
// print is a deliberate dev-only exception to the "no emails in logs" rule.)

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.log(`\n----- EMAIL (not sent: no RESEND_API_KEY) -----\nTo: ${msg.to}\nFrom: ${EMAIL_FROM}\nSubject: ${msg.subject}\n\n${msg.text}\n-----------------------------------------------\n`);
    return;
  }
  const { error } = await new Resend(RESEND_API_KEY).emails.send({ from: EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
  // A failed notice shouldn't undo the admin action; record it (masked).
  if (error) log("email.failed", { to: msg.to, name: error.name });
}
