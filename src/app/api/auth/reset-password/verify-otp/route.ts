import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyOtpKitOtp } from "@/lib/otpkit";

export async function POST(request: Request) {
  try {
    const { sessionId, code } = await request.json();

    if (!sessionId || !code?.trim()) {
      return NextResponse.json(
        { error: "Session ID and OTP code are required." },
        { status: 400 }
      );
    }

    const otpSession = await prisma.passwordResetOtp.findUnique({
      where: { id: sessionId },
    });

    if (!otpSession) {
      return NextResponse.json(
        { error: "Invalid or expired reset session. Please request a new OTP." },
        { status: 400 }
      );
    }

    if (new Date() > otpSession.expiresAt) {
      await prisma.passwordResetOtp.delete({ where: { id: sessionId } });
      return NextResponse.json(
        { error: "This OTP session has expired. Please request a new code." },
        { status: 400 }
      );
    }

    // Call OTPKit API to verify code
    const verifyResult = await verifyOtpKitOtp(otpSession.otpKitId, code.trim());

    if (!verifyResult.verified) {
      return NextResponse.json(
        { error: verifyResult.error || "Incorrect OTP code. Please try again." },
        { status: 400 }
      );
    }

    // Mark session as verified
    await prisma.passwordResetOtp.update({
      where: { id: sessionId },
      data: { verified: true },
    });

    return NextResponse.json({
      success: true,
      verified: true,
      message: "OTP verified successfully. You may now enter your new password.",
    });
  } catch (error: any) {
    console.error("[verify-otp error]:", error);
    return NextResponse.json(
      { error: "Internal server error while verifying OTP." },
      { status: 500 }
    );
  }
}
