/**
 * Helper client for OTPKit (https://otpkit.in)
 * Handles sending and verifying OTPs for India phone numbers.
 */

const OTPKIT_BASE_URL = "https://api.otpkit.in";

/**
 * Format any Indian mobile number variation to +91XXXXXXXXXX
 * Example inputs: "9876543210", "+919876543210", "09876543210", "91 98765 43210"
 */
export function normalizeIndianMobile(raw: string): { valid: boolean; formatted: string; error?: string } {
  if (!raw) {
    return { valid: false, formatted: "", error: "Mobile number is required." };
  }

  // Remove whitespace, dashes, parens
  let cleaned = raw.replace(/[\s\-\(\)]/g, "");

  // Remove leading +
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 0 and is 11 digits, strip leading 0
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // If 10 digits starting with 6, 7, 8, 9, prepend 91
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    cleaned = `91${cleaned}`;
  }

  // Now must be 12 digits starting with 91[6-9]
  if (!/^91[6-9]\d{9}$/.test(cleaned)) {
    return {
      valid: false,
      formatted: "",
      error: "Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).",
    };
  }

  return {
    valid: true,
    formatted: `+${cleaned}`,
  };
}

export interface SendOtpResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface VerifyOtpResult {
  verified: boolean;
  error?: string;
}

/**
 * Send an OTP to an Indian mobile number via OTPKit
 */
export async function sendOtpKitOtp(destinationMobile: string): Promise<SendOtpResult> {
  const apiKey = process.env.OTPKIT_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "OTPKIT_API_KEY is not configured on the server. Please contact system admin.",
    };
  }

  const { valid, formatted, error } = normalizeIndianMobile(destinationMobile);
  if (!valid) {
    return { success: false, error };
  }

  try {
    const response = await fetch(`${OTPKIT_BASE_URL}/v1/otp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ to: formatted }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      const errMsg =
        data?.message ||
        data?.error ||
        `OTP send failed with status ${response.status}`;
      return { success: false, error: errMsg };
    }

    if (!data.id) {
      return { success: false, error: "OTPKit did not return a valid OTP session id." };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (err: any) {
    console.error("[OTPKit send error]:", err);
    return {
      success: false,
      error: err.message || "Network error while connecting to OTP service.",
    };
  }
}

/**
 * Verify an OTP using OTPKit session ID and code
 */
export async function verifyOtpKitOtp(otpKitId: string, code: string): Promise<VerifyOtpResult> {
  const apiKey = process.env.OTPKIT_API_KEY;
  if (!apiKey) {
    return {
      verified: false,
      error: "OTPKIT_API_KEY is not configured on the server.",
    };
  }

  if (!otpKitId || !code?.trim()) {
    return {
      verified: false,
      error: "OTP ID and verification code are required.",
    };
  }

  try {
    const response = await fetch(`${OTPKIT_BASE_URL}/v1/otp/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        id: otpKitId,
        code: code.trim(),
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      const errMsg =
        data?.message ||
        data?.error ||
        `Verification request failed with status ${response.status}`;
      return { verified: false, error: errMsg };
    }

    return {
      verified: !!data.verified,
      error: data.verified ? undefined : "Incorrect OTP entered. Please try again.",
    };
  } catch (err: any) {
    console.error("[OTPKit verify error]:", err);
    return {
      verified: false,
      error: err.message || "Network error while verifying OTP.",
    };
  }
}
