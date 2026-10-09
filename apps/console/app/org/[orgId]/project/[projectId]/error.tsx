"use client";

import { useRouter } from "next/navigation";

export default function ReportingError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-xl border p-6">
      <h2 className="text-lg font-medium">Reporting unavailable</h2>
      <p className="text-sm text-muted-foreground">
        We could not load reporting data. Please try again.
      </p>
      <button
        type="button"
        className="rounded-md border px-4 py-2 text-sm"
        onClick={() => {
          router.refresh();
          reset();
        }}
      >
        Try again
      </button>
    </div>
  );
}
