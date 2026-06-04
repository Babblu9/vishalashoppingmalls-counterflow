import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const sessionPayload = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
    };

    await setSessionCookie(sessionPayload);

    // Create login audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        details: JSON.stringify({ role: user.role, branchName: user.branch?.name || "Super Admin" }),
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
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
