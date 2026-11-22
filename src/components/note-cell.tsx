"use client";

import { useState, useTransition } from "react";
import { setTransactionNote } from "@/app/actions/budget";

export function NoteCell({ transactionId, notes }: { transactionId: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [pending, start] = useTransition();
  return (
    <input
      className="w-full min-w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted outline-none hover:border-border focus:border-border"
      placeholder="Add note"
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === (notes ?? "")) return;
        const fd = new FormData();
        fd.set("transactionId", transactionId);
        fd.set("notes", value);
        start(() => setTransactionNote(fd));
      }}
    />
  );
}
