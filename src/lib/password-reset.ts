import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { hashToken } from "./auth";

const TOKEN_MINUTES = 30;

export async function issueResetToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60 * 1000),
    },
  });
  return { token, user };
}

export async function findValidResetToken(token: string) {
  if (!token) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record) return null;
  if (record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function consumeResetToken(id: string) {
  await prisma.passwordResetToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

export { TOKEN_MINUTES };
