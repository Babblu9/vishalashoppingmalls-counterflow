import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizeIndianMobile } from "@/lib/otpkit";

// GET: Retrieve Super Admin's registered phone number
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, phoneNumber: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      phoneNumber: user.phoneNumber,
      maskedPhone: user.phoneNumber ? `+91 ******${user.phoneNumber.slice(-4)}` : null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST: Set or update Super Admin's verification phone number
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { phoneNumber } = await request.json();
    const { valid, formatted, error: phoneErr } = normalizeIndianMobile(phoneNumber);

    if (!valid) {
      return NextResponse.json({ error: phoneErr }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: { phoneNumber: formatted },
      select: { id: true, username: true, phoneNumber: true },
    });

    return NextResponse.json({
      success: true,
      phoneNumber: updated.phoneNumber,
      maskedPhone: `+91 ******${updated.phoneNumber!.slice(-4)}`,
      message: "Verification phone number updated successfully.",
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
