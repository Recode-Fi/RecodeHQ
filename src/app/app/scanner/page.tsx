"use client";

import { useEffect, useState } from "react";
import { ScannerSwitch } from "@/components/scanner/ScannerSwitch";
import { isValidSolanaAddress } from "@/lib/base58";

export default function ScannerPage() {
  const [initial, setInitial] = useState<string | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && (/^0x[a-fA-F0-9]{40}$/.test(q) || isValidSolanaAddress(q))) setInitial(q);
  }, []);
  return <ScannerSwitch initial={initial} />;
}
