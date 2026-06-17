import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getBusinessDate } from "@/lib/utils";

/** Basic YYYY-MM-DD shape check. */
function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * GET /api/verifications?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Super-admin only. Returns day-wise C.T Sum verification flags keyed by branch then date:
 *   { verifications: { [branchId]: { [businessDate]: { verified, verifiedAt, verifiedBy } } } }
 */
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
    if (!isValidDate(from)) from = today;
    if (!isValidDate(to)) to = today;
    if (from > to) [from, to] = [to, from];

    const rows = await prisma.dayVerification.findMany({
      where: { businessDate: { gte: from, lte: to } },
      include: { verifiedBy: { select: { name: true } } },
    });

    const verifications: Record<string, Record<string, { verified: boolean; verifiedAt: Date | null; verifiedBy: string | null }>> = {};
    for (const row of rows) {
      let byDate = verifications[row.branchId];
      if (!byDate) { byDate = {}; verifications[row.branchId] = byDate; }
      byDate[row.businessDate] = {
        verified: row.verified,
        verifiedAt: row.verifiedAt,
        verifiedBy: row.verifiedBy?.name || null,
      };
    }

    return NextResponse.json({ from, to, verifications });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/verifications  body: { branchId, businessDate, verified }
 * Super-admin only. Toggles/sets the verification flag for one branch×day cell.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Access restricted to Super Admins" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { branchId, businessDate } = body as { branchId?: unknown; businessDate?: unknown; verified?: unknown };
    const verified = Boolean((body as { verified?: unknown }).verified);

    if (typeof branchId !== "string" || !branchId) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    if (!isValidDate(businessDate)) {
      return NextResponse.json({ error: "businessDate must be YYYY-MM-DD" }, { status: 400 });
    }

    // Ensure the branch exists (avoids opaque FK errors).
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    const verifiedFields = verified
      ? { verified: true, verifiedById: session.userId, verifiedAt: new Date() }
      : { verified: false, verifiedById: null, verifiedAt: null };

    const row = await prisma.dayVerification.upsert({
      where: { branchId_businessDate: { branchId, businessDate } },
      create: { branchId, businessDate, ...verifiedFields },
      update: { ...verifiedFields },
      include: { verifiedBy: { select: { name: true } } },
    });

    return NextResponse.json({
      branchId: row.branchId,
      businessDate: row.businessDate,
      verified: row.verified,
      verifiedAt: row.verifiedAt,
      verifiedBy: row.verifiedBy?.name || null,
    });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
