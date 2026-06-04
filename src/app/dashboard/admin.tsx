"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  LogOut,
  Calendar,
  Save,
  CheckSquare,
  Lock,
  AlertTriangle,
  User,
  Download,
} from "lucide-react";
import Image from "next/image";
import ExcelGrid, { ReportEntryData } from "@/components/ExcelGrid";
import { getBusinessDate } from "@/lib/utils";

interface AdminDashboardProps {
  session: {
    userId: string;
    username: string;
    name: string;
    role: string;
    branchId: string;
    branchName: string;
  };
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState("");
  const [gridData, setGridData] = useState<ReportEntryData[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isEditableWindowOpen, setIsEditableWindowOpen] = useState(true);
  const [reportStatus, setReportStatus] = useState<"DRAFT" | "SUBMITTED">("DRAFT");
  const [saveStatus, setSaveStatus] = useState<"draft" | "saving" | "saved" | "error">("saved");
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    setSelectedDate(getBusinessDate(new Date()));
  }, []);

  const fetchReport = async (dateStr: string) => {
    if (!dateStr) return;
    try {
      setErrorMsg(null);
      const response = await fetch(`/api/reports?date=${dateStr}`);
      if (!response.ok) throw new Error("Failed to load report");
      const data = await response.json();
      setGridData(data.report.entries);
      setReportStatus(data.report.status);
      setIsReadOnly(!data.isEditable);
      setIsEditableWindowOpen(data.editableWindowOpen);
      setSaveStatus("saved");
      isFirstLoad.current = true;
    } catch (err: any) {
      setErrorMsg("Error loading report. Please try again.");
    }
  };

  useEffect(() => {
    if (selectedDate) fetchReport(selectedDate);
  }, [selectedDate]);

  const triggerSave = async (dataToSave: ReportEntryData[], statusToSave: "DRAFT" | "SUBMITTED" = "DRAFT") => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: session.branchId,
          businessDate: selectedDate,
          status: statusToSave,
          entries: dataToSave,
        }),
      });
      const resData = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(resData.error || "Save failed");
      setSaveStatus("saved");
      if (statusToSave === "SUBMITTED") {
        setReportStatus("SUBMITTED");
        setIsReadOnly(true);
        fetchReport(selectedDate);
      }
    } catch (error: any) {
      setSaveStatus("error");
      setErrorMsg(error.message || "Auto-save failed. Check connection.");
    }
  };

  const handleGridChange = (newData: ReportEntryData[]) => {
    setGridData(newData);
    setSaveStatus("draft");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    autoSaveTimerRef.current = setTimeout(() => triggerSave(newData, "DRAFT"), 2000);
  };

  useEffect(() => {
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, []);

  const handleManualSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    triggerSave(gridData, "DRAFT");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch { router.push("/login"); }
  };

  return (
    <div className="flex min-h-screen bg-[#FDF6EE] text-[#1A0A0A]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#8B1A1A] flex flex-col justify-between shrink-0 shadow-xl">
        <div className="space-y-6 p-5">
          {/* Brand */}
          <div className="flex items-center gap-3 py-2 border-b border-[#C9A227]/30 pb-5">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded-lg shrink-0" />
            <div>
              <h1 className="font-extrabold text-sm tracking-wide text-[#C9A227]">VISHALA MALL</h1>
              <p className="text-[10px] text-white/60 font-semibold tracking-widest uppercase">Operator Portal</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#8B1A1A] bg-[#C9A227] rounded-lg text-left shadow-md shadow-[#C9A227]/20">
              <FileSpreadsheet size={15} />
              <span>Sheet Editor</span>
            </button>
          </nav>
        </div>

        {/* User card + sign out */}
        <div className="p-5 border-t border-[#C9A227]/20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#C9A227]/20 border border-[#C9A227]/40 flex items-center justify-center text-[#C9A227]">
              <User size={16} />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">{session.name}</p>
              <p className="text-[10px] text-white/50 font-medium truncate">{session.branchName}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white/80 hover:text-white border border-white/10 transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="px-8 py-4 bg-white border-b border-[#E8D5B0] flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-sm">
          <div>
            <h2 className="text-lg font-extrabold text-[#8B1A1A]">
              {session.branchName} — Daily Report
            </h2>
            <p className="text-xs text-[#9A7E6A] mt-0.5">
              Enter values for the active business day. Next-day deadline: 10:00 AM.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Date picker */}
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A7E6A]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-8 pr-3 py-2 bg-[#FDF6EE] border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
              />
            </div>

            {/* Export */}
            <a
              href={`/api/reports/export?branchId=${session.branchId}&date=${selectedDate}`}
              download
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FDF6EE] hover:bg-[#F0E4CC] text-xs font-bold text-[#5C4A3A] border border-[#E8D5B0] transition-all cursor-pointer"
            >
              <Download size={13} />
              <span>Export</span>
            </a>

            {/* Save / Lock */}
            {!isReadOnly ? (
              <>
                <button
                  onClick={handleManualSave}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FDF6EE] hover:bg-[#F0E4CC] text-xs font-bold text-[#5C4A3A] border border-[#E8D5B0] transition-all cursor-pointer"
                >
                  <Save size={13} />
                  <span>Save Draft</span>
                </button>
                <button
                  onClick={() => setShowConfirmSubmit(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#8B1A1A] hover:bg-[#6B1212] text-xs font-bold text-white shadow-md shadow-[#8B1A1A]/20 transition-all cursor-pointer"
                >
                  <CheckSquare size={13} />
                  <span>Submit & Lock</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
                <Lock size={13} />
                <span>Locked (Read-Only)</span>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2.5 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isEditableWindowOpen && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Business Day Submission Window Closed</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  The cycle for {selectedDate} closed at 10:00 AM. Editing is locked.
                </p>
              </div>
            </div>
          )}

          {reportStatus === "SUBMITTED" && isEditableWindowOpen && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-[#1B8A7A]/10 border border-[#1B8A7A]/30 text-[#1B8A7A] text-sm">
              <CheckSquare size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Report Submitted Successfully</p>
                <p className="text-xs mt-0.5 text-[#1B8A7A]/80">
                  This closing report is locked and visible to Super Admins.
                </p>
              </div>
            </div>
          )}

          <ExcelGrid
            data={gridData}
            onChange={handleGridChange}
            isReadOnly={isReadOnly}
            saveStatus={saveStatus}
          />
        </div>
      </main>

      {/* Submit confirm modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E8D5B0] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-extrabold text-[#8B1A1A] mb-2">Submit Daily Counter Sheet?</h3>
            <p className="text-xs text-[#5C4A3A] mb-6 leading-relaxed">
              Are you sure you want to submit the daily sheet for{" "}
              <span className="font-bold text-[#1A0A0A]">{selectedDate}</span>? Once submitted, the sheet is locked and cannot be edited.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-[#FDF6EE] hover:bg-[#F0E4CC] text-[#5C4A3A] border border-[#E8D5B0] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
                  triggerSave(gridData, "SUBMITTED");
                  setShowConfirmSubmit(false);
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-[#8B1A1A] hover:bg-[#6B1212] text-white transition-all cursor-pointer"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
