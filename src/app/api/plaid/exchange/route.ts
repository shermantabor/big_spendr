import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, s } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { plaid, plaidErrorMessage } from "@/lib/plaid";
import { syncItem } from "@/lib/sync";

export const maxDuration = 60;

/** Called after someone finishes Plaid Link: saves the connection and imports history. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { publicToken } = (await req.json()) as { publicToken?: string };
  if (!publicToken) return NextResponse.json({ error: "Missing publicToken" }, { status: 400 });

  try {
    const exchange = await plaid().item.exchangePublicToken({ public_token: publicToken });
    const itemRes = await plaid().item.get({ access_token: exchange.access_token });
    const institutionId = itemRes.item.institution_id ?? null;
    let institutionName = itemRes.item.institution_name ?? null;
    if (!institutionName && institutionId) {
      const inst = await plaid().institutions.getById({ institution_id: institutionId, country_codes: ["US"] });
      institutionName = inst.institution.name;
    }

    const [row] = await db
      .insert(s.plaidItems)
      .values({
        plaidItemId: exchange.item_id,
        accessTokenEnc: encrypt(exchange.access_token),
        institutionId,
        institutionName,
        linkedByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: s.plaidItems.plaidItemId,
        set: { accessTokenEnc: encrypt(exchange.access_token), status: "good", errorCode: null },
      })
      .returning({ id: s.plaidItems.id });

    // Save accounts right away so they show up even before transactions are ready.
    const accts = await plaid().accounts.get({ access_token: exchange.access_token });
    for (const a of accts.accounts) {
      await db
        .insert(s.accounts)
        .values({
          plaidAccountId: a.account_id,
          itemId: row.id,
          name: a.name,
          officialName: a.official_name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype ?? null,
          currentBalance: a.balances.current?.toString() ?? null,
          availableBalance: a.balances.available?.toString() ?? null,
          isoCurrencyCode: a.balances.iso_currency_code,
        })
        .onConflictDoNothing();
    }

    const result = await syncItem(row.id);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, institutionName, result });
  } catch (err) {
    const message = plaidErrorMessage(err);
    console.error("[exchange]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

