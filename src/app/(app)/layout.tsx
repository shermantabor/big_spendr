import { requireUser } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { Nav } from "@/components/nav";
import { plaidEnv } from "@/lib/plaid";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      {plaidEnv() === "sandbox" && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Plaid sandbox: these are test banks and fake transactions.
        </div>
      )}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold tracking-tight">Big Spendr</span>
            <Nav />
          </div>
          <form action={logout} className="flex items-center gap-3 text-sm text-muted">
            <span>{user.name}</span>
            <button className="hover:text-foreground">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
