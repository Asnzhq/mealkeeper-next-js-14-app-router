import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/server/db";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const hashVerificationCode = (phone: string, code: string) =>
  createHash("sha256").update(`${process.env.NEXTAUTH_SECRET ?? "mealkeeper-dev"}:${phone}:${code}`).digest("hex");

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "MealKeeper",
    credentials: { mode: {}, email: {}, password: {}, phone: {}, code: {} },
    async authorize(credentials) {
      if (!credentials) return null;
      let user = null;
      if (credentials.mode === "email") {
        if (!credentials.email || !credentials.password) return null;
        user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase().trim() } });
        if (!user?.password_hash || !(await verifyPassword(credentials.password, user.password_hash))) return null;
      } else if (credentials.mode === "phone") {
        if (!credentials.phone || !credentials.code) return null;
        const record = await prisma.verificationCode.findFirst({ where: { phone: credentials.phone, used_at: null, expires_at: { gt: new Date() } }, orderBy: { created_at: "desc" } });
        if (!record || record.code_hash !== hashVerificationCode(credentials.phone, credentials.code)) return null;
        user = await prisma.user.findUnique({ where: { phone: credentials.phone } });
        if (!user) return null;
        await prisma.verificationCode.update({ where: { id: record.id }, data: { used_at: new Date() } });
      }
      if (!user) return null;
      return { id: user.id, name: user.name, email: user.email, family_id: user.family_id } as never;
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.familyId = (user as typeof user & { family_id?: string | null }).family_id ?? null;
      }
      if (token.userId) {
        const record = await prisma.user.findUnique({ where: { id: String(token.userId) }, select: { family_id: true } });
        token.familyId = record?.family_id ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; family_id: string | null }).id = String(token.userId ?? "");
        (session.user as typeof session.user & { id: string; family_id: string | null }).family_id = (token.familyId as string | null) ?? null;
      }
      return session;
    },
  },
};

