import Link from "next/link";
import { PageHeader } from "@/components/page/page-header";
import { Panel } from "@/components/page/panel";
import { ReportingFilters } from "@/components/project/reporting-filters";
import { UsageMetrics } from "@/components/project/usage-metrics";
import { UsageChart } from "@/components/project/usage-chart";
import { StatCard } from "@/components/page/stat-card";
import { requireOrganization, getOrganizationProjects } from "@/lib/console-data";
import { getOrganizationUsage, getOrganizationQuota, usageRange } from "@/lib/reporting/client";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization usage" };

export default async function OrganizationUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ range?: string; offset?: string }>;
}) {
  const { orgId } = await params;
  const query = await searchParams;
  const { session } = await requireOrganization(orgId);
  const range = usageRange(query.range);
  const requestedOffset = Number(query.offset ?? 0);
  const offset =
    Number.isInteger(requestedOffset) && requestedOffset >= 0 && requestedOffset <= 100_000
      ? requestedOffset
      : 0;
  const [data, quota, projects] = await Promise.all([
    getOrganizationUsage(orgId, range, offset),
    getOrganizationQuota(orgId),
    getOrganizationProjects(orgId, session.user.id),
  ]);
  const pageLink = (nextOffset: number) =>
    `/org/${orgId}/usage?${new URLSearchParams({ range, offset: String(nextOffset) })}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organization usage"
        description="Participant minutes and network consumption across your projects."
      />
      <ReportingFilters range={range} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <UsageChart
          title="Participant minutes"
          total={data.summary.participantSeconds / 60}
          period={range}
          horizontal
          description="All projects total · Up to 8 highest usage projects on this page"
          points={[...data.projects].sort((left, right) => right.summary.participantSeconds - left.summary.participantSeconds).slice(0, 8).map((project) => ({
            label: projects.find((item) => item.id === project.projectId)?.name ?? project.projectId,
            value: project.summary.participantSeconds / 60,
          }))}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard label="Rooms created" value={data.summary.roomsCreated} hint={range} />
          <StatCard label="Peak participants" value={data.summary.peakConcurrentParticipants} hint={range}>
            <p className="mt-2 text-sm text-muted-foreground">{data.summary.peakConcurrentRooms} peak concurrent rooms</p>
          </StatCard>
        </div>
      </div>
      <UsageMetrics summary={data.summary} dataQuality={data.dataQuality} period={range} />
      <Panel>
        <h2 className="mb-4 text-base font-medium">Usage by project</h2>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="pb-2 text-left font-normal">Project</th>
                <th scope="col" className="pb-2 pl-4 text-right font-normal">Participant minutes</th>
                <th scope="col" className="pb-2 pl-4 text-right font-normal">Rooms created</th>
                <th scope="col" className="pb-2 pl-4 text-right font-normal">History</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => (
                <tr key={project.projectId} className="border-b last:border-0">
                  <td className="py-3">
                    {projects.some((item) => item.id === project.projectId && item.status === "active") ? <Link
                      className="transition-colors hover:text-primary"
                      href={routes.projectPage(orgId, project.projectId, "usage")}
                    >
                      {projects.find((item) => item.id === project.projectId)?.name ??
                        project.projectId}
                    </Link> : <div className="flex flex-col gap-0.5">
                      <span>{projects.find((item) => item.id === project.projectId)?.name ?? "Deleted project"}</span>
                      <span className="text-xs text-muted-foreground">{project.projectId}</span>
                    </div>}
                  </td>
                  <td className="py-3 pl-4 text-right tabular-nums">
                    {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
                      project.summary.participantSeconds / 60,
                    )}
                  </td>
                  <td className="py-3 pl-4 text-right tabular-nums">{project.summary.roomsCreated}</td>
                  <td className="py-3 pl-4 text-right text-muted-foreground">
                    {project.dataQuality.sessionHistory === "partial" ||
                    project.dataQuality.messageHistory === "partial"
                      ? "Incomplete"
                      : "Complete"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.projects.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            {data.pagination.total === 0
              ? "No projects in this organization."
              : "No projects on this page."}
          </p>
        )}
        <nav aria-label="Project usage pages" className="mt-4 flex gap-4 text-sm">
          {offset > 0 && (
            <Link
              className="rounded-full bg-muted px-4 py-2 transition-colors hover:bg-muted/70"
              href={pageLink(Math.max(0, offset - data.pagination.limit))}
            >
              Previous
            </Link>
          )}
          {offset + data.pagination.limit < data.pagination.total && (
            <Link className="rounded-full bg-muted px-4 py-2 transition-colors hover:bg-muted/70" href={pageLink(offset + data.pagination.limit)}>
              Next
            </Link>
          )}
        </nav>
      </Panel>
      <p className="text-xs text-muted-foreground">
        {quota.status === "unconfigured" ? "Organization usage limits are not configured." : "Organization quota unavailable."}
      </p>
    </div>
  );
}
