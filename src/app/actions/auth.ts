"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, s } from "@/db";
import { allowedEmails, getSession } from "@/lib/session";

// A real bcrypt hash of a throwaway password, used when the email is unknown.
const DUMMY_HASH = "$2b$12$O.72tPascdolOZnG.TVXj.TPmK1.j1qbH9EZsM2D6/IxorQJiZ/Qa";

// Returning the typed name and email lets the form keep them after an error
// (React resets forms after a server action).
export type FormState = { error?: string; name?: string; email?: string } | undefined;

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  // Compare even when the user doesn't exist, so timing doesn't reveal which emails have accounts.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "That email and password don't match.", email };

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect("/");
}

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const allowed = allowedEmails();
  if (allowed.length === 0) return { error: "Sign-up is closed: ALLOWED_EMAILS isn't set on the server.", name, email };
  if (!allowed.includes(email)) return { error: "This email isn't on the list of people who can use this app.", name, email };
  if (!name) return { error: "Please enter your name.", name, email };
  if (password.length < 10) return { error: "Use a password with at least 10 characters.", name, email };

  const [existing] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (existing) return { error: "There's already an account for this email. Sign in instead.", name, email };

  const [user] = await db
    .insert(s.users)
    .values({ name, email, passwordHash: await bcrypt.hash(password, 12) })
    .returning({ id: s.users.id });

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

