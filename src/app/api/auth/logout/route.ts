import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: session.userId,
            action: "LOGOUT",
            details: JSON.stringify({ username: session.username }),
          },
        });
      } catch {
        // Audit logging is non-critical; proceed with logout even if it fails
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch {
    // Still clear the cookie so the user can get out
    await clearSessionCookie().catch(() => {});
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
