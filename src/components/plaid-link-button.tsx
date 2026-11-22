"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";

const OAUTH_TOKEN_KEY = "big_spendr_link_token";

/**
 * Opens Plaid Link. With itemId it opens "update mode" to fix a connection
 * whose bank login changed. With oauthRedirect it resumes Link after a bank's
 * OAuth page (Chase, Capital One and others send you back to /oauth).
 */
export function PlaidLinkButton({
  itemId,
  label = "Connect an account",
  className = "btn",
  oauthRedirect = false,
}: {
  itemId?: string;
  label?: string;
  className?: string;
  oauthRedirect?: boolean;
}) {
  const router = useRouter();
  // On the OAuth return page, pick up the Link token saved before leaving for the bank.
  const [token, setToken] = useState<string | null>(() =>
    oauthRedirect && typeof window !== "undefined" ? sessionStorage.getItem(OAUTH_TOKEN_KEY) : null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      sessionStorage.removeItem(OAUTH_TOKEN_KEY);
      if (itemId) {
        // Update mode: the existing access token keeps working. Just re-sync.
        setStatus("Reconnected. Syncing…");
        setBusy(true);
        await fetch("/api/plaid/resync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        setBusy(false);
        setStatus(null);
        router.refresh();
        return;
      }
      setBusy(true);
      setStatus(`Importing from ${metadata.institution?.name ?? "your bank"}… this can take up to a minute.`);
      const res = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setStatus(`Something went wrong: ${data.error}`);
        return;
      }
      const added = data.result?.added ?? 0;
      setStatus(
        added > 0
          ? `Imported ${added} transactions from ${data.institutionName}.`
          : `Connected ${data.institutionName}. Plaid is still gathering history; it will appear automatically shortly.`,
      );
      if (oauthRedirect) router.replace("/accounts");
      else router.refresh();
    },
    [itemId, oauthRedirect, router],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    receivedRedirectUri: oauthRedirect && typeof window !== "undefined" ? window.location.href : undefined,
    onExit: (err) => {
      sessionStorage.removeItem(OAUTH_TOKEN_KEY);
      if (err) setStatus(`Plaid closed: ${err.display_message || err.error_message}`);
      if (oauthRedirect) router.replace("/accounts");
    },
  });

  // Open as soon as a token is ready (after the click, or on the OAuth return page).
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setStatus(null);
    setBusy(true);
    const res = await fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setStatus(`Couldn't start Plaid: ${data.error}`);
      return;
    }
    sessionStorage.setItem(OAUTH_TOKEN_KEY, data.linkToken);
    setToken(data.linkToken);
  }

  if (oauthRedirect) {
    return <p className="text-sm text-muted">{status ?? "Finishing your bank connection…"}</p>;
  }

  return (
    <div className="space-y-2">
      <button type="button" className={className} onClick={start} disabled={busy}>
        {busy ? "Working…" : label}
      </button>
      {status && <p className="text-sm text-muted">{status}</p>}
    </div>
  );
}
