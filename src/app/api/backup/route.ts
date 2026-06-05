import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

// Returns a list of all dates (last 30 days) that have at least one report,
// with per-branch submission status for each date.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Window: last 45 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffDate = cutoff.toISOString().split("T")[0]; // "YYYY-MM-DD"

  // All reports within the last 45 days
  const reports = await prisma.dailyReport.findMany({
    where: { businessDate: { gte: cutoffDate } },
    include: {
      branch: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
      entries: { select: { id: true } },
    },
    orderBy: { businessDate: "desc" },
  });

  // Group by businessDate
  const byDate: Record<
    string,
    {
      businessDate: string;
      branches: {
        branchId: string;
        branchName: string;
        status: string;
        submittedBy: string | null;
        submittedAt: string | null;
        entryCount: number;
      }[];
      totalBranches: number;
      submittedBranches: number;
    }
  > = {};

  for (const report of reports) {
    if (!byDate[report.businessDate]) {
      byDate[report.businessDate] = {
        businessDate: report.businessDate,
        branches: [],
        totalBranches: 0,
        submittedBranches: 0,
      };
    }
    byDate[report.businessDate].branches.push({
      branchId: report.branchId,
      branchName: report.branch.name,
      status: report.status,
      submittedBy: report.submittedBy?.name ?? null,
      submittedAt: report.submittedAt?.toISOString() ?? null,
      entryCount: report.entries.length,
    });
    byDate[report.businessDate].totalBranches += 1;
    if (report.status === "SUBMITTED") {
      byDate[report.businessDate].submittedBranches += 1;
    }
  }

  const days = Object.values(byDate).sort((a, b) =>
    b.businessDate.localeCompare(a.businessDate)
  );

  return NextResponse.json({ days, cutoffDate });
}
