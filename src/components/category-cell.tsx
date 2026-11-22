"use client";

import { useState, useTransition } from "react";
import { setTransactionCategory } from "@/app/actions/budget";

type Cat = { id: string; name: string };

export function CategoryCell({
  transactionId,
  merchant,
  categoryId,
  categories,
}: {
  transactionId: string;
  merchant: string;
  categoryId: string | null;
  categories: Cat[];
}) {
  const [value, setValue] = useState(categoryId ?? "");
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(newId: string, applyToMerchant: boolean) {
    const fd = new FormData();
    fd.set("transactionId", transactionId);
    fd.set("categoryId", newId);
    if (applyToMerchant) fd.set("applyToMerchant", "on");
    setAsking(null);
    start(() => setTransactionCategory(fd));
  }

  return (
    <div className="min-w-40">
      <select
        className="input py-1"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value) setAsking(e.target.value);
          else save("", false);
        }}
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {asking && (
        <div className="mt-1 rounded-lg border border-border bg-card p-2 text-xs shadow-sm">
          <p className="mb-1.5">Use this for every &ldquo;{merchant}&rdquo; transaction, including future ones?</p>
          <div className="flex gap-1.5">
            <button type="button" className="btn px-2 py-1 text-xs" onClick={() => save(asking, true)}>All from {merchant.length > 18 ? "merchant" : merchant}</button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => save(asking, false)}>Just this one</button>
          </div>
        </div>
      )}
    </div>
  );
}
