"use client";

import React, { useState, useEffect } from "react";
import {
  Lock,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  ArrowRight,
  KeyRound,
} from "lucide-react";

interface AdminPasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUsername?: string;
  onSuccess?: () => void;
}

export default function AdminPasswordResetModal({
  isOpen,
  onClose,
  initialUsername = "superadmin",
  onSuccess,
}: AdminPasswordResetModalProps) {
  const [step, setStep] = useState<"phone" | "otp" | "password" | "success">("phone");
  const [username, setUsername] = useState(initialUsername);
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Fetch registered phone number if already logged in / available
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setError(null);
      setOtpCode("");
      setNewPassword("");
      setConfirmPassword("");
      setUsername(initialUsername || "superadmin");

      fetch("/api/auth/profile/phone")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.phoneNumber) {
            setPhone(data.phoneNumber.replace("+91", ""));
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialUsername]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  // Step 1: Send OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phone.trim()) {
      setError("Please enter your 10-digit mobile verification number.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          verificationNumber: phone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP.");
      }

      setSessionId(data.sessionId);
      setMaskedPhone(data.maskedPhone || phone);
      setStep("otp");
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || "Failed to send OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError("Please enter the verification code received on your phone.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          code: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid OTP code.");
      }

      setStep("password");
    } catch (err: any) {
      setError(err.message || "Failed to verify OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password.");
      }

      setStep("success");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#FDF6EE] border border-[#E8D5B0] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#8B1A1A] text-white px-6 py-5 flex items-center justify-between relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-[#C9A227]/20 pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 border border-white/20 text-[#C9A227]">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wide">Main Admin Password Reset</h3>
              <p className="text-xs text-[#E8D5B0]/80">Direct self-service OTP verification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="relative z-10 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress tracker */}
        <div className="flex border-b border-[#E8D5B0] bg-[#FAF0E1] px-6 py-2.5 text-xs font-semibold text-[#9A7E6A]">
          <div className={`flex items-center gap-1.5 ${step === "phone" ? "text-[#8B1A1A] font-bold" : ""}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] border-current">
              1
            </span>
            <span>Mobile</span>
          </div>
          <span className="mx-2 text-[#E8D5B0]">/</span>
          <div className={`flex items-center gap-1.5 ${step === "otp" ? "text-[#8B1A1A] font-bold" : ""}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] border-current">
              2
            </span>
            <span>OTP</span>
          </div>
          <span className="mx-2 text-[#E8D5B0]">/</span>
          <div className={`flex items-center gap-1.5 ${step === "password" || step === "success" ? "text-[#8B1A1A] font-bold" : ""}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] border-current">
              3
            </span>
            <span>New Password</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* STEP 1: Phone number / Verification number */}
          {step === "phone" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white border border-[#E8D5B0] text-xs text-[#5C4A3A] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#8B1A1A]">
                  <ShieldCheck size={15} className="text-[#C9A227]" />
                  <span>Main Admin Authorization</span>
                </div>
                <p>
                  Enter the verification mobile number registered for the <strong>{username}</strong> account.
                  A high-priority OTP code will be delivered instantly via OTPKit SMS.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C4A3A] uppercase tracking-wider">
                  Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-[#E8D5B0] bg-white py-2.5 px-3 text-sm font-medium text-[#1A0A0A] focus:border-[#C9A227] focus:outline-none"
                  placeholder="superadmin"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C4A3A] uppercase tracking-wider">
                  Verification Mobile Number
                </label>
                <div className="relative flex rounded-lg border border-[#E8D5B0] bg-white focus-within:border-[#C9A227] focus-within:ring-2 focus-within:ring-[#C9A227]/20">
                  <span className="inline-flex items-center px-3 border-r border-[#E8D5B0] bg-[#FAF0E1] text-xs font-bold text-[#5C4A3A]">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter 10-digit number"
                    className="w-full py-2.5 px-3 text-sm text-[#1A0A0A] placeholder-[#9A7E6A] focus:outline-none bg-transparent"
                    required
                  />
                  <div className="flex items-center pr-3 text-[#9A7E6A]">
                    <Smartphone size={16} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold text-white bg-[#8B1A1A] hover:bg-[#6B1212] disabled:opacity-50 transition-all shadow-md shadow-[#8B1A1A]/20 cursor-pointer"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: OTP Verification */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center space-y-1 py-1">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C9A227]/15 text-[#8B1A1A] mb-2 border border-[#C9A227]/30">
                  <Smartphone size={24} />
                </div>
                <h4 className="text-sm font-bold text-[#1A0A0A]">Verification Code Sent</h4>
                <p className="text-xs text-[#5C4A3A]">
                  Enter the 6-digit OTP sent to <strong className="text-[#8B1A1A]">{maskedPhone}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C4A3A] uppercase tracking-wider block text-center">
                  One-Time Password
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full text-center tracking-[0.4em] text-2xl font-extrabold py-3 px-4 rounded-xl border border-[#E8D5B0] bg-white text-[#8B1A1A] focus:border-[#C9A227] focus:outline-none focus:ring-2 focus:ring-[#C9A227]/20"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="text-[#9A7E6A] hover:text-[#8B1A1A] underline cursor-pointer"
                >
                  Change number
                </button>

                <button
                  type="button"
                  disabled={resendCooldown > 0 || isLoading}
                  onClick={() => handleSendOtp()}
                  className="text-[#8B1A1A] font-semibold hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold text-white bg-[#8B1A1A] hover:bg-[#6B1212] disabled:opacity-50 transition-all shadow-md shadow-[#8B1A1A]/20 cursor-pointer"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Verify Code</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 3: Enter New Password */}
          {step === "password" && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs">
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <span>Verification successful! Set your new password below.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C4A3A] uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full py-2.5 pl-3 pr-10 rounded-lg border border-[#E8D5B0] bg-white text-sm text-[#1A0A0A] focus:border-[#C9A227] focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9A7E6A] hover:text-[#5C4A3A]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C4A3A] uppercase tracking-wider">
                  Confirm New Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full py-2.5 px-3 rounded-lg border border-[#E8D5B0] bg-white text-sm text-[#1A0A0A] focus:border-[#C9A227] focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold text-white bg-[#8B1A1A] hover:bg-[#6B1212] disabled:opacity-50 transition-all shadow-md shadow-[#8B1A1A]/20 cursor-pointer"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock size={16} />
                    <span>Save & Update Password</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 4: Success confirmation */}
          {step === "success" && (
            <div className="text-center py-4 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-1 border border-green-200">
                <CheckCircle2 size={36} />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-extrabold text-[#1A0A0A]">Password Reset Complete!</h4>
                <p className="text-xs text-[#5C4A3A] max-w-xs mx-auto">
                  Your Main Admin credentials have been updated securely. You can now use your new password anytime without contacting developer support.
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-bold text-white bg-[#8B1A1A] hover:bg-[#6B1212] transition-colors shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
