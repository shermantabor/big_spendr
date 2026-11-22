import { PlaidLinkButton } from "@/components/plaid-link-button";

// Banks that use OAuth send you back here after you approve access.
// Set PLAID_REDIRECT_URI to https://<your-app>/oauth and add the same URL in the Plaid dashboard.
export default function OAuthReturnPage() {
  return (
    <div className="card mx-auto max-w-md text-center">
      <PlaidLinkButton oauthRedirect />
    </div>
  );
}
