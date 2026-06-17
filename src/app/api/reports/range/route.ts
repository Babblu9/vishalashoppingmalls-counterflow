import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getBusinessDate } from "@/lib/utils";

const MAX_DAYS = 92; // cap range width to keep tables manageable

/** Enumerate all YYYY-MM-DD dates between from and to (inclusive). */
function enumerateDates(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const dates: string[] = [];
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  let guard = 0;
  while (cur <= end && guard < MAX_DAYS) {
    const d = new Date(cur);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur += 24 * 60 * 60 * 1000;
    guard++;
  }
  return dates;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Access restricted to Super Admins" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const today = getBusinessDate(new Date());
    let from = searchParams.get("from") || today;
    let to = searchParams.get("to") || today;

    // Normalize: ensure from <= to (string compare works for YYYY-MM-DD)
    if (from > to) [from, to] = [to, from];

    const dates = enumerateDates(from, to);
    const effectiveTo = dates.length > 0 ? dates[dates.length - 1] : to;

    // All branches (rows) — even those without reports in range
    const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });

    // All reports in the (capped) range, with their entries
    const reports = await prisma.dailyReport.findMany({
      where: { businessDate: { gte: from, lte: effectiveTo } },
      include: { entries: true },
    });

    // Aggregate: branchId -> date -> { due, manuallyCollected }
    const agg = new Map<string, Map<string, { due: number; manuallyCollected: number }>>();
    for (const report of reports) {
      let byDate = agg.get(report.branchId);
      if (!byDate) { byDate = new Map(); agg.set(report.branchId, byDate); }
      let cell = byDate.get(report.businessDate);
      if (!cell) { cell = { due: 0, manuallyCollected: 0 }; byDate.set(report.businessDate, cell); }
      for (const entry of report.entries) {
        cell.due += entry.totalDue || 0;
        cell.manuallyCollected += (entry as { manuallyCollected?: number }).manuallyCollected || 0;
      }
    }

    const branchRows = branches.map((branch) => {
      const byDate = agg.get(branch.id);
      const due: Record<string, number> = {};
      const manuallyCollected: Record<string, number> = {};
      for (const date of dates) {
        const cell = byDate?.get(date);
        due[date] = cell?.due || 0;
        manuallyCollected[date] = cell?.manuallyCollected || 0;
      }
      return { branchId: branch.id, branchName: branch.name, due, manuallyCollected };
    });

    return NextResponse.json({
      from,
      to: effectiveTo,
      dates,
      branches: branchRows,
      capped: dates.length >= MAX_DAYS,
      maxDays: MAX_DAYS,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
