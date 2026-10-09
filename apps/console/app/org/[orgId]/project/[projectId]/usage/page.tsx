import type { Metadata } from "next";
import { PageHeader } from "@/components/page/page-header";
import { ProjectUsageDashboard } from "@/components/project/project-usage-dashboard";
import { requireProject } from "@/lib/console-data";
import { getOrganizationQuota, getProjectUsage, usageRange } from "@/lib/reporting/client";

export const metadata: Metadata = {
  title: "Usage",
  description: "Participant minutes and network consumption for this project.",
};
export const dynamic = "force-dynamic";

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
  searchParams: Promise<{ range?: string; environment?: string }>;
}) {
  const { orgId, projectId } = await params;
  const query = await searchParams;
  const project = await requireProject(orgId, projectId);
  const environment = project.environments.some((item) => item.id === query.environment)
    ? query.environment!
    : "all";
  const [data, quota] = await Promise.all([
    getProjectUsage(projectId, usageRange(query.range), environment),
    getOrganizationQuota(orgId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        description="Participant minutes and network consumption for this project."
      />
      <ProjectUsageDashboard
        data={data}
        quota={quota}
        environment={environment}
        environments={project.environments}
      />
    </div>
  );
}
