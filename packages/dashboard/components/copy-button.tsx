"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) -- the value is still selectable text.
    }
  }

  return (
    <button type="button" onClick={handleCopy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
