import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, s } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { plaid, plaidErrorMessage, webhookUrl } from "@/lib/plaid";

/**
 * Creates a Plaid Link token. Pass { itemId } to open Link in "update mode",
 * which is how you re-enter a bank password after it changes.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { itemId } = (await req.json().catch(() => ({}))) as { itemId?: string };
  let accessToken: string | undefined;
  if (itemId) {
    const [item] = await db.select().from(s.plaidItems).where(eq(s.plaidItems.id, itemId));
    if (!item) return NextResponse.json({ error: "Unknown connection" }, { status: 404 });
    accessToken = decrypt(item.accessTokenEnc);
  }

  try {
    const res = await plaid().link.createToken({
      client_name: "Big Spendr",
      language: "en",
      country_codes: ["US"],
      user: { client_user_id: user.id },
      // Update mode takes no products; a new link asks for transactions.
      ...(accessToken
        ? { access_token: accessToken }
        : { products: ["transactions"], transactions: { days_requested: 730 } }),
      webhook: webhookUrl(),
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    return NextResponse.json({ linkToken: res.link_token });
  } catch (err) {
    const message = plaidErrorMessage(err);
    console.error("[link-token]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
