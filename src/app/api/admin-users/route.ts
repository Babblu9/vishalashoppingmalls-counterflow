import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 6;

// GET: List all ADMIN users (Super Admin only)
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: { role: "ADMIN" },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        branchId: u.branchId,
        branchName: u.branch?.name ?? null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin-users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST: Create a new ADMIN user (Super Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { username, name, password, branchId } = body as Record<string, string>;

    if (!username?.trim() || !name?.trim() || !password || !branchId) {
      return NextResponse.json(
        { error: "username, name, password, and branchId are required" },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Validate username: alphanumeric, underscore, hyphen only
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      return NextResponse.json(
        { error: "Username may only contain letters, numbers, underscores, and hyphens" },
        { status: 400 }
      );
    }

    // Verify branchId exists
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    // Check username uniqueness
    const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const user = await prisma.user.create({
      data: { username: username.trim(), name: name.trim(), role: "ADMIN", branchId, passwordHash },
      include: { branch: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "ADMIN_CREATE",
        details: JSON.stringify({ createdUsername: user.username, branchId, branchName: branch.name }),
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        branchId: user.branchId,
        branchName: user.branch?.name ?? null,
      },
    });
  } catch (error) {
    console.error("POST /api/admin-users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT: Edit an ADMIN user's credentials (Super Admin only)
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, username, name, password, branchId } = body as Record<string, string>;

    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    // Validate new username format if changing
    if (username && !/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      return NextResponse.json(
        { error: "Username may only contain letters, numbers, underscores, and hyphens" },
        { status: 400 }
      );
    }

    // Validate new password length if provided
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Check username uniqueness if changing
    if (username && username.trim() !== target.username) {
      const taken = await prisma.user.findUnique({ where: { username: username.trim() } });
      if (taken) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
    }

    // Validate branchId if changing
    if (branchId && branchId !== target.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (username?.trim()) updateData.username = username.trim();
    if (name?.trim()) updateData.name = name.trim();
    if (branchId) updateData.branchId = branchId;
    if (password) updateData.passwordHash = bcrypt.hashSync(password, 10);

    // Avoid a no-op update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { branch: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "ADMIN_EDIT",
        details: JSON.stringify({
          targetId: id,
          targetUsername: target.username,
          changedFields: Object.keys(updateData).filter((k) => k !== "passwordHash"),
          passwordChanged: !!password,
        }),
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        name: updated.name,
        branchId: updated.branchId,
        branchName: updated.branch?.name ?? null,
      },
    });
  } catch (error) {
    console.error("PUT /api/admin-users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Remove an ADMIN user (Super Admin only)
// Uses query param ?id=xxx to avoid non-standard body-on-DELETE
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Support both ?id=xxx query param and request body for compatibility
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    // Nullify submittedById in any reports this user submitted, then delete
    await prisma.$transaction([
      prisma.dailyReport.updateMany({
        where: { submittedById: id },
        data: { submittedById: null },
      }),
      prisma.user.delete({ where: { id } }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "ADMIN_DELETE",
        details: JSON.stringify({ deletedUsername: target.username, deletedId: id }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin-users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
