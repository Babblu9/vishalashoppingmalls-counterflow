import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getBusinessDate } from "@/lib/utils";

const MAX_DAYS = 92;

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

const counterSort = (a: string, b: string) => {
  const n = (s: string) => parseInt(s.replace(/\D/g, "") || "0", 10);
  return n(a) - n(b);
};

export interface BillRow {
  branchId: string;
  branchName: string;
  businessDate: string;
  counterId: string;
  counterName: string;
  billNo: string;
  name: string;
  mobile: string;
  amount: number;
}

/**
 * GET /api/reports/bills?from=YYYY-MM-DD&to=YYYY-MM-DD&type=due|manual&branchId=<optional>
 *
 * Returns the bill-level detail rows (one row per individual bill) across the
 * requested date range. Used by the super-admin "Due" and "Manually Collected"
 * range tabs to render a detailed breakdown under the day-wise matrix.
 *
 *  - type=due   → rows from dueBillsJson (fallback to legacy single due fields)
 *  - type=manual→ rows from manuallyCollectedBillsJson
 *
 * Admins are automatically scoped to their own branch; Super Admins may pass an
 * optional branchId to narrow the result, otherwise every branch is included.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "due").toLowerCase();
    if (type !== "due" && type !== "manual") {
      return NextResponse.json({ error: "type must be 'due' or 'manual'" }, { status: 400 });
    }

    const today = getBusinessDate(new Date());
    let from = searchParams.get("from") || today;
    let to = searchParams.get("to") || today;
    if (from > to) [from, to] = [to, from];

    const dates = enumerateDates(from, to);
    const effectiveTo = dates.length > 0 ? dates[dates.length - 1] : to;

    // Branch scoping: admins only see their own branch; super admins may filter
    const branchFilter: Record<string, unknown> = {};
    if (session.role === "ADMIN") {
      if (!session.branchId) {
        return NextResponse.json({ error: "No branch assigned to this account" }, { status: 403 });
      }
      branchFilter.id = session.branchId;
    } else if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const branchId = searchParams.get("branchId");
      if (branchId && branchId !== "all") branchFilter.id = branchId;
    }

    const branches = await prisma.branch.findMany({
      where: branchFilter,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));
    const branchIds = branches.map((b) => b.id);
    if (branchIds.length === 0) {
      return NextResponse.json({ from, to: effectiveTo, type, bills: [], total: 0 });
    }

    const reports = await prisma.dailyReport.findMany({
      where: {
        branchId: { in: branchIds },
        businessDate: { gte: from, lte: effectiveTo },
      },
      include: { entries: { include: { counter: { select: { name: true } } } } },
      orderBy: { businessDate: "asc" },
    });

    const rows: BillRow[] = [];

    for (const report of reports) {
      const branchName = branchMap.get(report.branchId) ?? "Unknown";
      // Sort entries numerically by counter name for stable ordering
      const sortedEntries = [...report.entries].sort((a, b) =>
        counterSort(a.counter.name, b.counter.name)
      );

      for (const entry of sortedEntries) {
        if (type === "due") {
          const raw = entry.dueBillsJson as unknown;
          const bills = Array.isArray(raw) ? (raw as any[]) : [];
          if (bills.length > 0) {
            bills.forEach((b) => {
              rows.push({
                branchId: report.branchId,
                branchName,
                businessDate: report.businessDate,
                counterId: entry.counterId,
                counterName: entry.counter.name,
                billNo: String(b?.billNo ?? ""),
                name: String(b?.name ?? ""),
                mobile: String(b?.mobile ?? ""),
                amount: Number(b?.amount) || 0,
              });
            });
          } else if ((entry.totalDue || 0) > 0 || entry.dueBillNo || entry.dueBillName) {
            // Legacy single-entry fallback
            rows.push({
              branchId: report.branchId,
              branchName,
              businessDate: report.businessDate,
              counterId: entry.counterId,
              counterName: entry.counter.name,
              billNo: entry.dueBillNo ?? "",
              name: entry.dueBillName ?? "",
              mobile: entry.dueBillMobile ?? "",
              amount: entry.totalDue || 0,
            });
          }
        } else {
          const raw = entry.manuallyCollectedBillsJson as unknown;
          const bills = Array.isArray(raw) ? (raw as any[]) : [];
          bills.forEach((b) => {
            rows.push({
              branchId: report.branchId,
              branchName,
              businessDate: report.businessDate,
              counterId: entry.counterId,
              counterName: entry.counter.name,
              billNo: String(b?.billNo ?? ""),
              name: String(b?.name ?? ""),
              mobile: String(b?.mobile ?? ""),
              amount: Number(b?.amount) || 0,
            });
          });
        }
      }
    }

    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

    return NextResponse.json({
      from,
      to: effectiveTo,
      type,
      bills: rows,
      total,
      count: rows.length,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
