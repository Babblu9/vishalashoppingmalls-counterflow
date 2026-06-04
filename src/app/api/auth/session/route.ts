import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ session: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { branch: true },
    });

    if (!user) {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({
      session: {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch?.name || null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
