import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

const MIN_PASSWORD_LENGTH = 6;

export async function POST(request: Request) {
  try {
    const { sessionId, newPassword } = await request.json();

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    if (!sessionId || !newPassword) {
      return NextResponse.json(
        { error: "Session ID and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const otpSession = await prisma.passwordResetOtp.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!otpSession) {
      return NextResponse.json(
        { error: "Invalid reset session. Please restart the reset process." },
        { status: 400 }
      );
    }

    if (!otpSession.verified) {
      return NextResponse.json(
        { error: "OTP verification has not been completed." },
        { status: 403 }
      );
    }

    if (new Date() > otpSession.expiresAt) {
      await prisma.passwordResetOtp.delete({ where: { id: sessionId } });
      return NextResponse.json(
        { error: "Reset session has expired. Please restart the process." },
        { status: 400 }
      );
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);

    // Update password and record/ensure the verified phone number on the super admin
    await prisma.$transaction([
      prisma.user.update({
        where: { id: otpSession.userId },
        data: {
          passwordHash,
          phoneNumber: otpSession.phone,
        },
      }),
      // Delete all OTP sessions for this user so token cannot be reused
      prisma.passwordResetOtp.deleteMany({
        where: { userId: otpSession.userId },
      }),
      // Audit log entry
      prisma.auditLog.create({
        data: {
          userId: otpSession.userId,
          action: "PASSWORD_RESET",
          details: JSON.stringify({
            targetUsername: otpSession.user.username,
            method: "OTPKIT_SMS",
            verifiedPhone: otpSession.phone,
          }),
          ipAddress,
          userAgent,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now log in with your new password.",
    });
  } catch (error: any) {
    console.error("[update-password error]:", error);
    return NextResponse.json(
      { error: "Internal server error while updating password." },
      { status: 500 }
    );
  }
}
