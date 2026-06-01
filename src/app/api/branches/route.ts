import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const branches = await prisma.branch.findMany({
      include: {
        counters: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ branches });
  } catch (error) {
    console.error("GET branches error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
