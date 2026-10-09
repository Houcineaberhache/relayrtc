import Link from "next/link";
import { PageHeader } from "@/components/page/page-header";
import { Panel } from "@/components/page/panel";
import { ReportingFilters } from "@/components/project/reporting-filters";
import { UsageMetrics } from "@/components/project/usage-metrics";
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
        description="Combined activity across this organization's projects, including historical usage from suspended projects."
      />
      <ReportingFilters range={range} />
      <Panel>
        <h2 className="font-medium">Organization quota</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {quota.status === "unconfigured" ? "No usage limits configured." : "Quota unavailable."}
        </p>
      </Panel>
      <UsageMetrics summary={data.summary} dataQuality={data.dataQuality} />
      <Panel>
        <h2 className="mb-4 font-medium">Usage by project</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Project</th>
                <th className="p-2">Participant minutes</th>
                <th className="p-2">Rooms created</th>
                <th className="p-2">History</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => (
                <tr key={project.projectId} className="border-t">
                  <td className="p-2">
                    <Link
                      className="underline"
                      href={routes.projectPage(orgId, project.projectId, "usage")}
                    >
                      {projects.find((item) => item.id === project.projectId)?.name ??
                        project.projectId}
                    </Link>
                  </td>
                  <td className="p-2">
                    {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
                      project.summary.participantSeconds / 60,
                    )}
                  </td>
                  <td className="p-2">{project.summary.roomsCreated}</td>
                  <td className="p-2">
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
              className="underline"
              href={pageLink(Math.max(0, offset - data.pagination.limit))}
            >
              Previous
            </Link>
          )}
          {offset + data.pagination.limit < data.pagination.total && (
            <Link className="underline" href={pageLink(offset + data.pagination.limit)}>
              Next
            </Link>
          )}
        </nav>
      </Panel>
    </div>
  );
}
