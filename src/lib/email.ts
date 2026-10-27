import { Resend } from "resend";
import { prisma } from "./db";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "DROP <onboarding@resend.dev>";

export const emailEnabled = Boolean(apiKey);

let client: Resend | null = null;

function getResend() {
  if (!apiKey) return null;
  if (!client) {
    client = new Resend(apiKey, process.env.RESEND_BASE_URL ? { baseUrl: process.env.RESEND_BASE_URL } : undefined);
  }
  return client;
}

/**
 * Sends through Resend when configured. Without a key it logs the message and
 * records it as "skipped", so nothing silently pretends to have been delivered.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  template: string;
  replyTo?: string;
}) {
  const resend = getResend();

  if (!resend) {
    console.info(`[email:skipped] ${input.template} -> ${input.to} :: ${input.subject}`);
    await prisma.emailMessage.create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        provider: "none",
        status: "skipped",
        error: "RESEND_API_KEY not set",
      },
    });
    return { ok: false as const, reason: "not-configured" as const };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    if (error) throw new Error(error.message);

    await prisma.emailMessage.create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        provider: "resend",
        status: "sent",
      },
    });
    return { ok: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error(`[email:failed] ${input.template} -> ${input.to} :: ${message}`);
    await prisma.emailMessage.create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        provider: "resend",
        status: "failed",
        error: message.slice(0, 500),
      },
    });
    return { ok: false as const, reason: "send-failed" as const };
  }
}
