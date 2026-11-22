import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { eq } from "drizzle-orm";
import { db, s } from "@/db";

export type SessionData = { userId?: string };

function password() {
  const p = process.env.SESSION_SECRET;
  if (!p || p.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters. See README.md.");
  return p;
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: password(),
    cookieName: "big_spendr_session",
    ttl: 60 * 60 * 24 * 30, // 30 days
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  });
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const [user] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, session.userId));
  return user ?? null;
}

/** For pages and server actions: sends signed-out people to /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
