"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ConsoleEnvironment } from "@/lib/console-types";

export function ReportingFilters({
  range,
  environment,
  environments,
}: {
  range: string;
  environment?: string;
  environments?: readonly ConsoleEnvironment[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(key: string, value: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set(key, value);
    query.delete("offset");
    startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }
  return (
    <div className="flex flex-wrap items-center gap-4" aria-busy={pending}>
      <label className="text-sm">
        Time range{" "}
        <select
          className="ml-2 rounded-md border bg-background p-2"
          value={range}
          onChange={(event) => update("range", event.target.value)}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </label>
      {environments && (
        <label className="text-sm">
          Environment{" "}
          <select
            className="ml-2 rounded-md border bg-background p-2"
            value={environment ?? "all"}
            onChange={(event) => update("environment", event.target.value)}
          >
            <option value="all">All environments</option>
            {environments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {pending && (
        <span role="status" className="text-sm text-muted-foreground">
          Loading reporting...
        </span>
      )}
    </div>
  );
}
