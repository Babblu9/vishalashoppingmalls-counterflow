import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Access restricted to Super Admins" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            name: true,
            username: true,
            role: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
