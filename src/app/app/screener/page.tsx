import { redirect } from "next/navigation";

/**
 * The Screen feature has been removed from RECODE. This route redirects to
 * Markets (the closest active surface for browsing the tokenized universe).
 * Discover remains a fully functional standalone surface at /app/discover.
 */
export default function ScreenerPage() {
  redirect("/app/markets");
}
