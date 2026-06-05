"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building,
  AlertTriangle,
  CheckCircle,
  Clock,
  LogOut,
  Calendar,
  Download,
  Activity,
  User,
  ListFilter,
  RefreshCw,
  Search,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
  ArchiveRestore,
  Database,
  Trash,
} from "lucide-react";
import Image from "next/image";
import ExcelGrid, { ReportEntryData } from "@/components/ExcelGrid";
import { getBusinessDate, formatCurrency } from "@/lib/utils";

interface SuperAdminDashboardProps {
  session: {
    userId: string;
    username: string;
    name: string;
    role: string;
    branchId: string | null;
  };
}

interface SummaryData {
  businessDate: string;
  branchSummaries: any[];
  metrics: {
    totalCollection: number;
    totalDifference: number;
    totalSubmittedBranches: number;
    totalBranches: number;
    alertCount: number;
  };
  alerts: any[];
}

interface BackupDay {
  businessDate: string;
  branches: { branchId: string; branchName: string; status: string; submittedBy: string | null; submittedAt: string | null; entryCount: number }[];
  totalBranches: number;
  submittedBranches: number;
}

interface AdminUser {
  id: string;
  username: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
}

interface AdminFormState {
  id?: string;
  username: string;
  name: string;
  password: string;
  branchId: string;
}

const EMPTY_FORM: AdminFormState = { username: "", name: "", password: "", branchId: "" };

export default function SuperAdminDashboard({ session }: SuperAdminDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "admins" | "backup">("overview");
  const [selectedDate, setSelectedDate] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [reviewGridData, setReviewGridData] = useState<ReportEntryData[]>([]);
  const [reviewReportStatus, setReviewReportStatus] = useState<string>("DRAFT");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin credentials management state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<AdminFormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);

  // Backup & cleanup state
  const [backupDays, setBackupDays] = useState<BackupDay[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [downloadingDate, setDownloadingDate] = useState<string | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<{ reports: number; auditLogs: number } | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ reports: number; auditLogs: number } | null>(null);
  

  useEffect(() => { setSelectedDate(getBusinessDate(new Date())); }, []);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch("/api/branches");
        if (res.ok) { const d = await res.json(); setBranches(d.branches); }
      } catch { /* non-critical */ }
    };
    fetchBranches();
  }, []);

  const fetchData = async () => {
    if (!selectedDate) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const summaryRes = await fetch(`/api/reports/summary?date=${selectedDate}`);
      if (!summaryRes.ok) throw new Error("Failed to load summary");
      setSummary(await summaryRes.json());
      const logsRes = await fetch("/api/audit-logs?limit=150");
      if (logsRes.ok) { const d = await logsRes.json(); setAuditLogs(d.logs); }
    } catch (e) {
      setErrorMsg("Error loading dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (selectedDate) fetchData(); }, [selectedDate]);

  useEffect(() => {
    const fetchReviewSheet = async () => {
      if (selectedBranchId === "all" || !selectedDate) { setReviewGridData([]); return; }
      try {
        const res = await fetch(`/api/reports?branchId=${selectedBranchId}&date=${selectedDate}`);
        if (res.ok) {
          const d = await res.json();
          setReviewGridData(d.report.entries);
          setReviewReportStatus(d.report.status);
        }
      } catch { /* non-critical */ }
    };
    fetchReviewSheet();
  }, [selectedBranchId, selectedDate]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch { router.push("/login"); }
  };

  // Admin users helpers
  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await fetch("/api/admin-users");
      if (!res.ok) throw new Error("Failed to load admins");
      const d = await res.json();
      setAdminUsers(d.users);
    } catch {
      setAdminError("Could not load admin users.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admins") fetchAdminUsers();
  }, [activeTab]);

  const openCreateModal = () => {
    setEditingAdmin(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setForm({ id: admin.id, username: admin.username, name: admin.name, password: "", branchId: admin.branchId ?? "" });
    setFormError(null);
    setShowPassword(false);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(null); };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.username.trim() || !form.name.trim() || !form.branchId) {
      setFormError("Username, name, and branch are required.");
      return;
    }
    if (!editingAdmin && !form.password) {
      setFormError("Password is required for new admin.");
      return;
    }
    setFormLoading(true);
    try {
      const method = editingAdmin ? "PUT" : "POST";
      const body = editingAdmin
        ? { id: editingAdmin.id, username: form.username, name: form.name, branchId: form.branchId, ...(form.password ? { password: form.password } : {}) }
        : { username: form.username, name: form.name, password: form.password, branchId: form.branchId };
      const res = await fetch("/api/admin-users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Something went wrong"); return; }
      closeModal();
      fetchAdminUsers();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    try {
      const res = await fetch("/api/admin-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: admin.id }) });
      if (!res.ok) { const d = await res.json(); setAdminError(d.error ?? "Delete failed"); return; }
      setDeleteConfirm(null);
      fetchAdminUsers();
    } catch {
      setAdminError("Network error.");
    }
  };

  // Backup & cleanup helpers
  const fetchBackupDays = async () => {
    setBackupLoading(true);
    setBackupError(null);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setBackupDays(d.days);
    } catch {
      setBackupError("Could not load backup history.");
    } finally {
      setBackupLoading(false);
    }
  };

  const fetchCleanupPreview = async () => {
    try {
      const res = await fetch("/api/cleanup");
      if (res.ok) { const d = await res.json(); setCleanupPreview(d.wouldDelete); }
    } catch {}
  };

  useEffect(() => {
    if (activeTab === "backup") { fetchBackupDays(); fetchCleanupPreview(); }
  }, [activeTab]);

  const handleDownloadBackup = async (dateStr: string) => {
    setDownloadingDate(dateStr);
    try {
      const a = document.createElement("a");
      a.href = `/api/backup/download?date=${dateStr}`;
      a.download = `vishala_backup_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloadingDate(null), 2000);
    }
  };

  const handleRunCleanup = async () => {
    if (!cleanupPreview || (cleanupPreview.reports === 0 && cleanupPreview.auditLogs === 0)) return;
    setCleanupRunning(true);
    try {
      const res = await fetch("/api/cleanup", { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setCleanupResult(d.deleted);
        setCleanupPreview({ reports: 0, auditLogs: 0 });
        fetchBackupDays();
      }
    } catch {
      setBackupError("Cleanup failed.");
    } finally {
      setCleanupRunning(false);
    }
  };

  const renderLogDetails = (detailsStr: string) => {
    try {
      const d = JSON.parse(detailsStr);
      if (d.message) return d.message;
      if (d.changes) {
        return `${d.counterName}: Changed ${Object.keys(d.changes).map(k => `${k} (₹${d.changes[k][0]} → ₹${d.changes[k][1]})`).join(", ")}`;
      }
      if (d.values) return `${d.counterName}: Saved initial entries`;
      return detailsStr;
    } catch { return detailsStr; }
  };

  const getBranchLabel = (branchId: string) => branches.find(b => b.id === branchId)?.name ?? "System";


  return (
    <div className="flex min-h-screen bg-[#FDF6EE] text-[#1A0A0A]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#8B1A1A] flex flex-col justify-between shrink-0 shadow-xl">
        <div className="space-y-6 p-5">
          {/* Brand */}
          <div className="flex items-center gap-3 pb-5 border-b border-[#C9A227]/30">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded-lg shrink-0" />
            <div>
              <h1 className="font-extrabold text-sm tracking-wide text-[#C9A227]">VISHALA MALL</h1>
              <p className="text-[10px] text-white/60 font-semibold tracking-widest uppercase">Super Admin Portal</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="space-y-1">
            {[
              { id: "overview", label: "Overview", icon: Building },
              { id: "logs", label: "System Audit Logs", icon: Activity },
              { id: "admins", label: "Admin Credentials", icon: ShieldCheck },
              { id: "backup", label: "History & Backup", icon: ArchiveRestore },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider rounded-lg text-left transition-all cursor-pointer ${
                  activeTab === id
                    ? "text-[#8B1A1A] bg-[#C9A227] shadow-md shadow-[#C9A227]/20"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* User + sign out */}
        <div className="p-5 border-t border-[#C9A227]/20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#C9A227]/20 border border-[#C9A227]/40 flex items-center justify-center text-[#C9A227]">
              <User size={16} />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">{session.name}</p>
              <p className="text-[10px] text-[#C9A227]/70 font-semibold tracking-wider uppercase">Super Admin</p>
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

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="px-8 py-4 bg-white border-b border-[#E8D5B0] flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-sm">
          <div>
            <h2 className="text-lg font-extrabold text-[#8B1A1A]">Super Admin Monitoring</h2>
            <p className="text-xs text-[#9A7E6A] mt-0.5">Real-time branch closing audits, submission tracking, and cash differences.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A7E6A]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-8 pr-3 py-2 bg-[#FDF6EE] border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#FDF6EE] hover:bg-[#F0E4CC] border border-[#E8D5B0] text-[#5C4A3A] transition-all cursor-pointer"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8 space-y-8">
          {errorMsg && (
            <div className="flex items-center gap-2.5 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === "overview" && (
            <>
              {/* Branch Submissions Tracker */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#8B1A1A] flex items-center gap-2">
                  <Building size={15} className="text-[#C9A227]" />
                  <h3 className="text-sm font-bold text-white">Branch Submissions Tracker</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#E8D5B0] bg-[#FDF6EE] text-[#9A7E6A] text-xs font-bold uppercase tracking-wider">
                        <th className="py-3 px-5">Branch</th>
                        <th className="py-3 px-5">Counters</th>
                        <th className="py-3 px-5">Submission Status</th>
                        <th className="py-3 px-5">Submitted By</th>
                        <th className="py-3 px-5">Net Collection</th>
                        <th className="py-3 px-5">Discrepancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8D5B0]">
                      {summary?.branchSummaries.map((branch) => (
                        <tr key={branch.branchId} className="hover:bg-[#FDF6EE] transition-colors">
                          <td className="py-4 px-5 font-bold text-[#8B1A1A]">{branch.branchName}</td>
                          <td className="py-4 px-5 text-[#5C4A3A] text-xs">
                            {branch.filledCounters} / {branch.totalCounters} filled
                          </td>
                          <td className="py-4 px-5">
                            {branch.status === "SUBMITTED" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#1B8A7A]/10 text-[#1B8A7A] border border-[#1B8A7A]/30">
                                <CheckCircle size={11} /> Submitted
                              </span>
                            ) : branch.status === "DRAFT" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={11} /> In Draft
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FDF6EE] text-[#9A7E6A] border border-[#E8D5B0]">
                                Not Started
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-[#5C4A3A] text-xs">
                            {branch.submittedBy || "—"}
                            {branch.submittedAt && (
                              <span className="block text-[#9A7E6A] text-[10px]">
                                {new Date(branch.submittedAt).toLocaleTimeString("en-IN")}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5 font-bold text-[#1A0A0A] text-xs">
                            {formatCurrency(branch.totals.systemTotal)}
                          </td>
                          <td className={`py-4 px-5 font-extrabold text-xs ${
                            branch.totals.difference !== 0 ? "text-red-600" : "text-[#1B8A7A]"
                          }`}>
                            {formatCurrency(branch.totals.difference)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Branch Sheet Review */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#8B1A1A] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <ListFilter size={15} className="text-[#C9A227]" />
                    <h3 className="text-sm font-bold text-white">Individual Branch Sheet Review</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-[#C9A227]"
                    >
                      <option value="all" className="text-[#1A0A0A]">Select Branch...</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id} className="text-[#1A0A0A]">{b.name}</option>
                      ))}
                    </select>
                    {selectedBranchId !== "all" && (
                      <a
                        href={`/api/reports/export?branchId=${selectedBranchId}&date=${selectedDate}`}
                        download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A227] hover:bg-[#A07A15] text-xs font-bold text-white transition-all cursor-pointer"
                      >
                        <Download size={12} />
                        <span>Export Excel</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  {selectedBranchId === "all" ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[#9A7E6A] border-2 border-dashed border-[#E8D5B0] rounded-xl">
                      <Search size={28} className="text-[#C9A227]/50 mb-3" />
                      <p className="text-sm font-bold text-[#5C4A3A]">Select a branch above to inspect its sheet</p>
                      <p className="text-xs text-[#9A7E6A] mt-1">View individual counter grid entries and export to Excel.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-[#9A7E6A] font-semibold">
                        <span>Status: {reviewReportStatus === "SUBMITTED" ? "Submitted (Locked)" : "Draft (Open)"}</span>
                        <span>Date: {selectedDate}</span>
                      </div>
                      <ExcelGrid
                        data={reviewGridData}
                        onChange={() => {}}
                        isReadOnly={true}
                        saveStatus="saved"
                        branchName={branches.find((b: any) => b.id === selectedBranchId)?.name}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "logs" && (
            <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-[#8B1A1A]">
                <h3 className="text-sm font-bold text-white">System Security Audit Logs</h3>
                <p className="text-xs text-white/60 mt-0.5">Chronological audit trails for data entries, modifications, logons, and lock triggers.</p>
              </div>
              <div className="overflow-x-auto max-h-[560px]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-[#FDF6EE] z-10 border-b border-[#E8D5B0]">
                    <tr className="text-[#9A7E6A] text-xs font-bold uppercase tracking-wider">
                      <th className="py-3 px-5">Operator</th>
                      <th className="py-3 px-5">Role</th>
                      <th className="py-3 px-5">Action</th>
                      <th className="py-3 px-5">Log Message Details</th>
                      <th className="py-3 px-5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8D5B0]">
                    {auditLogs.map((log) => {
                      const isSubmit = log.action === "SUBMIT" || log.action === "REPORT_SUBMIT";
                      const isLogin = log.action === "LOGIN";
                      let badge = "bg-[#FDF6EE] text-[#9A7E6A] border-[#E8D5B0]";
                      if (isSubmit) badge = "bg-[#1B8A7A]/10 text-[#1B8A7A] border-[#1B8A7A]/30";
                      else if (isLogin) badge = "bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/20";
                      else if (log.action === "DRAFT_SAVE") badge = "bg-amber-50 text-amber-700 border-amber-200";

                      return (
                        <tr key={log.id} className="hover:bg-[#FDF6EE] transition-colors">
                          <td className="py-3.5 px-5">
                            <span className="font-bold text-[#1A0A0A] text-xs">{log.user.name}</span>
                            <span className="block text-[10px] text-[#9A7E6A]">@{log.user.username}</span>
                          </td>
                          <td className="py-3.5 px-5 text-xs font-semibold text-[#5C4A3A]">{log.user.role}</td>
                          <td className="py-3.5 px-5">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${badge}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-xs text-[#5C4A3A] font-medium max-w-sm truncate lg:max-w-md">
                            {renderLogDetails(log.details)}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-[#9A7E6A]">
                            {new Date(log.timestamp).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "admins" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[#8B1A1A]">Admin Login Credentials</h3>
                  <p className="text-xs text-[#9A7E6A] mt-0.5">Create and manage branch admin accounts.</p>
                </div>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#8B1A1A] hover:bg-[#6B1010] text-xs font-bold text-white transition-all cursor-pointer shadow"
                >
                  <Plus size={14} />
                  New Admin
                </button>
              </div>

              {adminError && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertTriangle size={14} className="shrink-0" />
                  {adminError}
                </div>
              )}

              {/* Table */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#8B1A1A] flex items-center gap-2">
                  <ShieldCheck size={15} className="text-[#C9A227]" />
                  <h4 className="text-sm font-bold text-white">Branch Admin Accounts</h4>
                </div>
                {adminLoading ? (
                  <div className="flex items-center justify-center py-16 text-[#9A7E6A] text-sm gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading...
                  </div>
                ) : adminUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#9A7E6A] border-2 border-dashed border-[#E8D5B0] m-6 rounded-xl">
                    <ShieldCheck size={28} className="text-[#C9A227]/50 mb-3" />
                    <p className="text-sm font-bold text-[#5C4A3A]">No admin accounts yet</p>
                    <p className="text-xs mt-1">Click "New Admin" to create one.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#E8D5B0] bg-[#FDF6EE] text-[#9A7E6A] text-xs font-bold uppercase tracking-wider">
                          <th className="py-3 px-5">Name</th>
                          <th className="py-3 px-5">Username</th>
                          <th className="py-3 px-5">Assigned Branch</th>
                          <th className="py-3 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8D5B0]">
                        {adminUsers.map((admin) => (
                          <tr key={admin.id} className="hover:bg-[#FDF6EE] transition-colors">
                            <td className="py-4 px-5 font-bold text-[#1A0A0A]">{admin.name}</td>
                            <td className="py-4 px-5 text-xs font-mono text-[#5C4A3A]">@{admin.username}</td>
                            <td className="py-4 px-5">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-[#8B1A1A]/10 text-[#8B1A1A] border border-[#8B1A1A]/20">
                                {admin.branchName ?? "—"}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditModal(admin)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A227]/10 hover:bg-[#C9A227]/20 text-xs font-bold text-[#8B6014] border border-[#C9A227]/30 transition-all cursor-pointer"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(admin)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-xs font-bold text-red-700 border border-red-200 transition-all cursor-pointer"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[#8B1A1A]">History & Backup</h3>
                  <p className="text-xs text-[#9A7E6A] mt-0.5">
                    Last 30 days of report data. Download full backups or clean up expired data.
                  </p>
                </div>
              </div>

              {backupError && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertTriangle size={14} className="shrink-0" /> {backupError}
                </div>
              )}

              {/* Cleanup panel */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#7F1D1D] flex items-center gap-2">
                  <Trash size={15} className="text-red-300" />
                  <h4 className="text-sm font-bold text-white">30-Day Auto Cleanup</h4>
                </div>
                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-[#5C4A3A] font-semibold">
                      Data older than 30 days is eligible for deletion.
                    </p>
                    {cleanupPreview && (
                      <p className="text-xs text-[#9A7E6A]">
                        Pending deletion: <span className="font-bold text-[#8B1A1A]">{cleanupPreview.reports} report(s)</span> &amp; <span className="font-bold text-[#8B1A1A]">{cleanupPreview.auditLogs} audit log(s)</span>
                      </p>
                    )}
                    {cleanupResult && (
                      <p className="text-xs text-[#1B8A7A] font-bold">
                        ✓ Cleanup complete — deleted {cleanupResult.reports} report(s) and {cleanupResult.auditLogs} audit log(s).
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleRunCleanup}
                    disabled={cleanupRunning || !cleanupPreview || (cleanupPreview.reports === 0 && cleanupPreview.auditLogs === 0)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#7F1D1D] hover:bg-[#991B1B] text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cleanupRunning ? <RefreshCw size={13} className="animate-spin" /> : <Trash size={13} />}
                    {cleanupRunning ? "Running..." : cleanupPreview?.reports === 0 && cleanupPreview?.auditLogs === 0 ? "Nothing to Clean" : "Run Cleanup Now"}
                  </button>
                </div>
              </div>

              {/* 30-day history list */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#8B1A1A] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArchiveRestore size={15} className="text-[#C9A227]" />
                    <h4 className="text-sm font-bold text-white">30-Day Report Archive</h4>
                  </div>
                  <button onClick={fetchBackupDays} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white cursor-pointer">
                    <RefreshCw size={13} className={backupLoading ? "animate-spin" : ""} />
                  </button>
                </div>

                {backupLoading ? (
                  <div className="flex items-center justify-center py-16 text-[#9A7E6A] text-sm gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading history...
                  </div>
                ) : backupDays.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 m-6 rounded-xl border-2 border-dashed border-[#E8D5B0] text-[#9A7E6A]">
                    <ArchiveRestore size={28} className="text-[#C9A227]/50 mb-3" />
                    <p className="text-sm font-bold text-[#5C4A3A]">No report data in the last 30 days</p>
                    <p className="text-xs mt-1">Reports will appear here as branches submit their daily closing sheets.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E8D5B0]">
                    {backupDays.map((day) => (
                      <div key={day.businessDate} className="px-6 py-4 hover:bg-[#FDF6EE] transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-lg bg-[#8B1A1A]/10 border border-[#8B1A1A]/20 flex items-center justify-center shrink-0">
                              <Calendar size={16} className="text-[#8B1A1A]" />
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-[#1A0A0A]">{day.businessDate}</p>
                              <p className="text-xs text-[#9A7E6A] mt-0.5">
                                {day.submittedBranches} / {day.totalBranches} branches submitted
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {day.branches.map((b) => (
                                  <span
                                    key={b.branchId}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      b.status === "SUBMITTED"
                                        ? "bg-[#1B8A7A]/10 text-[#1B8A7A] border-[#1B8A7A]/30"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                    }`}
                                  >
                                    {b.status === "SUBMITTED" ? <CheckCircle size={9} /> : <Clock size={9} />}
                                    {b.branchName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadBackup(day.businessDate)}
                            disabled={downloadingDate === day.businessDate}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A227] hover:bg-[#A07A15] text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-60 shrink-0"
                          >
                            {downloadingDate === day.businessDate
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <Download size={12} />}
                            {downloadingDate === day.businessDate ? "Preparing..." : "Download Backup"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E8D5B0]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8D5B0]">
              <h3 className="text-base font-extrabold text-[#8B1A1A]">
                {editingAdmin ? "Edit Admin Credentials" : "Create New Admin"}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[#FDF6EE] text-[#9A7E6A] cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertTriangle size={13} className="shrink-0" /> {formError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-[#5C4A3A] mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-sm text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-[#5C4A3A] mb-1.5">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="e.g. ramesh_admin"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-sm text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-[#5C4A3A] mb-1.5">
                  Password {editingAdmin && <span className="font-normal text-[#9A7E6A]">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={editingAdmin ? "New password (optional)" : "Enter password"}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-sm text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A7E6A] hover:text-[#5C4A3A] cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-bold text-[#5C4A3A] mb-1.5">Assigned Branch</label>
                <select
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-sm text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-xs font-bold text-[#5C4A3A] hover:bg-[#F0E4CC] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2.5 rounded-lg bg-[#8B1A1A] hover:bg-[#6B1010] text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-60"
                >
                  {formLoading ? "Saving..." : editingAdmin ? "Save Changes" : "Create Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-[#E8D5B0] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1A0A0A]">Delete Admin Account</h3>
                <p className="text-xs text-[#9A7E6A] mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-[#5C4A3A]">
              Are you sure you want to delete <span className="font-bold text-[#8B1A1A]">{deleteConfirm.name}</span> (@{deleteConfirm.username})?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#E8D5B0] bg-[#FDF6EE] text-xs font-bold text-[#5C4A3A] hover:bg-[#F0E4CC] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
