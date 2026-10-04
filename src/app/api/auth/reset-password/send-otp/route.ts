import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { normalizeIndianMobile, sendOtpKitOtp } from "@/lib/otpkit";

export async function POST(request: Request) {
  try {
    const { username, verificationNumber } = await request.json();

    if (!username?.trim() || !verificationNumber?.trim()) {
      return NextResponse.json(
        { error: "Username and verification number (mobile number) are required." },
        { status: 400 }
      );
    }

    const { valid, formatted, error: phoneErr } = normalizeIndianMobile(verificationNumber);
    if (!valid) {
      return NextResponse.json({ error: phoneErr }, { status: 400 });
    }

    // Look up the user
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this username." },
        { status: 404 }
      );
    }

    // Only SUPER_ADMIN (Main Admin) can reset password via OTPKit
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "Self-service OTP reset is only permitted for the Main Admin dashboard. Branch admin credentials must be managed by the Super Admin.",
        },
        { status: 403 }
      );
    }

    // If super admin already has a registered phone number, ensure the provided verification number matches
    if (user.phoneNumber) {
      const { formatted: registeredFormatted } = normalizeIndianMobile(user.phoneNumber);
      if (registeredFormatted !== formatted) {
        return NextResponse.json(
          {
            error:
              "The verification number provided does not match the registered phone number for the Main Admin account.",
          },
          { status: 400 }
        );
      }
    }

    // Call OTPKit API to send the OTP
    const otpResult = await sendOtpKitOtp(formatted);
    if (!otpResult.success || !otpResult.id) {
      return NextResponse.json(
        { error: otpResult.error || "Failed to send OTP via OTPKit." },
        { status: 502 }
      );
    }

    // Invalidate any existing unused OTP sessions for this user
    await prisma.passwordResetOtp.deleteMany({
      where: { userId: user.id },
    });

    // Create a new OTP session valid for 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const session = await prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpKitId: otpResult.id,
        phone: formatted,
        expiresAt,
        verified: false,
      },
    });

    // Mask phone for response (e.g., "+91 ******3210")
    const last4 = formatted.slice(-4);
    const maskedPhone = `+91 ******${last4}`;

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      maskedPhone,
      message: `OTP sent successfully to ${maskedPhone}.`,
    });
  } catch (error: any) {
    console.error("[send-otp error]:", error);
    return NextResponse.json(
      { error: "Internal server error while initiating OTP." },
      { status: 500 }
    );
  }
}
