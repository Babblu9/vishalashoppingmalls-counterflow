import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getBusinessDate, isBusinessDateEditable } from "@/lib/utils";

// Numeric sort for counter names like "Counter 1", "Counter 10", etc.
const counterSort = (a: string, b: string) => {
  const n = (s: string) => parseInt(s.replace(/\D/g, "") || "0", 10);
  return n(a) - n(b);
};

// GET handler to fetch the report for a specific branch and date
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const branchIdParam = searchParams.get("branchId");

    // Admins can only view their own branch reports
    const targetBranchId = session.role === "ADMIN" ? session.branchId : branchIdParam;
    if (!targetBranchId) {
      return NextResponse.json({ error: "Branch ID is required" }, { status: 400 });
    }

    // Default to the current active business date
    const targetDate = dateParam || getBusinessDate(new Date());

    // Find the report
    const report = await prisma.dailyReport.findFirst({
      where: {
        branchId: targetBranchId,
        businessDate: targetDate,
      },
      include: {
        submittedBy: {
          select: { name: true, username: true },
        },
        entries: {
          include: {
            counter: true,
          },
        },
      },
    });

    const editableWindowOpen = isBusinessDateEditable(targetDate, new Date());
    const isReportSubmitted = report?.status === "SUBMITTED";
    const isEditable = editableWindowOpen && !isReportSubmitted;

    // If report doesn't exist in DB, create a virtual draft with counters
    if (!report) {
      const counters = await prisma.counter.findMany({
        where: { branchId: targetBranchId },
        orderBy: { name: "asc" },
      });

      const virtualEntries = counters
        .sort((a, b) => counterSort(a.name, b.name))
        .map((counter) => ({
        counterId: counter.id,
        counterName: counter.name,
        cash: 0,
        gpay: 0,
        card: 0,
        counterFlow: 0,
        totalDue: 0,
        collectedDue: 0,
        dueBillNo: null,
        dueBillName: null,
        dueBillAmount: 0,
        dueBillMobile: null,
        collectedDueBillNo: null,
        collectedDueBillName: null,
        collectedDueBillMobile: null,
        dueBills: [],
        collectedDueBills: [],
        manuallyCollected: 0,
        manuallyCollectedBills: [],
        manualTotal: 0,
        systemTotal: 0,
        difference: 0,
        grandTotal: 0,
      }));

      return NextResponse.json({
        report: {
          id: null,
          branchId: targetBranchId,
          businessDate: targetDate,
          status: "DRAFT",
          submittedBy: null,
          submittedAt: null,
          entries: virtualEntries,
        },
        isEditable,
        editableWindowOpen,
      });
    }

    // Map existing entries to frontend format (sorted numerically by counter name)
    const formattedEntries = report.entries
      .sort((a, b) => counterSort(a.counter.name, b.counter.name))
      .map((entry) => {
      const systemTotal =
        entry.cash +
        entry.gpay +
        entry.card +
        entry.counterFlow +
        entry.totalDue;
      const difference = entry.manualTotal; // user-entered +/- value

      // Build dueBills array: prefer dueBillsJson, fallback to legacy single fields
      const rawDueBills = entry.dueBillsJson as any[];
      const dueBills: { billNo: string; name: string; amount: number; mobile: string }[] =
        Array.isArray(rawDueBills) && rawDueBills.length > 0
          ? rawDueBills
          : (entry.dueBillNo || entry.dueBillName || entry.dueBillMobile)
            ? [{ billNo: entry.dueBillNo || "", name: entry.dueBillName || "", amount: entry.dueBillAmount || 0, mobile: entry.dueBillMobile || "" }]
            : [];

      // Build collectedDueBills array: prefer collectedDueBillsJson, fallback to legacy fields
      const rawCollected = entry.collectedDueBillsJson as any[];
      const collectedDueBills: { billNo: string; name: string; mobile: string }[] =
        Array.isArray(rawCollected) && rawCollected.length > 0
          ? rawCollected
          : (entry.collectedDueBillNo || entry.collectedDueBillName || entry.collectedDueBillMobile)
            ? [{ billNo: entry.collectedDueBillNo || "", name: entry.collectedDueBillName || "", mobile: entry.collectedDueBillMobile || "" }]
            : [];

      // Build manuallyCollectedBills array from manuallyCollectedBillsJson
      const rawManuallyCollected = entry.manuallyCollectedBillsJson as any[];
      const manuallyCollectedBills: { billNo: string; name: string; mobile: string; amount: number }[] =
        Array.isArray(rawManuallyCollected) ? rawManuallyCollected : [];

      return {
        id: entry.id,
        counterId: entry.counterId,
        counterName: entry.counter.name,
        cash: entry.cash,
        gpay: entry.gpay,
        card: entry.card,
        counterFlow: entry.counterFlow,
        totalDue: entry.totalDue,
        collectedDue: entry.collectedDue,
        dueBillNo: entry.dueBillNo,
        dueBillName: entry.dueBillName,
        dueBillAmount: entry.dueBillAmount,
        dueBillMobile: entry.dueBillMobile,
        collectedDueBillNo: entry.collectedDueBillNo,
        collectedDueBillName: entry.collectedDueBillName,
        collectedDueBillMobile: entry.collectedDueBillMobile,
        dueBills,
        collectedDueBills,
        manuallyCollected: entry.manuallyCollected,
        manuallyCollectedBills,
        manualTotal: entry.manualTotal,
        systemTotal,
        difference,
        grandTotal: systemTotal,
      };
    });

    return NextResponse.json({
      report: {
        id: report.id,
        branchId: report.branchId,
        businessDate: report.businessDate,
        status: report.status,
        submittedBy: report.submittedBy,
        submittedAt: report.submittedAt,
        entries: formattedEntries,
      },
      isEditable,
      editableWindowOpen,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST handler to save/submit a report
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { branchId, businessDate, status, entries } = body as {
      branchId: string;
      businessDate: string;
      status: "DRAFT" | "SUBMITTED";
      entries: any[];
    };

    // Validation
    if (!branchId || !businessDate || !status || !entries) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate status is one of the allowed values
    if (status !== "DRAFT" && status !== "SUBMITTED") {
      return NextResponse.json({ error: "Invalid status. Must be DRAFT or SUBMITTED" }, { status: 400 });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "entries must be a non-empty array" }, { status: 400 });
    }

    // Admins can only modify their own branch reports
    if (session.role === "ADMIN" && session.branchId !== branchId) {
      return NextResponse.json({ error: "Forbidden: Cannot write to another branch" }, { status: 403 });
    }

    // Validate all submitted counterIds belong to the target branch
    const branchCounters = await prisma.counter.findMany({
      where: { branchId },
      select: { id: true },
    });
    const validCounterIds = new Set(branchCounters.map((c) => c.id));
    const invalidEntry = entries.find((e) => !validCounterIds.has(e.counterId));
    if (invalidEntry) {
      return NextResponse.json(
        { error: `Counter ${invalidEntry.counterId} does not belong to this branch` },
        { status: 400 }
      );
    }

    // Check time lock (10:00 AM next day deadline)
    if (!isBusinessDateEditable(businessDate, new Date())) {
      return NextResponse.json(
        { error: `The submission window for ${businessDate} closed at 10:00 AM on the following day.` },
        { status: 403 }
      );
    }

    // Find if report exists
    const existingReport = await prisma.dailyReport.findFirst({
      where: { branchId, businessDate },
      include: { entries: true },
    });

    // If report exists and is already submitted, block edits
    if (existingReport && existingReport.status === "SUBMITTED") {
      return NextResponse.json({ error: "Report is already submitted and locked." }, { status: 403 });
    }

    // Start transaction to save report and entries securely
    const savedReport = await prisma.$transaction(async (tx) => {
      // 1. Create or update the DailyReport
      const report = await tx.dailyReport.upsert({
        where: {
          branchId_businessDate: {
            branchId,
            businessDate,
          },
        },
        create: {
          branchId,
          businessDate,
          status,
          submittedById: status === "SUBMITTED" ? session.userId : null,
          submittedAt: status === "SUBMITTED" ? new Date() : null,
        },
        update: {
          status,
          submittedById: status === "SUBMITTED" ? session.userId : null,
          submittedAt: status === "SUBMITTED" ? new Date() : null,
        },
      });

      // 2. Process each entry
      for (const entry of entries) {
        const cash = Number(entry.cash) || 0;
        const gpay = Number(entry.gpay) || 0;
        const card = Number(entry.card) || 0;
        const counterFlow = Number(entry.counterFlow) || 0;
        const collectedDue = Number(entry.collectedDue) || 0;
        const manualTotal = Number(entry.manualTotal) || 0;

        // Multi-entry arrays (preferred); fall back to legacy single fields
        const dueBills: { billNo: string; name: string; amount: number; mobile: string }[] =
          Array.isArray(entry.dueBills) ? entry.dueBills : [];
        const collectedDueBills: { billNo: string; name: string; mobile: string; amount: number }[] =
          Array.isArray(entry.collectedDueBills) ? entry.collectedDueBills : [];
        const manuallyCollectedBills: { billNo: string; name: string; mobile: string; amount: number }[] =
          Array.isArray(entry.manuallyCollectedBills) ? entry.manuallyCollectedBills : [];

        // Auto-compute totals from bill arrays when present (mirrors frontend auto-sum)
        const totalDue = dueBills.length > 0
          ? dueBills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
          : (Number(entry.totalDue) || 0);
        const manuallyCollected = manuallyCollectedBills.length > 0
          ? manuallyCollectedBills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
          : (Number(entry.manuallyCollected) || 0);

        // Legacy single fields — populated from first array element for backward compat
        const dueBillNo = dueBills[0]?.billNo || entry.dueBillNo || null;
        const dueBillName = dueBills[0]?.name || entry.dueBillName || null;
        const dueBillAmount = dueBills[0]?.amount ?? (Number(entry.dueBillAmount) || 0);
        const dueBillMobile = dueBills[0]?.mobile || entry.dueBillMobile || null;
        const collectedDueBillNo = collectedDueBills[0]?.billNo || entry.collectedDueBillNo || null;
        const collectedDueBillName = collectedDueBills[0]?.name || entry.collectedDueBillName || null;
        const collectedDueBillMobile = collectedDueBills[0]?.mobile || entry.collectedDueBillMobile || null;

        // C.T Sum = cash + gpay + card + counterFlow + totalDue  (Manually Collected is NOT included)
        const systemTotal = cash + gpay + card + counterFlow + totalDue;
        const difference = manualTotal; // user-entered +/- discrepancy stored directly
        const grandTotal = systemTotal;

        // Check if there was an existing database entry for audit logs
        const existingEntry = existingReport?.entries.find(
          (e) => e.counterId === entry.counterId
        );

        const upsertedEntry = await tx.reportEntry.upsert({
          where: {
            reportId_counterId: {
              reportId: report.id,
              counterId: entry.counterId,
            },
          },
          create: {
            reportId: report.id,
            counterId: entry.counterId,
            cash,
            gpay,
            card,
            counterFlow,
            totalDue,
            collectedDue,
            dueBillNo,
            dueBillName,
            dueBillAmount,
            dueBillMobile,
            collectedDueBillNo,
            collectedDueBillName,
            collectedDueBillMobile,
            dueBillsJson: dueBills,
            collectedDueBillsJson: collectedDueBills,
            manuallyCollected,
            manuallyCollectedBillsJson: manuallyCollectedBills,
            manualTotal,
            systemTotal,
            difference,
            grandTotal,
          },
          update: {
            cash,
            gpay,
            card,
            counterFlow,
            totalDue,
            collectedDue,
            dueBillNo,
            dueBillName,
            dueBillAmount,
            dueBillMobile,
            collectedDueBillNo,
            collectedDueBillName,
            collectedDueBillMobile,
            dueBillsJson: dueBills,
            collectedDueBillsJson: collectedDueBills,
            manuallyCollected,
            manuallyCollectedBillsJson: manuallyCollectedBills,
            manualTotal,
            systemTotal,
            difference,
            grandTotal,
          },
        });

        // Audit Logging for changes (only if values differ)
        if (existingEntry) {
          const changedFields: Record<string, [any, any]> = {};
          const fieldsToCheck = [
            "cash",
            "gpay",
            "card",
            "counterFlow",
            "totalDue",
            "collectedDue",
            "manuallyCollected",
            "dueBillAmount",
            "dueBillMobile",
            "collectedDueBillNo",
            "collectedDueBillName",
            "collectedDueBillMobile",
            "manualTotal",
          ];

          fieldsToCheck.forEach((field) => {
            const prev = (existingEntry as any)[field] ?? 0;
            const curr = (entry as any)[field] ?? 0;
            if (prev !== curr) {
              changedFields[field] = [prev, curr];
            }
          });

          if (Object.keys(changedFields).length > 0) {
            const counter = await tx.counter.findUnique({
              where: { id: entry.counterId },
            });

            await tx.auditLog.create({
              data: {
                userId: session.userId,
                reportEntryId: upsertedEntry.id,
                action: status === "SUBMITTED" ? "SUBMIT" : "DRAFT_SAVE",
                details: JSON.stringify({
                  counterName: counter?.name || "Unknown",
                  businessDate,
                  changes: changedFields,
                }),
              },
            });
          }
        } else {
          const counter = await tx.counter.findUnique({
            where: { id: entry.counterId },
          });

          await tx.auditLog.create({
            data: {
              userId: session.userId,
              reportEntryId: upsertedEntry.id,
              action: status === "SUBMITTED" ? "SUBMIT" : "DRAFT_SAVE",
              details: JSON.stringify({
                  counterName: counter?.name || "Unknown",
                  businessDate,
                  message: "Created initial daily report entry",
                  values: { cash, gpay, card, counterFlow, totalDue, collectedDue, dueBillAmount, dueBillMobile, collectedDueBillNo, collectedDueBillName, collectedDueBillMobile, manualTotal },
                }),
            },
          });
        }
      }

      // Log overall submission audit log
      if (status === "SUBMITTED") {
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: "REPORT_SUBMIT",
            details: JSON.stringify({
              branchId,
              businessDate,
            }),
          },
        });
      }

      return report;
    });

    return NextResponse.json({ success: true, report: savedReport });
  } catch (error: any) {
    // P2003 = foreign key constraint — stale session referencing deleted data
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Session data is stale. Please log in again." }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
