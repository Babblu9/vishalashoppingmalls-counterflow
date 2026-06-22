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
  LayoutGrid,
  TrendingUp,
  Receipt,
  Wallet,
  CalendarRange,
  AlertCircle,
  LogIn,
  Send,
  UserPlus,
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

interface RangeBranchRow {
  branchId: string;
  branchName: string;
  cash: Record<string, number>;
  gpay: Record<string, number>;
  card: Record<string, number>;
  counterFlow: Record<string, number>;
  due: Record<string, number>;
  manuallyCollected: Record<string, number>;
  ctSum: Record<string, number>;
  present: Record<string, boolean>;
}

// One branch×day verification record (mirrors /api/verifications response)
interface VerifyInfo {
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

interface RangeData {
  from: string;
  to: string;
  dates: string[];
  branches: RangeBranchRow[];
  capped: boolean;
  maxDays: number;
}

interface BillRow {
  branchId: string;
  branchName: string;
  businessDate: string;
  counterId: string;
  counterName: string;
  billNo: string;
  name: string;
  mobile: string;
  amount: number;
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
  const [activeTab, setActiveTab] = useState<"overview" | "liveview" | "due" | "collected" | "logs" | "admins" | "backup">("liveview");
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

  // Date-range matrix state (Due / Manually Collected tabs)
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeData, setRangeData] = useState<RangeData | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  // Bill-level detail rows for the Due / Manually Collected range tabs
  const [dueBillDetails, setDueBillDetails] = useState<BillRow[]>([]);
  const [manualBillDetails, setManualBillDetails] = useState<BillRow[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);

  // C.T Sum day-wise verification matrix state (Overview tab) — persisted to DB
  const [ctFrom, setCtFrom] = useState("");
  const [ctTo, setCtTo] = useState("");
  const [ctData, setCtData] = useState<RangeData | null>(null);
  const [ctLoading, setCtLoading] = useState(false);
  // branchId -> businessDate -> verification record
  const [ctVerifyMap, setCtVerifyMap] = useState<Record<string, Record<string, VerifyInfo>>>({});
  // "branchId|date" keys currently being saved (to disable + spin)
  const [ctSaving, setCtSaving] = useState<Record<string, boolean>>({});
  // The branch×day cell whose breakdown panel is expanded (null = none)
  const [ctExpanded, setCtExpanded] = useState<{ branchId: string; date: string } | null>(null);

  useEffect(() => { setSelectedDate(getBusinessDate(new Date())); }, []);

  // Default the range tabs to the last 7 days (inclusive of today's business date)
  useEffect(() => {
    const today = getBusinessDate(new Date());
    const [y, m, d] = today.split("-").map(Number);
    const sevenAgo = new Date(Date.UTC(y, m - 1, d - 6));
    const fy = sevenAgo.getUTCFullYear();
    const fm = String(sevenAgo.getUTCMonth() + 1).padStart(2, "0");
    const fd = String(sevenAgo.getUTCDate()).padStart(2, "0");
    setRangeFrom(`${fy}-${fm}-${fd}`);
    setRangeTo(today);
    // C.T Sum verification matrix shares the same default window
    setCtFrom(`${fy}-${fm}-${fd}`);
    setCtTo(today);
  }, []);

  const fetchRangeData = async () => {
    if (!rangeFrom || !rangeTo) return;
    setRangeLoading(true);
    try {
      const res = await fetch(`/api/reports/range?from=${rangeFrom}&to=${rangeTo}`);
      if (res.ok) setRangeData(await res.json());
    } catch { /* non-critical */ } finally {
      setRangeLoading(false);
    }
  };

  // Fetch the bill-level detail rows (one per individual bill) for the active
  // range tab. Both due & manual are requested together so switching tabs is
  // instant and the totals stay consistent with the matrix above.
  const fetchBillDetails = async () => {
    if (!rangeFrom || !rangeTo) return;
    setBillsLoading(true);
    try {
      const [dueRes, manualRes] = await Promise.all([
        fetch(`/api/reports/bills?from=${rangeFrom}&to=${rangeTo}&type=due`),
        fetch(`/api/reports/bills?from=${rangeFrom}&to=${rangeTo}&type=manual`),
      ]);
      if (dueRes.ok) {
        const d = await dueRes.json();
        setDueBillDetails(d.bills || []);
      }
      if (manualRes.ok) {
        const m = await manualRes.json();
        setManualBillDetails(m.bills || []);
      }
    } catch { /* non-critical */ } finally {
      setBillsLoading(false);
    }
  };

  useEffect(() => {
    if ((activeTab === "due" || activeTab === "collected") && rangeFrom && rangeTo) {
      fetchRangeData();
      fetchBillDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rangeFrom, rangeTo]);

  // Fetch the C.T Sum matrix + saved verification flags for the Overview tab
  const fetchCtMatrix = async () => {
    if (!ctFrom || !ctTo) return;
    setCtLoading(true);
    try {
      const [rangeRes, verRes] = await Promise.all([
        fetch(`/api/reports/range?from=${ctFrom}&to=${ctTo}`),
        fetch(`/api/verifications?from=${ctFrom}&to=${ctTo}`),
      ]);
      if (rangeRes.ok) setCtData(await rangeRes.json());
      if (verRes.ok) {
        const v = await verRes.json();
        const map: Record<string, Record<string, VerifyInfo>> = {};
        const src = (v.verifications || {}) as Record<string, Record<string, { verified: boolean; verifiedAt: string | null; verifiedBy: string | null }>>;
        for (const branchId of Object.keys(src)) {
          map[branchId] = {};
          for (const date of Object.keys(src[branchId])) {
            const r = src[branchId][date];
            map[branchId][date] = { verified: !!r.verified, verifiedBy: r.verifiedBy ?? null, verifiedAt: r.verifiedAt ?? null };
          }
        }
        setCtVerifyMap(map);
      }
    } catch { /* non-critical */ } finally {
      setCtLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "overview" && ctFrom && ctTo) fetchCtMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ctFrom, ctTo]);

  // Toggle a branch×day C.T Sum verification flag (optimistic, persisted to DB)
  const toggleDayVerify = async (branchId: string, date: string) => {
    const key = `${branchId}|${date}`;
    if (ctSaving[key]) return;
    const prev = ctVerifyMap[branchId]?.[date] ?? null;
    const next = !(prev?.verified);
    setCtSaving((s) => ({ ...s, [key]: true }));
    // Optimistic update
    const optimistic: VerifyInfo = {
      verified: next,
      verifiedBy: next ? (session.name || null) : null,
      verifiedAt: next ? new Date().toISOString() : null,
    };
    setCtVerifyMap((m) => ({ ...m, [branchId]: { ...(m[branchId] || {}), [date]: optimistic } }));
    try {
      const res = await fetch("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, businessDate: date, verified: next }),
      });
      if (res.ok) {
        const data = await res.json();
        setCtVerifyMap((m) => ({
          ...m,
          [branchId]: { ...(m[branchId] || {}), [date]: { verified: !!data.verified, verifiedBy: data.verifiedBy ?? null, verifiedAt: data.verifiedAt ?? null } },
        }));
      } else {
        // Revert on failure
        setCtVerifyMap((m) => ({ ...m, [branchId]: { ...(m[branchId] || {}), [date]: prev ?? { verified: false, verifiedBy: null, verifiedAt: null } } }));
      }
    } catch {
      setCtVerifyMap((m) => ({ ...m, [branchId]: { ...(m[branchId] || {}), [date]: prev ?? { verified: false, verifiedBy: null, verifiedAt: null } } }));
    } finally {
      setCtSaving((s) => { const n = { ...s }; delete n[key]; return n; });
    }
  };


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

  // Human-readable, single-line description for an audit log's JSON details
  const renderLogDetails = (action: string, detailsStr: string) => {
    let d: Record<string, any> = {};
    try { d = JSON.parse(detailsStr); } catch { return detailsStr || "—"; }

    switch (action) {
      case "LOGIN":
        return `Signed in${d.branchName ? ` · ${d.branchName}` : ""}`;
      case "LOGOUT":
        return "Signed out of the portal";
      case "REPORT_SUBMIT":
        return `Submitted the daily report${d.businessDate ? ` for ${shortDay(d.businessDate)}` : ""}`;
      case "ADMIN_CREATE":
        return `Created admin @${d.createdUsername}${d.branchName ? ` · ${d.branchName}` : ""}`;
      case "ADMIN_EDIT": {
        const fields = Array.isArray(d.changedFields) ? [...d.changedFields] : [];
        if (d.passwordChanged) fields.push("password");
        return `Edited admin @${d.targetUsername}${fields.length ? ` · ${fields.join(", ")}` : ""}`;
      }
      case "ADMIN_DELETE":
        return `Deleted admin @${d.deletedUsername}`;
      case "DATA_CLEANUP":
        return `Cleared data before ${d.cutoffDate} · ${d.deletedReports} report(s), ${d.deletedAuditLogs} log(s)`;
      default:
        // SUBMIT / DRAFT_SAVE and other report-entry level logs
        if (d.changes) {
          return `${d.counterName}: ${Object.keys(d.changes).map((k) => `${k} ₹${d.changes[k][0]} → ₹${d.changes[k][1]}`).join(", ")}`;
        }
        if (d.values) return `${d.counterName}: Saved initial entries`;
        if (d.message) return d.counterName ? `${d.counterName}: ${d.message}` : d.message;
        return detailsStr || "—";
    }
  };

  // Visual metadata (icon + colors + label) for each audit action
  const getActionMeta = (action: string): {
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    dot: string;
    badge: string;
  } => {
    switch (action) {
      case "LOGIN":         return { label: "Login",         Icon: LogIn,    dot: "bg-[#1B8A7A]", badge: "bg-[#1B8A7A]/10 text-[#1B8A7A] border-[#1B8A7A]/30" };
      case "LOGOUT":        return { label: "Logout",        Icon: LogOut,   dot: "bg-[#9A7E6A]", badge: "bg-[#FDF6EE] text-[#9A7E6A] border-[#E8D5B0]" };
      case "SUBMIT":
      case "REPORT_SUBMIT": return { label: "Submit",        Icon: Send,     dot: "bg-[#8B1A1A]", badge: "bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/20" };
      case "DRAFT_SAVE":    return { label: "Draft Save",    Icon: Pencil,   dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" };
      case "ADMIN_CREATE":  return { label: "Admin Created", Icon: UserPlus, dot: "bg-[#1B8A7A]", badge: "bg-[#1B8A7A]/10 text-[#1B8A7A] border-[#1B8A7A]/30" };
      case "ADMIN_EDIT":    return { label: "Admin Edited",  Icon: Pencil,   dot: "bg-[#C9A227]", badge: "bg-[#C9A227]/15 text-[#8B6014] border-[#C9A227]/40" };
      case "ADMIN_DELETE":  return { label: "Admin Deleted", Icon: Trash2,   dot: "bg-red-500",   badge: "bg-red-50 text-red-700 border-red-200" };
      case "DATA_CLEANUP":  return { label: "Data Cleanup",  Icon: Database, dot: "bg-red-500",   badge: "bg-red-50 text-red-700 border-red-200" };
      default:              return { label: action,          Icon: Activity, dot: "bg-[#9A7E6A]", badge: "bg-[#FDF6EE] text-[#9A7E6A] border-[#E8D5B0]" };
    }
  };

  // Role chip label + colors
  const roleMeta = (role: string) =>
    role === "SUPER_ADMIN"
      ? { label: "Super Admin", cls: "bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/20" }
      : { label: "Branch Admin", cls: "bg-[#C9A227]/15 text-[#8B6014] border-[#C9A227]/40" };

  // Day grouping helpers (logs arrive sorted newest-first)
  const dayKey = (ts: string) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const dayHeading = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const full = d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
    if (sameDay(d, today)) return `Today · ${full}`;
    if (sameDay(d, yest)) return `Yesterday · ${full}`;
    return full;
  };


  const getBranchLabel = (branchId: string) => branches.find(b => b.id === branchId)?.name ?? "System";

  // Short day label e.g. "17 Jun" from a YYYY-MM-DD string
  const shortDay = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", timeZone: "UTC",
    });
  };

  // Renders a branches × days matrix for a single metric ("due" | "manuallyCollected")
  const renderRangeMatrix = (
    metric: "due" | "manuallyCollected",
    opts: { title: string; icon: React.ReactNode; accent: string; cellColor: string }
  ) => {
    const dates = rangeData?.dates ?? [];
    const rows = rangeData?.branches ?? [];
    // Per-day column totals across branches
    const colTotals: Record<string, number> = {};
    dates.forEach((d) => { colTotals[d] = rows.reduce((s, b) => s + (b[metric][d] || 0), 0); });
    const grand = dates.reduce((s, d) => s + colTotals[d], 0);

    // Bill-level detail rows for the breakdown table beneath the matrix
    const billRows: BillRow[] = metric === "due" ? dueBillDetails : manualBillDetails;
    const billTotal = billRows.reduce((s, r) => s + (r.amount || 0), 0);
    const detailTitle = metric === "due" ? "Due Bill Details" : "Manually Collected Bill Details";
    const detailEmpty = metric === "due" ? "No due bills recorded in this range." : "No manually collected bills recorded in this range.";

    return (
      <div className="space-y-6">
        {/* Controls */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <CalendarRange size={18} className="text-[#C9A227]" />
            <h3 className="text-sm font-extrabold text-[#8B1A1A]">{opts.title} — Day-wise by Branch</h3>
          </div>
          <div className="flex items-end gap-3 ml-auto flex-wrap">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#9A7E6A]">
              From
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#9A7E6A]">
              To
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
              />
            </label>
            <button
              onClick={fetchRangeData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C9A227] hover:bg-[#A07A15] text-xs font-bold text-white transition-all cursor-pointer"
            >
              <RefreshCw size={12} className={rangeLoading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {rangeData?.capped && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700">
            <AlertTriangle size={13} />
            <span>Range limited to {rangeData.maxDays} days. Narrow the dates to see a shorter span.</span>
          </div>
        )}

        {/* Matrix */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
          <div className={`px-6 py-4 flex items-center gap-2 ${opts.accent}`}>
            {opts.icon}
            <h3 className="text-sm font-bold text-white">{opts.title}</h3>
            <span className="text-[10px] text-white/60 font-semibold ml-auto">
              {dates.length} day{dates.length === 1 ? "" : "s"} · {rangeData?.from} → {rangeData?.to}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#6B1212] text-[#C9A227] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 text-left sticky left-0 bg-[#6B1212] z-10 border-r border-[#C9A227]/20 min-w-[140px]">Branch</th>
                  {dates.map((d) => (
                    <th key={d} className="py-3 px-3 text-right border-r border-[#C9A227]/20 whitespace-nowrap">{shortDay(d)}</th>
                  ))}
                  <th className="py-3 px-3 text-right bg-[#5A0F0F] whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D5B0]">
                {rangeLoading ? (
                  <tr><td colSpan={dates.length + 2} className="py-10 text-center text-[#9A7E6A] text-sm">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={dates.length + 2} className="py-10 text-center text-[#9A7E6A] text-sm">No data for this range.</td></tr>
                ) : (
                  rows.map((b) => {
                    const rowTotal = dates.reduce((s, d) => s + (b[metric][d] || 0), 0);
                    return (
                      <tr key={b.branchId} className="hover:bg-[#FDF6EE] transition-colors">
                        <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-[#E8D5B0] font-bold text-[#8B1A1A]">{b.branchName}</td>
                        {dates.map((d) => {
                          const v = b[metric][d] || 0;
                          return (
                            <td key={d} className={`py-3 px-3 text-right border-r border-[#E8D5B0] ${v > 0 ? opts.cellColor + " font-semibold" : "text-[#C9B8A8]"}`}>
                              {v > 0 ? formatCurrency(v) : "—"}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-right font-extrabold text-[#8B1A1A] bg-[#FDF6EE]">{formatCurrency(rowTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-[#8B1A1A] font-extrabold text-white border-t-2 border-[#C9A227]/40">
                    <td className="py-3 px-4 sticky left-0 bg-[#8B1A1A] z-10 border-r border-[#C9A227]/20 text-[#C9A227] uppercase tracking-wider">Total</td>
                    {dates.map((d) => (
                      <td key={d} className="py-3 px-3 text-right border-r border-[#C9A227]/20">{colTotals[d] > 0 ? formatCurrency(colTotals[d]) : "—"}</td>
                    ))}
                    <td className="py-3 px-3 text-right text-[#C9A227]">{formatCurrency(grand)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Bill-level detail breakdown — one row per individual bill in the range */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
          <div className={`px-6 py-4 flex flex-wrap items-center justify-between gap-3 ${opts.accent}`}>
            <div className="flex items-center gap-2">
              {opts.icon}
              <h3 className="text-sm font-bold text-white">{detailTitle}</h3>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-white/85">
              <span className="px-2 py-0.5 rounded-full bg-white/15 border border-white/20 whitespace-nowrap">
                {billRows.length} bill{billRows.length === 1 ? "" : "s"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/15 border border-white/20 whitespace-nowrap">
                Total {formatCurrency(billTotal)}
              </span>
              <span className="text-white/60 whitespace-nowrap hidden sm:inline">
                {rangeData?.from} → {rangeData?.to}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
            <table className="w-full border-collapse text-xs min-w-[820px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#6B1212] text-[#C9A227] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Branch</th>
                  <th className="py-3 px-3 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Counter</th>
                  <th className="py-3 px-3 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Bill No</th>
                  <th className="py-3 px-3 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Customer</th>
                  <th className="py-3 px-3 text-left border-r border-[#C9A227]/20 whitespace-nowrap">Mobile</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D5B0]">
                {billsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#9A7E6A] text-sm">
                      <RefreshCw size={15} className="animate-spin inline text-[#C9A227]" /> Loading bill details…
                    </td>
                  </tr>
                ) : billRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#9A7E6A] text-sm">
                      {detailEmpty}
                    </td>
                  </tr>
                ) : (
                  billRows.map((b, i) => (
                    <tr key={`${b.branchId}-${b.counterId}-${b.businessDate}-${i}`} className="hover:bg-[#FDF6EE] transition-colors">
                      <td className="py-2.5 px-4 border-r border-[#E8D5B0] whitespace-nowrap font-semibold text-[#5C4A3A]">{shortDay(b.businessDate)}</td>
                      <td className="py-2.5 px-4 border-r border-[#E8D5B0] font-bold text-[#8B1A1A] whitespace-nowrap">{b.branchName}</td>
                      <td className="py-2.5 px-3 border-r border-[#E8D5B0] text-[#1A0A0A] whitespace-nowrap">{b.counterName}</td>
                      <td className="py-2.5 px-3 border-r border-[#E8D5B0] text-[#5C4A3A] whitespace-nowrap font-mono">{b.billNo || "—"}</td>
                      <td className="py-2.5 px-3 border-r border-[#E8D5B0] text-[#1A0A0A] whitespace-nowrap">{b.name || "—"}</td>
                      <td className="py-2.5 px-3 border-r border-[#E8D5B0] text-[#5C4A3A] whitespace-nowrap">{b.mobile || "—"}</td>
                      <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${metric === "due" ? "text-[#1B8A7A]" : "text-[#5C4A3A]"}`}>{formatCurrency(b.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {billRows.length > 0 && (
                <tfoot className="sticky bottom-0">
                  <tr className="bg-[#8B1A1A] font-extrabold text-white border-t-2 border-[#C9A227]/40">
                    <td colSpan={6} className="py-3 px-4 text-[#C9A227] uppercase tracking-wider">Total</td>
                    <td className="py-3 px-3 text-right text-[#C9A227] whitespace-nowrap">{formatCurrency(billTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

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
              { id: "liveview", label: "Live Branch View", icon: LayoutGrid },
              { id: "overview", label: "Overview", icon: Building },
              { id: "due", label: "Due", icon: Receipt },
              { id: "collected", label: "Manually Collected", icon: Wallet },
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
              {/* Branch Financial Overview Table */}
              <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-[#8B1A1A] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Building size={15} className="text-[#C9A227]" />
                    <h3 className="text-sm font-bold text-white">Branch Overview — {selectedDate}</h3>
                  </div>
                  <span className="text-[10px] text-white/50 font-semibold">
                    {summary?.metrics.totalSubmittedBranches ?? 0} / {summary?.metrics.totalBranches ?? 0} branches submitted
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-[#6B1212] text-[#C9A227] font-bold uppercase tracking-wider">
                        <th className="py-3 px-4 text-left sticky left-0 bg-[#6B1212] z-10 border-r border-[#C9A227]/20">Branch</th>
                        <th className="py-3 px-3 text-left border-r border-[#C9A227]/20">By</th>
                        <th className="py-3 px-3 text-center border-r border-[#C9A227]/20">Status</th>
                        <th className="py-3 px-3 text-right border-r border-[#C9A227]/20">Cash</th>
                        <th className="py-3 px-3 text-right border-r border-[#C9A227]/20">G.Pay</th>
                        <th className="py-3 px-3 text-right border-r border-[#C9A227]/20">Card</th>
                        <th className="py-3 px-3 text-right border-r border-[#C9A227]/20">C.F</th>
                        <th className="py-3 px-3 text-right border-r border-[#C9A227]/20">C.T Sum</th>
                        <th className="py-3 px-3 text-right">+/-</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8D5B0]">
                      {summary?.branchSummaries.map((branch: any) => {
                        const hasDiff = (branch.totals.manualTotal || 0) !== 0;
                        return (
                          <tr key={branch.branchId} className={`transition-colors ${hasDiff ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-[#FDF6EE]"}`}>
                            <td className="py-3 px-4 sticky left-0 bg-inherit z-10 border-r border-[#E8D5B0]">
                              <span className="font-bold text-[#8B1A1A]">{branch.branchName}</span>
                              <span className="block text-[10px] text-[#9A7E6A] mt-0.5">{branch.filledCounters}/{branch.totalCounters} counters</span>
                            </td>
                            <td className="py-3 px-3 border-r border-[#E8D5B0]">
                              <span className="font-semibold text-[#5C4A3A]">{branch.submittedBy || "—"}</span>
                              {branch.submittedAt && (
                                <span className="block text-[10px] text-[#9A7E6A]">
                                  {new Date(branch.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center border-r border-[#E8D5B0]">
                              {branch.status === "SUBMITTED" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1B8A7A]/10 text-[#1B8A7A] border border-[#1B8A7A]/30">
                                  <CheckCircle size={9} /> Done
                                </span>
                              ) : branch.status === "DRAFT" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock size={9} /> Draft
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FDF6EE] text-[#9A7E6A] border border-[#E8D5B0]">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-[#1A0A0A] border-r border-[#E8D5B0]">{formatCurrency(branch.totals.cash)}</td>
                            <td className="py-3 px-3 text-right font-semibold text-[#1A0A0A] border-r border-[#E8D5B0]">{formatCurrency(branch.totals.gpay)}</td>
                            <td className="py-3 px-3 text-right font-semibold text-[#1A0A0A] border-r border-[#E8D5B0]">{formatCurrency(branch.totals.card)}</td>
                            <td className="py-3 px-3 text-right font-semibold text-[#1A0A0A] border-r border-[#E8D5B0]">{formatCurrency(branch.totals.counterFlow)}</td>
                            <td className="py-3 px-3 text-right font-extrabold text-[#8B1A1A] border-r border-[#E8D5B0]">{formatCurrency(branch.totals.systemTotal)}</td>
                            <td className={`py-3 px-3 text-right font-extrabold ${hasDiff ? "text-red-600" : "text-[#1B8A7A]"}`}>
                              {formatCurrency(branch.totals.manualTotal || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Grand Total row */}
                    {summary && summary.branchSummaries.length > 0 && (() => {
                      const gt = summary.branchSummaries.reduce((acc: any, b: any) => ({
                        cash:              acc.cash              + b.totals.cash,
                        gpay:              acc.gpay              + b.totals.gpay,
                        card:              acc.card              + b.totals.card,
                        counterFlow:       acc.counterFlow       + b.totals.counterFlow,
                        totalDue:          acc.totalDue          + b.totals.totalDue,
                        manuallyCollected: acc.manuallyCollected + (b.totals.manuallyCollected || 0),
                        systemTotal:       acc.systemTotal       + b.totals.systemTotal,
                        manualTotal:       acc.manualTotal       + (b.totals.manualTotal || 0),
                      }), { cash: 0, gpay: 0, card: 0, counterFlow: 0, totalDue: 0, manuallyCollected: 0, systemTotal: 0, manualTotal: 0 });
                      return (
                        <tfoot>
                          <tr className="bg-[#8B1A1A] font-extrabold text-white border-t-2 border-[#C9A227]/40">
                            <td className="py-3 px-4 sticky left-0 bg-[#8B1A1A] z-10 border-r border-[#C9A227]/20 text-[#C9A227] uppercase tracking-wider">Total</td>
                            <td className="py-3 px-3 border-r border-[#C9A227]/20"></td>
                            <td className="py-3 px-3 border-r border-[#C9A227]/20"></td>
                            <td className="py-3 px-3 text-right border-r border-[#C9A227]/20">{formatCurrency(gt.cash)}</td>
                            <td className="py-3 px-3 text-right border-r border-[#C9A227]/20">{formatCurrency(gt.gpay)}</td>
                            <td className="py-3 px-3 text-right border-r border-[#C9A227]/20">{formatCurrency(gt.card)}</td>
                            <td className="py-3 px-3 text-right border-r border-[#C9A227]/20">{formatCurrency(gt.counterFlow)}</td>
                            <td className="py-3 px-3 text-right border-r border-[#C9A227]/20 text-[#C9A227]">{formatCurrency(gt.systemTotal)}</td>
                            <td className={`py-3 px-3 text-right ${gt.manualTotal !== 0 ? "text-red-300" : "text-[#C9A227]"}`}>{formatCurrency(gt.manualTotal)}</td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>

              {/* C.T Sum — Day-wise Verification Matrix (persisted) */}
              {(() => {
                const dates = ctData?.dates ?? [];
                const rows = ctData?.branches ?? [];
                const colTotals: Record<string, number> = {};
                dates.forEach((d) => { colTotals[d] = rows.reduce((s, b) => s + (b.ctSum[d] || 0), 0); });
                const grand = dates.reduce((s, d) => s + colTotals[d], 0);
                // Only branch×day cells that actually have a submitted report count toward verification
                let presentCells = 0, verifiedCells = 0;
                rows.forEach((b) => dates.forEach((d) => {
                  if (b.present[d]) { presentCells++; if (ctVerifyMap[b.branchId]?.[d]?.verified) verifiedCells++; }
                }));
                return (
                  <div className="space-y-4">
                    {/* Controls */}
                    <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-[#1B8A7A]" />
                        <div>
                          <h3 className="text-sm font-extrabold text-[#8B1A1A]">C.T Sum — Day-wise Verification</h3>
                          <p className="text-[10px] text-[#9A7E6A] font-semibold mt-0.5">Click a day to review its breakdown, then mark it verified · saved automatically</p>
                        </div>
                      </div>
                      <div className="flex items-end gap-3 ml-auto flex-wrap">
                        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#9A7E6A]">
                          From
                          <input
                            type="date"
                            value={ctFrom}
                            max={ctTo || undefined}
                            onChange={(e) => setCtFrom(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#9A7E6A]">
                          To
                          <input
                            type="date"
                            value={ctTo}
                            min={ctFrom || undefined}
                            onChange={(e) => setCtTo(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-[#E8D5B0] rounded-lg text-xs font-semibold text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
                          />
                        </label>
                        <button
                          onClick={fetchCtMatrix}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C9A227] hover:bg-[#A07A15] text-xs font-bold text-white transition-all cursor-pointer"
                        >
                          <RefreshCw size={12} className={ctLoading ? "animate-spin" : ""} />
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>

                    {ctData?.capped && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700">
                        <AlertTriangle size={13} />
                        <span>Range limited to {ctData.maxDays} days. Narrow the dates to see a shorter span.</span>
                      </div>
                    )}

                    {/* Matrix */}
                    <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                      <div className="px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#1B8A7A]">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={15} className="text-white" />
                          <h3 className="text-sm font-bold text-white">C.T Sum Verification</h3>
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-3 text-[10px] font-semibold text-white/80">
                          <span className="flex items-center gap-1"><CheckCircle size={11} className="text-white" /> Verified</span>
                          <span className="flex items-center gap-1"><AlertCircle size={11} className="text-white" /> Pending</span>
                          <span className="flex items-center gap-1"><span className="text-white/60">—</span> No report</span>
                        </div>
                        <span className="text-[10px] text-white/70 font-semibold ml-auto">
                          {verifiedCells}/{presentCells} verified · {dates.length} day{dates.length === 1 ? "" : "s"} · {ctData?.from} → {ctData?.to}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#6B1212] text-[#C9A227] font-bold uppercase tracking-wider">
                              <th className="py-3 px-4 text-left sticky left-0 bg-[#6B1212] z-10 border-r border-[#C9A227]/20 min-w-[150px]">Branch</th>
                              {dates.map((d) => (
                                <th key={d} className="py-3 px-3 text-center border-r border-[#C9A227]/20 whitespace-nowrap">{shortDay(d)}</th>
                              ))}
                              <th className="py-3 px-3 text-right bg-[#5A0F0F] whitespace-nowrap">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8D5B0]">
                            {ctLoading ? (
                              <tr><td colSpan={dates.length + 2} className="py-10 text-center text-[#9A7E6A] text-sm">Loading…</td></tr>
                            ) : rows.length === 0 ? (
                              <tr><td colSpan={dates.length + 2} className="py-10 text-center text-[#9A7E6A] text-sm">No data for this range.</td></tr>
                            ) : (
                              rows.map((b) => {
                                const rowTotal = dates.reduce((s, d) => s + (b.ctSum[d] || 0), 0);
                                const presentD = dates.filter((d) => b.present[d]);
                                const rowVerified = presentD.filter((d) => ctVerifyMap[b.branchId]?.[d]?.verified).length;
                                return (
                                  <React.Fragment key={b.branchId}>
                                    <tr className="hover:bg-[#FDF6EE] transition-colors">
                                      <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-[#E8D5B0]">
                                        <span className="font-bold text-[#8B1A1A]">{b.branchName}</span>
                                        <span className="block text-[10px] text-[#9A7E6A] mt-0.5">{rowVerified}/{presentD.length} verified</span>
                                      </td>
                                      {dates.map((d) => {
                                        const has = !!b.present[d];
                                        const v = b.ctSum[d] || 0;
                                        const verified = !!ctVerifyMap[b.branchId]?.[d]?.verified;
                                        const isOpen = ctExpanded?.branchId === b.branchId && ctExpanded?.date === d;
                                        if (!has) {
                                          return (
                                            <td key={d} className="py-2 px-2 text-center border-r border-[#E8D5B0]">
                                              <span className="inline-block text-[11px] text-[#C9B8A8]">—</span>
                                            </td>
                                          );
                                        }
                                        return (
                                          <td key={d} className="py-2 px-2 text-center border-r border-[#E8D5B0]">
                                            <button
                                              onClick={() => setCtExpanded(isOpen ? null : { branchId: b.branchId, date: d })}
                                              title={verified ? "Verified — click to review / unverify" : "Pending — click to review & verify"}
                                              className={`w-full flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border transition-all cursor-pointer ${isOpen ? "ring-2 ring-[#C9A227] " : ""}${
                                                verified
                                                  ? "bg-[#1B8A7A]/15 border-[#1B8A7A]/50 hover:bg-[#1B8A7A]/25"
                                                  : "bg-red-50 border-red-300 hover:bg-red-100"
                                              }`}
                                            >
                                              {verified ? (
                                                <CheckCircle size={14} className="text-[#1B8A7A]" />
                                              ) : (
                                                <AlertCircle size={14} className="text-red-500" />
                                              )}
                                              <span className={`text-[11px] font-bold ${verified ? "text-[#1B8A7A]" : "text-red-600"}`}>
                                                {formatCurrency(v)}
                                              </span>
                                            </button>
                                          </td>
                                        );
                                      })}
                                      <td className="py-3 px-3 text-right font-extrabold text-[#8B1A1A] bg-[#FDF6EE]">{formatCurrency(rowTotal)}</td>
                                    </tr>

                                    {/* Expanded breakdown + verify action for the selected day */}
                                    {ctExpanded?.branchId === b.branchId && b.present[ctExpanded.date] && (() => {
                                      const ed = ctExpanded.date;
                                      const info = ctVerifyMap[b.branchId]?.[ed];
                                      const isVer = !!info?.verified;
                                      const saving = !!ctSaving[`${b.branchId}|${ed}`];
                                      const modes = [
                                        { label: "CASH", value: b.cash[ed] || 0 },
                                        { label: "G.PAY", value: b.gpay[ed] || 0 },
                                        { label: "CARD", value: b.card[ed] || 0 },
                                        { label: "COUNTER FLOW", value: b.counterFlow[ed] || 0 },
                                        { label: "DUE CREATED", value: b.due[ed] || 0 },
                                      ];
                                      const mc = b.manuallyCollected[ed] || 0;
                                      return (
                                        <tr>
                                          <td colSpan={dates.length + 2} className="p-0 bg-[#FBF3E7] border-b-2 border-[#C9A227]/30">
                                            <div className="p-4 flex flex-wrap items-stretch gap-4">
                                              {/* Breakdown */}
                                              <div className="flex-1 min-w-[300px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                  <Building size={13} className="text-[#8B1A1A]" />
                                                  <span className="text-xs font-extrabold text-[#8B1A1A]">{b.branchName}</span>
                                                  <span className="text-[10px] font-semibold text-[#9A7E6A]">· {shortDay(ed)}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {modes.map((m) => (
                                                    <div key={m.label} className="px-3 py-2 rounded-lg bg-white border border-[#E8D5B0] min-w-[96px]">
                                                      <p className="text-[9px] font-bold text-[#9A7E6A] uppercase tracking-wider">{m.label}</p>
                                                      <p className="text-xs font-extrabold text-[#1A0A0A] mt-0.5">{formatCurrency(m.value)}</p>
                                                    </div>
                                                  ))}
                                                  <div className="px-3 py-2 rounded-lg bg-[#8B1A1A]/5 border border-[#8B1A1A]/20 min-w-[110px]">
                                                    <p className="text-[9px] font-bold text-[#8B1A1A] uppercase tracking-wider">C.T Sum</p>
                                                    <p className="text-sm font-extrabold text-[#8B1A1A] mt-0.5">{formatCurrency(b.ctSum[ed] || 0)}</p>
                                                  </div>
                                                </div>
                                                <p className="text-[10px] text-[#9A7E6A] mt-2">
                                                  Manually Collected: <span className="font-bold text-[#5C4A3A]">{formatCurrency(mc)}</span> <span className="italic">(not included in C.T Sum)</span>
                                                </p>
                                              </div>
                                              {/* Verify action */}
                                              <div className="flex flex-col items-stretch justify-center gap-1.5 min-w-[200px]">
                                                <button
                                                  onClick={() => toggleDayVerify(b.branchId, ed)}
                                                  disabled={saving}
                                                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer disabled:opacity-60 ${
                                                    isVer
                                                      ? "bg-[#1B8A7A] border-[#1B8A7A] text-white hover:bg-[#15705F]"
                                                      : "bg-red-500 border-red-500 text-white hover:bg-red-600"
                                                  }`}
                                                >
                                                  {saving ? <RefreshCw size={14} className="animate-spin" /> : isVer ? <CheckCircle size={14} /> : <ShieldCheck size={14} />}
                                                  {saving ? "Saving…" : isVer ? "Verified — click to unverify" : "Mark as Verified"}
                                                </button>
                                                {isVer && info?.verifiedBy && (
                                                  <p className="text-[10px] text-center text-[#9A7E6A]">
                                                    by <span className="font-bold text-[#5C4A3A]">{info.verifiedBy}</span>
                                                    {info.verifiedAt && <> · {new Date(info.verifiedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                                                  </p>
                                                )}
                                                <button
                                                  onClick={() => setCtExpanded(null)}
                                                  className="text-[10px] font-bold text-[#9A7E6A] hover:text-[#5C4A3A] uppercase tracking-wider cursor-pointer"
                                                >
                                                  Close
                                                </button>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })()}
                                  </React.Fragment>
                                );
                              })
                            )}
                          </tbody>
                          {rows.length > 0 && (
                            <tfoot>
                              <tr className="bg-[#8B1A1A] font-extrabold text-white border-t-2 border-[#C9A227]/40">
                                <td className="py-3 px-4 sticky left-0 bg-[#8B1A1A] z-10 border-r border-[#C9A227]/20 text-[#C9A227] uppercase tracking-wider">Total</td>
                                {dates.map((d) => (
                                  <td key={d} className="py-3 px-3 text-right border-r border-[#C9A227]/20">{colTotals[d] > 0 ? formatCurrency(colTotals[d]) : "—"}</td>
                                ))}
                                <td className="py-3 px-3 text-right text-[#C9A227]">{formatCurrency(grand)}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                        hideDueBills={true}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "due" && renderRangeMatrix("due", {
            title: "Due Created",
            icon: <Receipt size={15} className="text-[#C9A227]" />,
            accent: "bg-[#1B8A7A]",
            cellColor: "text-[#1B8A7A]",
          })}

          {activeTab === "collected" && renderRangeMatrix("manuallyCollected", {
            title: "Manually Collected",
            icon: <Wallet size={15} className="text-[#C9A227]" />,
            accent: "bg-[#5C4A3A]",
            cellColor: "text-[#5C4A3A]",
          })}

          {activeTab === "liveview" && (
            <div className="space-y-6">
              {/* Page header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#8B1A1A]">Live Branch Summary</h3>
                  <p className="text-xs text-[#9A7E6A] mt-0.5">
                    Aggregated daily totals per branch · Business Date: <span className="font-bold text-[#5C4A3A]">{selectedDate}</span>
                  </p>
                </div>
                <button
                  onClick={fetchData}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FDF6EE] hover:bg-[#F0E4CC] border border-[#E8D5B0] text-xs font-bold text-[#5C4A3A] transition-all cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-20 text-[#9A7E6A] text-sm gap-2">
                  <RefreshCw size={16} className="animate-spin text-[#C9A227]" /> Loading branch data...
                </div>
              )}

              {/* Branch cards */}
              {!isLoading && summary?.branchSummaries.map((branch: any) => {
                const hasDiff = (branch.totals.manualTotal || 0) !== 0;
                const branchAlerts = (summary.alerts || []).filter((a: any) => a.branchName === branch.branchName);

                const stats = [
                  { label: "CASH",          value: branch.totals.cash,              style: "default" },
                  { label: "G.PAY",         value: branch.totals.gpay,              style: "default" },
                  { label: "CARD",          value: branch.totals.card,              style: "default" },
                  { label: "COUNTER FLOW",  value: branch.totals.counterFlow,       style: "default" },
                  { label: "MANUALLY COLL.",value: branch.totals.manuallyCollected, style: "default" },
                  { label: "DUE CREATED",   value: branch.totals.totalDue,          style: "teal"    },
                  { label: "C.T SUM",       value: branch.totals.systemTotal,       style: "primary" },
                  { label: "+/-",           value: branch.totals.manualTotal,       style: hasDiff ? "red" : "green" },
                ];

                return (
                  <div key={branch.branchId} className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
                    {/* Card header */}
                    <div className="px-6 py-4 bg-[#8B1A1A] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Building size={15} className="text-[#C9A227]" />
                        <h4 className="text-base font-extrabold text-white uppercase tracking-wider">{branch.branchName}</h4>
                        <span className="text-[10px] font-semibold text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                          {branch.filledCounters}/{branch.totalCounters} counters filled
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {branch.status === "SUBMITTED" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#1B8A7A] text-white">
                            <CheckCircle size={11} /> SUBMITTED
                          </span>
                        ) : branch.status === "DRAFT" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                            <Clock size={11} /> IN DRAFT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white/70">
                            NOT STARTED
                          </span>
                        )}
                        {branch.submittedBy && (
                          <span className="text-[10px] text-white/60">
                            by {branch.submittedBy}
                            {branch.submittedAt && (
                              <> · {new Date(branch.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats grid — 8 columns matching the Excel sheet */}
                    <div className="p-5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                        {stats.map(({ label, value, style }) => (
                          <div
                            key={label}
                            className={`rounded-lg p-3.5 border ${
                              style === "primary" ? "bg-[#8B1A1A]/5 border-[#8B1A1A]/15"  :
                              style === "teal"    ? "bg-[#1B8A7A]/5 border-[#1B8A7A]/20"  :
                              style === "gold"    ? "bg-[#C9A227]/5 border-[#C9A227]/25"  :
                              style === "red"     ? "bg-red-50 border-red-200"            :
                              style === "green"   ? "bg-[#1B8A7A]/5 border-[#1B8A7A]/20" :
                              "bg-[#FDF6EE] border-[#E8D5B0]"
                            }`}
                          >
                            <p className="text-[9px] font-bold text-[#9A7E6A] uppercase tracking-wider leading-tight">{label}</p>
                            <p className={`text-sm font-extrabold mt-1.5 leading-none ${
                              style === "primary" ? "text-[#8B1A1A]"  :
                              style === "teal"    ? "text-[#1B8A7A]"  :
                              style === "gold"    ? "text-[#92400E]"  :
                              style === "red"     ? "text-red-600"    :
                              style === "green"   ? "text-[#1B8A7A]"  :
                              "text-[#1A0A0A]"
                            }`}>
                              {formatCurrency(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Discrepancy alert — only shown when +/- is non-zero */}
                    {hasDiff && branchAlerts.length > 0 && (
                      <div className="px-5 pb-5">
                        <div className="rounded-lg bg-red-50 border border-red-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 border-b border-red-200">
                            <AlertTriangle size={12} className="text-red-600 shrink-0" />
                            <p className="text-xs font-bold text-red-700 uppercase tracking-wider">
                              Discrepancies — {branchAlerts.length} counter{branchAlerts.length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="divide-y divide-red-100">
                            {branchAlerts.map((alert: any, i: number) => (
                              <div key={i} className="flex items-center justify-between px-4 py-2">
                                <span className="text-xs font-semibold text-red-800">{alert.counterName}</span>
                                <span className="text-xs font-extrabold text-red-600">{formatCurrency(alert.difference)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* No data state */}
              {!isLoading && !summary && (
                <div className="flex flex-col items-center justify-center py-20 text-[#9A7E6A] border-2 border-dashed border-[#E8D5B0] rounded-xl">
                  <LayoutGrid size={28} className="text-[#C9A227]/50 mb-3" />
                  <p className="text-sm font-bold text-[#5C4A3A]">No branch data loaded</p>
                  <p className="text-xs mt-1">Click Refresh to load today's branch summaries.</p>
                </div>
              )}

              {/* Combined grand total across all branches */}
              {!isLoading && summary && summary.branchSummaries.length > 0 && (
                <div className="bg-[#8B1A1A] rounded-xl border border-[#C9A227]/20 overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#C9A227]/20 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={15} className="text-[#C9A227]" />
                      <h4 className="text-sm font-extrabold text-white uppercase tracking-wider">All Branches — Combined Total</h4>
                    </div>
                    <span className="text-xs font-semibold text-white/50">
                      {summary.metrics.totalSubmittedBranches}/{summary.metrics.totalBranches} branches submitted
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                      {[
                        { label: "CASH",          value: summary.branchSummaries.reduce((s: number, b: any) => s + b.totals.cash,              0) },
                        { label: "G.PAY",         value: summary.branchSummaries.reduce((s: number, b: any) => s + b.totals.gpay,              0) },
                        { label: "CARD",          value: summary.branchSummaries.reduce((s: number, b: any) => s + b.totals.card,              0) },
                        { label: "COUNTER FLOW",  value: summary.branchSummaries.reduce((s: number, b: any) => s + b.totals.counterFlow,       0) },
                        { label: "MANUALLY COLL.",value: summary.branchSummaries.reduce((s: number, b: any) => s + (b.totals.manuallyCollected || 0), 0) },
                        { label: "DUE CREATED",   value: summary.branchSummaries.reduce((s: number, b: any) => s + b.totals.totalDue,          0) },
                        { label: "C.T SUM",       value: summary.metrics.totalCollection },
                        { label: "+/- DIFF",      value: summary.branchSummaries.reduce((s: number, b: any) => s + (b.totals.manualTotal || 0), 0) },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg p-3.5 bg-white/10 border border-white/15">
                          <p className="text-[9px] font-bold text-[#C9A227]/70 uppercase tracking-wider leading-tight">{label}</p>
                          <p className="text-sm font-extrabold mt-1.5 text-white leading-none">{formatCurrency(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div className="bg-white border border-[#E8D5B0] rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-[#8B1A1A] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Activity size={16} className="text-[#C9A227] shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-white">System Security Audit Logs</h3>
                    <p className="text-xs text-white/60 mt-0.5">Chronological audit trails for data entries, modifications, logons, and lock triggers.</p>
                  </div>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold text-white/80 whitespace-nowrap">
                  {auditLogs.length} event{auditLogs.length === 1 ? "" : "s"}
                </span>
              </div>

              {auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#9A7E6A]">
                  <Activity size={28} className="text-[#C9A227]/50 mb-3" />
                  <p className="text-sm font-bold text-[#5C4A3A]">No audit activity yet</p>
                  <p className="text-xs mt-1">Logons, submissions and edits will appear here.</p>
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto">
                  {(() => {
                    // Group consecutive same-day logs (already sorted newest-first)
                    const groups: { key: string; heading: string; items: typeof auditLogs }[] = [];
                    for (const log of auditLogs) {
                      const k = dayKey(log.timestamp);
                      const last = groups[groups.length - 1];
                      if (!last || last.key !== k) groups.push({ key: k, heading: dayHeading(log.timestamp), items: [log] });
                      else last.items.push(log);
                    }
                    return groups.map((g) => (
                      <div key={g.key}>
                        {/* Day divider */}
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-2 bg-[#FDF6EE] border-y border-[#E8D5B0]">
                          <div className="flex items-center gap-2">
                            <Calendar size={12} className="text-[#C9A227]" />
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#8B1A1A]">{g.heading}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[#9A7E6A]">{g.items.length} event{g.items.length === 1 ? "" : "s"}</span>
                        </div>
                        {/* Entries */}
                        <div className="divide-y divide-[#F0E6D6]">
                          {g.items.map((log) => {
                            const meta = getActionMeta(log.action);
                            const rm = roleMeta(log.user.role);
                            const ActionIcon = meta.Icon;
                            return (
                              <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[#FDF6EE] transition-colors">
                                {/* Action icon */}
                                <div className={`shrink-0 mt-0.5 h-7 w-7 rounded-full flex items-center justify-center text-white ${meta.dot}`}>
                                  <ActionIcon size={13} />
                                </div>
                                {/* Operator + action + description */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-bold text-[#1A0A0A] text-xs">{log.user.name}</span>
                                    <span className="text-[10px] text-[#9A7E6A]">@{log.user.username}</span>
                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border ${rm.cls}`}>{rm.label}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${meta.badge}`}>{meta.label}</span>
                                  </div>
                                  <p className="text-xs text-[#5C4A3A] mt-1 break-words">{renderLogDetails(log.action, log.details)}</p>
                                </div>
                                {/* Time */}
                                <span
                                  className="shrink-0 mt-0.5 text-xs font-semibold text-[#5C4A3A] tabular-nums whitespace-nowrap"
                                  title={new Date(log.timestamp).toLocaleString("en-IN")}
                                >
                                  {new Date(log.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
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
