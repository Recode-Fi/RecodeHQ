import { redirect } from "next/navigation";

/** /documentation → /docs (canonical documentation route). */
export default function DocumentationRedirect() {
  redirect("/docs");
}
