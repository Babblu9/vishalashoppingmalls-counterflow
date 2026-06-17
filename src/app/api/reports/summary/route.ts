import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getBusinessDate } from "@/lib/utils";

// Numeric sort for counter names like "Counter 1", "Counter 10", etc.
const counterSort = (a: string, b: string) => {
  const n = (s: string) => parseInt(s.replace(/\D/g, "") || "0", 10);
  return n(a) - n(b);
};

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Access restricted to Super Admins" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || getBusinessDate(new Date());

    // Fetch all reports for the given business date
    const reports = await prisma.dailyReport.findMany({
      where: { businessDate: dateParam },
      include: {
        branch: true,
        submittedBy: { select: { name: true } },
        entries: {
          include: { counter: true },
        },
      },
    });

    // Fetch all branches & counters to check for missing/unfilled items
    const branches = await prisma.branch.findMany({
      include: {
        counters: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    // Map summary details per branch
    const branchSummaries = branches.map((branch) => {
      const report = reports.find((r) => r.branchId === branch.id);
      const isSubmitted = report?.status === "SUBMITTED";

      const totalCounters = branch.counters.length;
      const sortedCounters = [...branch.counters].sort((a, b) => counterSort(a.name, b.name));
      const filledCounters = report?.entries.length || 0;

      // Sum values
      let cash = 0,
        gpay = 0,
        card = 0,
        counterFlow = 0,
        totalDue = 0,
        collectedDue = 0,
        dueBillAmount = 0,
        manuallyCollected = 0,
        manualTotal = 0,
        systemTotal = 0,
        difference = 0;

      if (report) {
        report.entries.forEach((entry) => {
          cash += entry.cash;
          gpay += entry.gpay;
          card += entry.card;
          counterFlow += entry.counterFlow;
          totalDue += entry.totalDue;
          collectedDue += entry.collectedDue;
          dueBillAmount += entry.dueBillAmount;
          manuallyCollected += entry.manuallyCollected;
          manualTotal += entry.manualTotal;
          // C.T Sum = cash + gpay + card + counterFlow + totalDue  (Manually Collected is NOT included).
          // Recompute here instead of trusting entry.systemTotal so historical rows (which may have
          // included manuallyCollected) are normalized to the current definition.
          systemTotal += entry.cash + entry.gpay + entry.card + entry.counterFlow + entry.totalDue;
          difference += Math.abs(entry.difference);
        });
      }

      return {
        branchId: branch.id,
        branchName: branch.name,
        status: report ? report.status : "NOT_STARTED",
        isSubmitted,
        submittedBy: report?.submittedBy?.name || null,
        submittedAt: report?.submittedAt || null,
        totalCounters,
        filledCounters,
        missingCounters: totalCounters - filledCounters,
        totals: {
          cash,
          gpay,
          card,
          counterFlow,
          totalDue,
          collectedDue,
          dueBillAmount,
          manuallyCollected,
          manualTotal,
          systemTotal,
          difference,
          grandTotal: systemTotal,
        },
      };
    });

    // Overall aggregate metrics
    const totalCollection = branchSummaries.reduce((sum, b) => sum + b.totals.systemTotal, 0);
    const totalDifference = branchSummaries.reduce((sum, b) => sum + b.totals.difference, 0);
    const totalSubmittedBranches = branchSummaries.filter((b) => b.isSubmitted).length;

    // Discrepancy alerts (individual counters where Physical Total !== System Total)
    const alerts: any[] = [];
    reports.forEach((report) => {
      report.entries.forEach((entry) => {
        if (entry.difference !== 0) {
          alerts.push({
            reportEntryId: entry.id,
            branchName: report.branch.name,
            counterName: entry.counter.name,
            difference: Math.abs(entry.difference),
            systemTotal: entry.systemTotal,
            manualTotal: entry.manualTotal,
          });
        }
      });
    });

    return NextResponse.json({
      businessDate: dateParam,
      branchSummaries,
      metrics: {
        totalCollection,
        totalDifference,
        totalSubmittedBranches,
        totalBranches: branches.length,
        alertCount: alerts.length,
      },
      alerts,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
