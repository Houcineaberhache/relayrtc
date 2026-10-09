"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { OrganizationQuotaResponse, ProjectUsageResponse } from "@relayrtc/validation";
import type { ConsoleEnvironment } from "@/lib/console-types";
import { Panel, PanelTitle } from "@/components/page/panel";
import { StatCard } from "@/components/page/stat-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ReportingFilters } from "./reporting-filters";
import { UsageMetrics } from "./usage-metrics";

export function ProjectUsageDashboard({
  data,
  quota,
  environments,
  environment,
}: {
  data: ProjectUsageResponse;
  quota: OrganizationQuotaResponse;
  environments: readonly ConsoleEnvironment[];
  environment: string;
}) {
  const chart = data.buckets.map((bucket) => ({
    ...bucket,
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...(data.window.range === "24h"
        ? ({ hour: "2-digit", minute: "2-digit", hour12: false } as const)
        : ({ month: "short", day: "numeric" } as const)),
    }).format(new Date(bucket.startedAt)),
    minutes: bucket.participantSeconds / 60,
  }));
  function download() {
    const csv = [
      "started_at,ended_at,participant_minutes,rooms_created",
      ...chart.map(
        (bucket) =>
          `${bucket.startedAt},${bucket.endedAt},${bucket.minutes},${bucket.roomsCreated}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "project-usage.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex flex-col gap-6">
      <ReportingFilters
        range={data.window.range}
        environment={environment}
        environments={environments}
      />
      <StatCard
        label="Organization quota"
        value={quota.status === "unconfigured" ? "Not configured" : "Unavailable"}
        hint="No usage limit configured"
      />
      <UsageMetrics summary={data.summary} dataQuality={data.dataQuality} />
      <Panel>
        <PanelTitle
          title="Participant minutes"
          description="Activity in the selected range. Bucket times are UTC; the first and last buckets may cover partial periods."
        />
        {data.summary.participantSeconds === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No participant activity in this period.
          </p>
        ) : (
          <ChartContainer
            config={{ minutes: { label: "Participant minutes", color: "var(--chart-1)" } }}
            className="mt-4 h-64 w-full"
          >
            <BarChart data={chart}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="minutes" fill="var(--color-minutes)" />
            </BarChart>
          </ChartContainer>
        )}
        <button type="button" onClick={download} className="mt-4 text-sm underline">
          Download CSV
        </button>
      </Panel>
    </div>
  );
}
