import { prisma } from "./db";
import type { SessionUser } from "./auth";

type AdminActor = { id: string; email: string };

export async function recordAudit(input: {
  actor: AdminActor | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? "anonymous",
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ip: input.ip ?? null,
    },
  });
}

export type { SessionUser };
