import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-lg font-semibold">Surface not found</h1>
      <p className="mt-2 text-[12.5px] text-muted">This route does not exist in RECODE.</p>
      <Link href="/" className="mt-4 inline-block text-[12.5px] text-green hover:underline">
        Back to the dashboard →
      </Link>
    </div>
  );
}
