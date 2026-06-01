"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, AlertCircle } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#FDF6EE]">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#8B1A1A] flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-80px] left-[-80px] w-[300px] h-[300px] rounded-full bg-[#C9A227]/10 border border-[#C9A227]/20"></div>
        <div className="absolute bottom-[-60px] right-[-60px] w-[250px] h-[250px] rounded-full bg-[#1B8A7A]/10 border border-[#1B8A7A]/20"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#C9A227]/5 border border-[#C9A227]/10"></div>

        <div className="relative z-10 text-center space-y-6">
          <Image src="/logo-main.png" alt="Vishala Logo" width={180} height={180} className="mx-auto object-contain drop-shadow-2xl" />
          <div>
            <h1 className="text-4xl font-extrabold text-[#C9A227] tracking-wide drop-shadow">VISHALA</h1>
            <p className="text-lg font-semibold text-white/80 tracking-widest uppercase mt-1">Shopping Mall</p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <div className="h-px w-16 bg-[#C9A227]/40"></div>
              <span className="text-xs text-[#C9A227]/70 tracking-widest uppercase font-semibold">Sircilla · Siddipet</span>
              <div className="h-px w-16 bg-[#C9A227]/40"></div>
            </div>
          </div>
          <p className="text-sm text-white/50 max-w-xs mx-auto leading-relaxed">
            Secure daily counter closing management portal for branch operators.
          </p>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-8 space-y-3">
          <Image src="/logo.png" alt="Logo" width={72} height={72} className="object-contain" />
          <h1 className="text-2xl font-extrabold text-[#8B1A1A]">Vishala Shopping Mall</h1>
          <p className="text-sm text-[#5C4A3A]">Daily Counter Closing System</p>
        </div>

        <div className="w-full max-w-md space-y-8">
          <div className="hidden lg:block space-y-2">
            <h2 className="text-3xl font-extrabold text-[#8B1A1A]">Welcome back</h2>
            <p className="text-sm text-[#5C4A3A]">Sign in to access the counter closing portal.</p>
          </div>

          {/* Card */}
          <div className="bg-white border border-[#E8D5B0] rounded-2xl p-8 shadow-lg shadow-[#8B1A1A]/5">
            <h3 className="text-base font-bold text-[#1A0A0A] mb-6 pb-4 border-b border-[#E8D5B0]">
              Account Sign In
            </h3>

            {error && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-5">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-bold text-[#5C4A3A] tracking-wider uppercase">
                  Username
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#9A7E6A]">
                    <User size={16} />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] py-3 pl-9 pr-4 text-sm text-[#1A0A0A] placeholder-[#9A7E6A] focus:border-[#C9A227] focus:outline-none focus:ring-2 focus:ring-[#C9A227]/20 transition-all"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-bold text-[#5C4A3A] tracking-wider uppercase">
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#9A7E6A]">
                    <Lock size={16} />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] py-3 pl-9 pr-4 text-sm text-[#1A0A0A] placeholder-[#9A7E6A] focus:border-[#C9A227] focus:outline-none focus:ring-2 focus:ring-[#C9A227]/20 transition-all"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full flex justify-center items-center py-3 px-4 rounded-lg text-sm font-bold text-white bg-[#8B1A1A] hover:bg-[#6B1212] active:bg-[#5A0F0F] disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#8B1A1A]/30 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <div className="text-center text-xs text-[#9A7E6A] space-y-1">
            <p>Protected by role-based session keys and encryption.</p>
            <p>Active closing business hours: 10:00 AM to 10:00 AM next day.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
