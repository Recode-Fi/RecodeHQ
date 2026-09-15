"use client";

import { useEffect, useState } from "react";
import { ScannerSwitch } from "@/components/scanner/ScannerSwitch";

export default function ScannerPage() {
  const [initial, setInitial] = useState<string | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && (/^0x[a-fA-F0-9]{40}$/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q))) setInitial(q);
  }, []);
  return <ScannerSwitch initial={initial} />;
}
