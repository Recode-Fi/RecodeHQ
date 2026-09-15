"use client";

import { useEffect, useState } from "react";
import { ScannerView } from "@/components/scanner/ScannerView";

export default function ScannerPage() {
  const [initial, setInitial] = useState<string | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && /^0x[a-fA-F0-9]{40}$/.test(q)) setInitial(q);
  }, []);
  return <ScannerView initial={initial} />;
}
