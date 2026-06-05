import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET: Preview how many records would be deleted (dry-run)
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  const reportCount = await prisma.dailyReport.count({
    where: { businessDate: { lt: cutoffDate } },
  });
  const auditLogCount = await prisma.auditLog.count({
    where: { timestamp: { lt: cutoff } },
  });

  return NextResponse.json({
    cutoffDate,
    wouldDelete: { reports: reportCount, auditLogs: auditLogCount },
  });
}

// POST: Execute cleanup — delete DailyReports (and cascading entries) + old audit logs older than 45 days
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  // Delete reports older than 45 days (ReportEntry cascades via onDelete: Cascade)
  const deletedReports = await prisma.dailyReport.deleteMany({
    where: { businessDate: { lt: cutoffDate } },
  });

  // Delete audit logs older than 45 days
  const deletedLogs = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  // Write a cleanup audit log entry
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DATA_CLEANUP",
      details: JSON.stringify({
        cutoffDate,
        deletedReports: deletedReports.count,
        deletedAuditLogs: deletedLogs.count,
        performedBy: session.username,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    cutoffDate,
    deleted: {
      reports: deletedReports.count,
      auditLogs: deletedLogs.count,
    },
  });
}
