import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { syncItem } from "@/lib/sync";

export const maxDuration = 60;

/** Re-syncs one connection, e.g. right after fixing its login in Plaid Link. */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { itemId } = (await req.json()) as { itemId?: string };
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
  const result = await syncItem(itemId);
  revalidatePath("/", "layout");
  return NextResponse.json({ result });
}
