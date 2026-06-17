"use client";

import React, { useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Lock,
  ChevronDown,
  ChevronRight,
  Phone,
  Plus,
  X,
} from "lucide-react";

export interface DueBillItem {
  billNo: string;
  name: string;
  amount: number;
  mobile: string;
}

export interface CollectedDueBillItem {
  billNo: string;
  name: string;
  mobile: string;
  amount: number;
}

export interface ManuallyCollectedBillItem {
  billNo: string;
  name: string;
  mobile: string;
  amount: number;
}

export interface ReportEntryData {
  id?: string;
  counterId: string;
  counterName: string;
  cash: number;
  gpay: number;
  card: number;
  counterFlow: number;
  totalDue: number;
  collectedDue?: number;
  // Due Created details (legacy single-entry — kept for backward compat)
  dueBillNo?: string;
  dueBillName?: string;
  dueBillAmount?: number;
  dueBillMobile?: string;
  // Due Collected details (legacy single-entry — kept for backward compat, no longer displayed)
  collectedDueBillNo?: string;
  collectedDueBillName?: string;
  collectedDueBillMobile?: string;
  // Multi-entry arrays (preferred over legacy fields)
  dueBills?: DueBillItem[];
  collectedDueBills?: CollectedDueBillItem[];
  manuallyCollected?: number;
  manuallyCollectedBills?: ManuallyCollectedBillItem[];
  manualTotal: number;
  systemTotal?: number;
  difference?: number;
}

interface ExcelGridProps {
  data: ReportEntryData[];
  onChange: (newData: ReportEntryData[]) => void;
  isReadOnly: boolean;
  saveStatus: "draft" | "saving" | "saved" | "error";
  /** Branch name — used to restrict DUE columns to Counter 2 & 3 only in Siddipet */
  branchName?: string;
}

interface ColumnConfig {
  header: string;
  subHeader?: string;
  key: keyof ReportEntryData;
  type: "text" | "number" | "computed" | "string";
  editable: boolean;
}

const COLUMNS: ColumnConfig[] = [
  { header: "C.N", key: "counterName", type: "text", editable: false },
  { header: "CASH", key: "cash", type: "number", editable: true },
  { header: "G.PAY", key: "gpay", type: "number", editable: true },
  { header: "CARD", key: "card", type: "number", editable: true },
  { header: "DUE", subHeader: "Created", key: "totalDue", type: "number", editable: true },
  { header: "COUNTER FLOW", key: "counterFlow", type: "number", editable: true },
  { header: "MANUALLY", subHeader: "Collected", key: "manuallyCollected", type: "number", editable: true },
  { header: "C.T", subHeader: "Sum", key: "systemTotal", type: "computed", editable: false },
  { header: "+/-", key: "manualTotal", type: "number", editable: true },
];

/** Returns true if the given counter can enter DUE amounts.
 *  Rule: In Siddipet, only Counter 2 and Counter 3 are allowed. All counters allowed in other branches. */
function isDueAllowed(counterName: string, branchName?: string): boolean {
  if (!branchName) return true;
  if (branchName.toLowerCase() === "siddipet") {
    return counterName === "Counter 2" || counterName === "Counter 3";
  }
  return true;
}

/** Returns true if a due entry is missing required detail fields */
function hasMissingDueDetails(row: ReportEntryData): boolean {
  if ((row.totalDue || 0) > 0) {
    const bills = row.dueBills || [];
    if (bills.length === 0) return true;
    if (bills.some((b) => !b.billNo?.trim() || !b.name?.trim() || !b.mobile?.trim())) return true;
  }
  return false;
}

export default function ExcelGrid({ data, onChange, isReadOnly, saveStatus, branchName }: ExcelGridProps) {
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingValue, setEditingValue] = useState<string>("");
  const editingValueRef = useRef<string>("");

  // G TOTAL = cash + gpay + card + counterFlow + totalDue + manuallyCollected
  const processedData = data.map((row) => {
    const systemTotal =
      (row.cash || 0) +
      (row.gpay || 0) +
      (row.card || 0) +
      (row.counterFlow || 0) +
      (row.totalDue || 0) +
      (row.manuallyCollected || 0);
    return { ...row, systemTotal };
  });

  const totals = processedData.reduce(
    (acc, row) => {
      acc.cash += row.cash || 0;
      acc.gpay += row.gpay || 0;
      acc.card += row.card || 0;
      acc.counterFlow += row.counterFlow || 0;
      acc.totalDue += row.totalDue || 0;
      acc.manuallyCollected += row.manuallyCollected || 0;
      acc.systemTotal += row.systemTotal || 0;
      acc.manualTotal += row.manualTotal || 0;
      acc.dueBillAmount += row.dueBillAmount || 0;
      return acc;
    },
    { cash: 0, gpay: 0, card: 0, counterFlow: 0, totalDue: 0, manuallyCollected: 0, systemTotal: 0, manualTotal: 0, dueBillAmount: 0 }
  );

  const toggleRow = (rowIndex: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex);
      return next;
    });
  };

  const moveFocus = (rowIndex: number, colIndex: number) => {
    const targetRow = Math.max(0, Math.min(rowIndex, data.length - 1));
    const targetCol = Math.max(0, Math.min(colIndex, COLUMNS.length - 1));
    const inputElement = document.getElementById(`cell-${targetRow}-${targetCol}`) as HTMLInputElement | null;
    if (inputElement) {
      inputElement.focus();
      inputElement.select();
      setFocusedCell({ rowIndex: targetRow, colIndex: targetCol });
      const targetRow_ = data[targetRow];
      const colKey = COLUMNS[targetCol].key;
      const raw = targetRow_ ? (((targetRow_ as any)[colKey] as number) === 0 ? "" : String((targetRow_ as any)[colKey])) : "";
      setEditingValue(raw);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(rowIndex - 1, colIndex); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(rowIndex + 1, colIndex); }
    else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      if (input.selectionStart === 0 || input.selectionStart === input.selectionEnd) { e.preventDefault(); moveFocus(rowIndex, colIndex - 1); }
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length || input.selectionStart === input.selectionEnd) { e.preventDefault(); moveFocus(rowIndex, colIndex + 1); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? moveFocus(rowIndex - 1, colIndex) : moveFocus(rowIndex + 1, colIndex);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        colIndex === 0 && rowIndex > 0 ? moveFocus(rowIndex - 1, COLUMNS.length - 1) : moveFocus(rowIndex, colIndex - 1);
      } else {
        colIndex === COLUMNS.length - 1 && rowIndex < data.length - 1 ? moveFocus(rowIndex + 1, 0) : moveFocus(rowIndex, colIndex + 1);
      }
    }
  };

  const handleCellChange = (rowIndex: number, colKey: keyof ReportEntryData, valueStr: string, isString = false) => {
    if (isReadOnly) return;
    const updatedData = [...data];
    if (isString) {
      updatedData[rowIndex] = { ...updatedData[rowIndex], [colKey]: valueStr };
    } else {
      const value = valueStr !== "" ? parseFloat(valueStr.replace(/[^0-9.-]/g, "")) || 0 : 0;
      updatedData[rowIndex] = { ...updatedData[rowIndex], [colKey]: value };
    }
    onChange(updatedData);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startRowIndex: number, startColIndex: number) => {
    if (isReadOnly) return;
    e.preventDefault();
    const rows = e.clipboardData.getData("text").split(/\r?\n/).filter((r) => r.trim() !== "");
    const updatedData = [...data];
    rows.forEach((rowText, rOffset) => {
      const targetRowIdx = startRowIndex + rOffset;
      if (targetRowIdx >= updatedData.length) return;
      rowText.split("\t").forEach((cellText, cOffset) => {
        const targetColIdx = startColIndex + cOffset;
        if (targetColIdx >= COLUMNS.length) return;
        const col = COLUMNS[targetColIdx];
        if (col.editable && col.type === "number") {
          updatedData[targetRowIdx] = { ...updatedData[targetRowIdx], [col.key]: parseFloat(cellText.replace(/[^0-9.-]/g, "")) || 0 };
        }
      });
    });
    onChange(updatedData);
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // ── Multi-entry due bill handlers ────────────────────────────────────────────

  // Re-compute totalDue from the sum of all due bill amounts
  const sumDueBills = (bills: DueBillItem[]) =>
    bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

  const handleAddDueBill = useCallback((rIdx: number) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = [...(updated[rIdx].dueBills || []), { billNo: "", name: "", amount: 0, mobile: "" }];
    updated[rIdx] = { ...updated[rIdx], dueBills: bills, totalDue: sumDueBills(bills) };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  const handleRemoveDueBill = useCallback((rIdx: number, bIdx: number) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = (updated[rIdx].dueBills || []).filter((_, i) => i !== bIdx);
    updated[rIdx] = { ...updated[rIdx], dueBills: bills, totalDue: sumDueBills(bills) };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  const handleDueBillChange = useCallback((rIdx: number, bIdx: number, field: keyof DueBillItem, value: string) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = [...(updated[rIdx].dueBills || [])];
    bills[bIdx] = {
      ...bills[bIdx],
      [field]: field === "amount" ? (parseFloat(value.replace(/[^0-9.-]/g, "")) || 0) : value,
    };
    updated[rIdx] = { ...updated[rIdx], dueBills: bills, totalDue: sumDueBills(bills) };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  const handleAddManuallyCollectedBill = useCallback((rIdx: number) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = [...(updated[rIdx].manuallyCollectedBills || []), { billNo: "", name: "", mobile: "", amount: 0 }];
    updated[rIdx] = { ...updated[rIdx], manuallyCollectedBills: bills };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  const handleRemoveManuallyCollectedBill = useCallback((rIdx: number, bIdx: number) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = (updated[rIdx].manuallyCollectedBills || []).filter((_, i) => i !== bIdx);
    updated[rIdx] = { ...updated[rIdx], manuallyCollectedBills: bills };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  const handleManuallyCollectedBillChange = useCallback((rIdx: number, bIdx: number, field: keyof ManuallyCollectedBillItem, value: string) => {
    if (isReadOnly) return;
    const updated = [...data];
    const bills = [...(updated[rIdx].manuallyCollectedBills || [])];
    bills[bIdx] = {
      ...bills[bIdx],
      [field]: field === "amount" ? (parseFloat(value.replace(/[^0-9.-]/g, "")) || 0) : value,
    };
    updated[rIdx] = { ...updated[rIdx], manuallyCollectedBills: bills };
    onChange(updated);
  }, [data, isReadOnly, onChange]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Main Grid */}
      <div className="w-full flex flex-col bg-white border border-[#E8D5B0] rounded-xl shadow-md overflow-hidden">
        {/* Top status bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[#8B1A1A] border-b border-[#C9A227]/30">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-[#C9A227] animate-pulse"></div>
            <span className="text-sm font-bold text-white">Daily Counter Sheet</span>
            {isReadOnly && (
              <span className="flex items-center gap-1 ml-3 px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-[#C9A227] border border-[#C9A227]/40">
                <Lock size={10} /> LOCKED
              </span>
            )}
          </div>
          <div className="text-xs font-medium">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-[#C9A227]">Saving changes...</span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-[#C9A227]">
                <CheckCircle size={13} /> Draft auto-saved
              </span>
            )}
            {saveStatus === "draft" && (
              <span className="text-white/60">Draft mode (unsaved)</span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-red-300">
                <AlertCircle size={13} /> Save failed
              </span>
            )}
          </div>
        </div>

        {/* Grid table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full">
          <table className="w-full border-collapse table-fixed min-w-[900px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="py-3 px-2 w-[36px] bg-[#6B1212] border-r border-[#C9A227]/20 border-b border-[#C9A227]/30"></th>
                {COLUMNS.map((col, idx) => (
                  <th
                    key={idx}
                    className={`py-2.5 px-3 text-xs font-bold text-[#C9A227] bg-[#6B1212] border-r border-[#C9A227]/20 border-b border-[#C9A227]/30 ${
                      idx === 0 ? "w-[110px] sticky left-9 z-30" : ""
                    } ${col.type === "computed" ? "bg-[#5A0F0F]" : ""}`}
                  >
                    <div className="leading-tight">{col.header}</div>
                    {col.subHeader && <div className="text-[9px] text-[#C9A227]/60 font-normal">{col.subHeader}</div>}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#E8D5B0]">
              {processedData.map((row, rIdx) => {
                const hasDiff = (row.manualTotal || 0) !== 0;
                const isExpanded = expandedRows.has(rIdx);
                const dueAllowed = isDueAllowed(row.counterName, branchName);
                const missingDetails = !isReadOnly && hasMissingDueDetails(row);

                return (
                  <React.Fragment key={row.counterId}>
                    <tr className={`transition-colors ${hasDiff ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-[#FDF6EE]"}`}>
                      {/* Toggle */}
                      <td className="p-0 text-center border-r border-[#E8D5B0]">
                        <button
                          onClick={() => toggleRow(rIdx)}
                          className={`w-full h-full py-2.5 px-1 transition-colors ${
                            missingDetails
                              ? "text-red-500 hover:text-red-700"
                              : "text-[#C9A227] hover:text-[#8B1A1A]"
                          }`}
                          title={missingDetails ? "Due details are incomplete — click to fill in" : "Toggle Due Bill Details"}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {missingDetails && <span className="block w-1.5 h-1.5 rounded-full bg-red-500 mx-auto mt-0.5" />}
                        </button>
                      </td>

                      {COLUMNS.map((col, cIdx) => {
                        // For DUE columns, disable if not allowed for this counter in Siddipet
                        const isDueCol = col.key === "totalDue";
                        // When due bills are entered via sub-panel, totalDue is auto-summed — block direct editing
                        const hasDueBills = isDueCol && (row.dueBills?.length ?? 0) > 0;
                        const effectivelyEditable = col.editable && !isReadOnly && (!isDueCol || dueAllowed) && !hasDueBills;
                        const isColEditable = effectivelyEditable;
                        const value = row[col.key];
                        const isFocused = focusedCell?.rowIndex === rIdx && focusedCell?.colIndex === cIdx;

                        let tdClass = "text-right";
                        let inputClass = "text-[#1A0A0A]";

                        if (cIdx === 0) {
                          tdClass = "text-left font-semibold sticky left-9 bg-white border-r border-[#E8D5B0] z-10";
                          inputClass = "text-[#8B1A1A] font-bold bg-transparent border-0 cursor-default focus:ring-0";
                        } else if (col.type === "computed") {
                          tdClass = "text-right bg-[#FDF6EE]";
                          inputClass = hasDiff ? "text-red-600 font-bold" : "text-[#1B8A7A] font-bold";
                        } else if (col.key === "manualTotal") {
                          inputClass = hasDiff ? "text-red-600 font-bold" : "text-[#1A0A0A]";
                        } else if (isDueCol && !dueAllowed) {
                          tdClass = "text-right bg-[#F5F5F5]";
                          inputClass = "text-gray-400 cursor-not-allowed";
                        } else if (hasDueBills) {
                          // Auto-computed from due bill sub-panel — teal tint
                          tdClass = "text-right bg-[#F0FDF4]";
                          inputClass = "text-[#15803D] font-semibold cursor-default";
                        }

                        return (
                          <td
                            key={cIdx}
                            className={`p-0 border-r border-[#E8D5B0] relative ${tdClass} ${
                              isFocused ? "ring-2 ring-inset ring-[#C9A227]" : ""
                            }`}
                          >
                            {col.type === "text" ? (
                              <div className="py-2.5 px-3 font-bold text-xs text-[#8B1A1A] select-none">
                                {row.counterName}
                              </div>
                            ) : isDueCol && !dueAllowed ? (
                              /* Disabled DUE cell for non-permitted counters in Siddipet */
                              <div className="py-2.5 px-3 text-xs text-gray-400 text-right select-none">—</div>
                            ) : hasDueBills ? (
                              /* Auto-computed from due bill sub-panel — not manually editable */
                              <div
                                className="py-2.5 px-3 text-xs text-[#15803D] font-semibold text-right select-none flex items-center justify-end gap-1"
                                title="Auto-computed from due bill details — edit bills below"
                              >
                                <Lock size={9} className="opacity-50 shrink-0" />
                                {fmt(row.totalDue || 0)}
                              </div>
                            ) : isFocused ? (
                              <input
                                key={`edit-${rIdx}-${cIdx}`}
                                id={`cell-${rIdx}-${cIdx}`}
                                type="text"
                                inputMode="decimal"
                                defaultValue={editingValue}
                                autoFocus
                                onChange={(e) => {
                                  editingValueRef.current = e.target.value;
                                  handleCellChange(rIdx, col.key as keyof ReportEntryData, e.target.value);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, rIdx, cIdx)}
                                onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                                onBlur={() => {
                                  editingValueRef.current = "";
                                  setFocusedCell(null);
                                  setEditingValue("");
                                }}
                                disabled={!isColEditable}
                                className={`w-full h-full py-2.5 px-3 bg-[#FFF8F2] text-xs text-right border-0 rounded-none focus:outline-none transition-all ${inputClass} ${
                                  !isColEditable ? "cursor-not-allowed opacity-60" : "cursor-text"
                                }`}
                              />
                            ) : (
                              <input
                                key={`view-${rIdx}-${cIdx}`}
                                id={`cell-${rIdx}-${cIdx}`}
                                type="text"
                                inputMode="decimal"
                                value={fmt((value as number) || 0)}
                                readOnly
                                onFocus={() => {
                                  if (!isColEditable) return;
                                  const raw = (value as number) === 0 ? "" : String(value as number);
                                  editingValueRef.current = raw;
                                  setEditingValue(raw);
                                  setFocusedCell({ rowIndex: rIdx, colIndex: cIdx });
                                }}
                                disabled={!isColEditable}
                                className={`w-full h-full py-2.5 px-3 bg-transparent text-xs text-right border-0 rounded-none focus:outline-none transition-all ${inputClass} ${
                                  !isColEditable ? "cursor-default" : "cursor-text hover:bg-[#FDF6EE]"
                                }`}
                              />
                            )}
                            {col.key === "manualTotal" && hasDiff && (
                              <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(220,38,38,0.8)]"></div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Due Bill details sub-row (two sections: Created + Collected) */}
                    {isExpanded && (
                      <tr className="bg-[#FFF8F2] border-b border-[#E8D5B0]">
                        <td></td>
                        <td colSpan={COLUMNS.length} className="px-5 py-3">
                          <div className="flex flex-col gap-4">

                            {/* DUE CREATED Details */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-[#1B8A7A] uppercase tracking-widest">
                                  Due Created Details
                                </span>
                                {!isReadOnly && (
                                  <button
                                    onClick={() => handleAddDueBill(rIdx)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[#1B8A7A]/10 text-[#1B8A7A] hover:bg-[#1B8A7A]/20 border border-[#1B8A7A]/30"
                                  >
                                    <Plus size={9} /> Add Bill
                                  </button>
                                )}
                                {(row.totalDue || 0) > 0 && (row.dueBills || []).length === 0 && (
                                  <span className="text-[9px] text-red-500 font-semibold">* required</span>
                                )}
                              </div>
                              {(row.dueBills || []).length === 0 ? (
                                <p className="text-[9px] text-[#9A7E6A] italic">
                                  {isReadOnly ? "No bills recorded." : "Click \"+ Add Bill\" to add a due bill entry."}
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {(row.dueBills || []).map((bill, bIdx) => {
                                    const billMissingFields = (row.totalDue || 0) > 0 && (!bill.billNo?.trim() || !bill.name?.trim() || !bill.mobile?.trim());
                                    return (
                                      <div key={bIdx} className="flex items-center gap-3 flex-wrap">
                                        <span className="text-[9px] font-bold text-[#9A7E6A] w-4">#{bIdx + 1}</span>
                                        <div className="flex items-center gap-2">
                                          <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Bill No:</label>
                                          <input
                                            type="text"
                                            value={bill.billNo}
                                            onChange={(e) => handleDueBillChange(rIdx, bIdx, "billNo", e.target.value)}
                                            disabled={isReadOnly}
                                            placeholder="e.g. BL-001"
                                            className={`w-28 bg-white border rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50 ${
                                              billMissingFields && !bill.billNo?.trim() ? "border-red-400" : "border-[#E8D5B0]"
                                            }`}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Name:</label>
                                          <input
                                            type="text"
                                            value={bill.name}
                                            onChange={(e) => handleDueBillChange(rIdx, bIdx, "name", e.target.value)}
                                            disabled={isReadOnly}
                                            placeholder="Customer name"
                                            className={`w-36 bg-white border rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50 ${
                                              billMissingFields && !bill.name?.trim() ? "border-red-400" : "border-[#E8D5B0]"
                                            }`}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap flex items-center gap-1">
                                            <Phone size={9} /> Mobile:
                                          </label>
                                          <input
                                            type="tel"
                                            value={bill.mobile}
                                            onChange={(e) => handleDueBillChange(rIdx, bIdx, "mobile", e.target.value)}
                                            disabled={isReadOnly}
                                            placeholder="10-digit mobile"
                                            maxLength={10}
                                            className={`w-32 bg-white border rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50 ${
                                              billMissingFields && !bill.mobile?.trim() ? "border-red-400" : "border-[#E8D5B0]"
                                            }`}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Amount:</label>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={bill.amount || ""}
                                            onChange={(e) => handleDueBillChange(rIdx, bIdx, "amount", e.target.value)}
                                            disabled={isReadOnly}
                                            placeholder="0"
                                            className="w-24 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] text-right focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                                          />
                                        </div>
                                        {!isReadOnly && (
                                          <button
                                            onClick={() => handleRemoveDueBill(rIdx, bIdx)}
                                            className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50"
                                            title="Remove this bill"
                                          >
                                            <X size={12} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Divider */}
                            <div className="border-t border-[#E8D5B0]" />

                            {/* MANUALLY COLLECTED Bills Details */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-[#5C4A3A] uppercase tracking-widest">
                                  Manually Collected Details
                                </span>
                                {!isReadOnly && (
                                  <button
                                    onClick={() => handleAddManuallyCollectedBill(rIdx)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[#5C4A3A]/10 text-[#5C4A3A] hover:bg-[#5C4A3A]/20 border border-[#5C4A3A]/30"
                                  >
                                    <Plus size={9} /> Add Bill
                                  </button>
                                )}
                              </div>
                              {(row.manuallyCollectedBills || []).length === 0 ? (
                                <p className="text-[9px] text-[#9A7E6A] italic">
                                  {isReadOnly ? "No bills recorded." : "Click \"+ Add Bill\" to add a manually collected bill entry."}
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {(row.manuallyCollectedBills || []).map((bill, bIdx) => (
                                    <div key={bIdx} className="flex items-center gap-3 flex-wrap">
                                      <span className="text-[9px] font-bold text-[#9A7E6A] w-4">#{bIdx + 1}</span>
                                      <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Bill No:</label>
                                        <input
                                          type="text"
                                          value={bill.billNo}
                                          onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "billNo", e.target.value)}
                                          disabled={isReadOnly}
                                          placeholder="e.g. BL-001"
                                          className="w-28 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Name:</label>
                                        <input
                                          type="text"
                                          value={bill.name}
                                          onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "name", e.target.value)}
                                          disabled={isReadOnly}
                                          placeholder="Customer name"
                                          className="w-36 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap flex items-center gap-1">
                                          <Phone size={9} /> Mobile:
                                        </label>
                                        <input
                                          type="tel"
                                          value={bill.mobile}
                                          onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "mobile", e.target.value)}
                                          disabled={isReadOnly}
                                          placeholder="10-digit mobile"
                                          maxLength={10}
                                          className="w-32 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Amount:</label>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={bill.amount || ""}
                                          onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "amount", e.target.value)}
                                          disabled={isReadOnly}
                                          placeholder="0"
                                          className="w-24 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] text-right focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                                        />
                                      </div>
                                      {!isReadOnly && (
                                        <button
                                          onClick={() => handleRemoveManuallyCollectedBill(rIdx, bIdx)}
                                          className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50"
                                          title="Remove this bill"
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Grand Total row */}
              <tr className="bg-[#8B1A1A] border-t-2 border-[#C9A227]/40 font-bold">
                <td className="py-3 px-2 border-r border-[#C9A227]/20"></td>
                <td className="py-3 px-3 text-xs font-extrabold uppercase tracking-wider text-[#C9A227] sticky left-9 z-10 border-r border-[#C9A227]/20 bg-[#8B1A1A]">
                  G.T
                </td>
                {[totals.cash, totals.gpay, totals.card, totals.totalDue, totals.counterFlow, totals.manuallyCollected].map((v, i) => (
                  <td key={i} className="py-3 px-3 text-right text-xs text-white border-r border-[#C9A227]/20">{fmt(v)}</td>
                ))}
                <td className="py-3 px-3 text-right text-xs font-extrabold border-r border-[#C9A227]/20 text-[#C9A227]">
                  {fmt(totals.systemTotal)}
                </td>
                <td className={`py-3 px-3 text-right text-xs font-extrabold border-r border-[#C9A227]/20 ${(totals.manualTotal || 0) !== 0 ? "text-red-300" : "text-[#C9A227]"}`}>
                  {fmt(totals.manualTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Keyboard hints */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 bg-[#FDF6EE] border-t border-[#E8D5B0] text-[#9A7E6A] text-xs">
          <div className="flex items-center gap-1.5">
            <HelpCircle size={13} className="text-[#C9A227]" />
            <span>Arrow keys to navigate · Enter/Tab to move forward · Click ▶ to expand Due Bill details per counter</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded bg-white border border-[#E8D5B0] text-[#5C4A3A] text-[10px] font-semibold">Ctrl+C</span> Copy
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded bg-white border border-[#E8D5B0] text-[#5C4A3A] text-[10px] font-semibold">Ctrl+V</span> Paste block
            </span>
          </div>
        </div>
      </div>

      {/* Summary panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Counter */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl overflow-hidden shadow-md">
          <div className="px-5 py-3 bg-[#8B1A1A] flex items-center gap-2 border-b border-[#C9A227]/30">
            <div className="h-2 w-2 rounded-full bg-[#C9A227]"></div>
            <span className="text-xs font-bold text-white uppercase tracking-widest">SYSTEM COUNTER</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: "CASH", value: totals.cash },
                { label: "G.PAY", value: totals.gpay },
                { label: "CARD", value: totals.card },
                { label: "COUNTER FLOW", value: totals.counterFlow },
                { label: "DUE CREATED", value: totals.totalDue, teal: true },
                { label: "MANUALLY COLLECTED", value: totals.manuallyCollected },
              ].map((item, i) => (
                <tr key={i} className="border-b border-[#E8D5B0] hover:bg-[#FDF6EE]">
                  <td className="px-5 py-2.5 text-xs font-semibold text-[#5C4A3A]">{item.label}</td>
                  <td className={`px-5 py-2.5 text-right text-xs font-bold ${
                    (item as any).teal ? "text-[#1B8A7A]" :
                    (item as any).gold ? "text-[#92400E]" :
                    "text-[#1A0A0A]"
                  }`}>
                    {fmt(item.value)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#8B1A1A]/10 border-b-2 border-[#8B1A1A]/20">
                <td className="px-5 py-3 text-xs font-extrabold text-[#8B1A1A] uppercase tracking-wider">G TOTAL</td>
                <td className="px-5 py-3 text-right text-sm font-extrabold text-[#8B1A1A]">{fmt(totals.systemTotal)}</td>
              </tr>
              <tr className={totals.manualTotal !== 0 ? "bg-red-50" : "bg-[#1B8A7A]/5"}>
                <td className="px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-[#5C4A3A]">DIFFERENCE</td>
                <td className={`px-5 py-3 text-right text-sm font-extrabold ${totals.manualTotal !== 0 ? "text-red-600" : "text-[#1B8A7A]"}`}>
                  {fmt(totals.manualTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Due Bills Summary — two sections */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl overflow-hidden shadow-md">
          <div className="px-5 py-3 bg-[#8B1A1A] flex items-center gap-2 border-b border-[#C9A227]/30">
            <div className="h-2 w-2 rounded-full bg-[#C9A227]"></div>
            <span className="text-xs font-bold text-white uppercase tracking-widest">Due Bills</span>
          </div>

          {/* Due Created section */}
          <div className="border-b border-[#E8D5B0]">
            <div className="px-4 py-1.5 bg-[#E6F7F4] text-[10px] font-bold text-[#1B8A7A] uppercase tracking-widest">
              Due Created
            </div>
            <div className="overflow-y-auto max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#FDF6EE] border-b border-[#E8D5B0]">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Counter</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Bill No</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Name</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Mobile</th>
                    <th className="px-3 py-1.5 text-right text-[9px] font-bold text-[#9A7E6A] uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D5B0]">
                  {(() => {
                    // Build flat list: prefer dueBills array, fallback to legacy single fields
                    const rows: { counterName: string; billNo: string; name: string; mobile: string; amount: number }[] = [];
                    data.forEach((r) => {
                      const bills = r.dueBills || [];
                      if (bills.length > 0) {
                        bills.forEach((b) => rows.push({ counterName: r.counterName, billNo: b.billNo, name: b.name, mobile: b.mobile, amount: b.amount }));
                      } else if ((r.totalDue || 0) > 0 || r.dueBillNo || r.dueBillName) {
                        rows.push({ counterName: r.counterName, billNo: r.dueBillNo || "", name: r.dueBillName || "", mobile: r.dueBillMobile || "", amount: r.totalDue || 0 });
                      }
                    });
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-xs text-[#9A7E6A]">
                            No due created entries.
                          </td>
                        </tr>
                      );
                    }
                    return rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#FDF6EE]">
                        <td className="px-3 py-1.5 text-xs font-bold text-[#8B1A1A] border-r border-[#E8D5B0]">{r.counterName}</td>
                        <td className="px-3 py-1.5 text-xs text-[#5C4A3A] border-r border-[#E8D5B0]">{r.billNo || "—"}</td>
                        <td className="px-3 py-1.5 text-xs text-[#5C4A3A] border-r border-[#E8D5B0]">{r.name || "—"}</td>
                        <td className="px-3 py-1.5 text-xs text-[#5C4A3A] border-r border-[#E8D5B0]">{r.mobile || "—"}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-bold text-[#1B8A7A]">{fmt(r.amount || 0)}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
                {data.some((r) => (r.totalDue || 0) > 0) && (
                  <tfoot>
                    <tr className="border-t-2 border-[#E8D5B0] bg-[#FDF6EE]">
                      <td colSpan={4} className="px-3 py-2 text-xs font-extrabold text-[#5C4A3A] uppercase">Total</td>
                      <td className="px-3 py-2 text-right text-xs font-extrabold text-[#1B8A7A]">{fmt(totals.totalDue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Manually Collected Bills section — inline-editable for all counters */}
          <div>
            <div className="px-4 py-1.5 bg-[#EEF2F7] text-[10px] font-bold text-[#5C4A3A] uppercase tracking-widest">
              Manually Collected
            </div>
            <div className="overflow-y-auto max-h-[220px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#FDF6EE] border-b border-[#E8D5B0]">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase w-20 border-r border-[#E8D5B0]">Counter</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Bill No</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Name</th>
                    <th className="px-3 py-1.5 text-left text-[9px] font-bold text-[#9A7E6A] uppercase border-r border-[#E8D5B0]">Mobile</th>
                    <th className="px-3 py-1.5 text-right text-[9px] font-bold text-[#9A7E6A] uppercase">Amount</th>
                    {!isReadOnly && <th className="px-1 py-1.5 w-12"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D5B0]">
                  {(() => {
                    return processedData.flatMap((r, rIdx) => {
                      const bills = r.manuallyCollectedBills || [];

                      if (bills.length === 0) {
                        return [(
                          <tr key={`${r.counterId}-empty`} className="hover:bg-[#FDF6EE]">
                            <td className="px-3 py-2 text-xs font-bold text-[#8B1A1A] border-r border-[#E8D5B0]">{r.counterName}</td>
                            <td colSpan={3} className="px-3 py-2 border-r border-[#E8D5B0]">
                              {!isReadOnly ? (
                                <button
                                  onClick={() => handleAddManuallyCollectedBill(rIdx)}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[#5C4A3A]/10 text-[#5C4A3A] hover:bg-[#5C4A3A]/20 border border-[#5C4A3A]/30"
                                >
                                  <Plus size={9} /> Add Bill
                                </button>
                              ) : (
                                <span className="text-xs text-[#9A7E6A] italic">No bills recorded.</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-[#9A7E6A]">—</td>
                            {!isReadOnly && <td></td>}
                          </tr>
                        )];
                      }

                      return bills.map((bill, bIdx) => {
                        const isLastBill = bIdx === bills.length - 1;
                        return (
                          <tr key={`${r.counterId}-${bIdx}`} className="hover:bg-[#FDF6EE]">
                            <td className="px-3 py-1.5 text-xs font-bold text-[#8B1A1A] align-top border-r border-[#E8D5B0]">
                              {bIdx === 0 ? r.counterName : ""}
                            </td>
                            <td className="px-2 py-1 border-r border-[#E8D5B0]">
                              {!isReadOnly ? (
                                <input
                                  type="text"
                                  value={bill.billNo}
                                  onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "billNo", e.target.value)}
                                  placeholder="e.g. BL-001"
                                  className="w-full bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
                                />
                              ) : (
                                <span className="text-xs text-[#5C4A3A]">{bill.billNo || "—"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1 border-r border-[#E8D5B0]">
                              {!isReadOnly ? (
                                <input
                                  type="text"
                                  value={bill.name}
                                  onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "name", e.target.value)}
                                  placeholder="Customer name"
                                  className="w-full bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
                                />
                              ) : (
                                <span className="text-xs text-[#5C4A3A]">{bill.name || "—"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1 border-r border-[#E8D5B0]">
                              {!isReadOnly ? (
                                <input
                                  type="tel"
                                  value={bill.mobile}
                                  onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "mobile", e.target.value)}
                                  placeholder="10-digit"
                                  maxLength={10}
                                  className="w-full bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227]"
                                />
                              ) : (
                                <span className="text-xs text-[#5C4A3A]">{bill.mobile || "—"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              {!isReadOnly ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={bill.amount || ""}
                                  onChange={(e) => handleManuallyCollectedBillChange(rIdx, bIdx, "amount", e.target.value)}
                                  placeholder="0"
                                  className="w-full bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] text-right focus:outline-none focus:border-[#C9A227]"
                                />
                              ) : (
                                <span className="text-xs font-bold text-[#5C4A3A] text-right block">{fmt(bill.amount || 0)}</span>
                              )}
                            </td>
                            {!isReadOnly && (
                              <td className="px-1 py-1">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <button
                                    onClick={() => handleRemoveManuallyCollectedBill(rIdx, bIdx)}
                                    className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50"
                                    title="Remove this bill"
                                  >
                                    <X size={11} />
                                  </button>
                                  {isLastBill && (
                                    <button
                                      onClick={() => handleAddManuallyCollectedBill(rIdx)}
                                      className="text-[#5C4A3A] hover:text-[#1A0A0A] p-0.5 rounded hover:bg-[#EEF2F7]"
                                      title="Add another bill"
                                    >
                                      <Plus size={11} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    });
                  })()}
                </tbody>
                {data.some((r) => (r.manuallyCollected || 0) > 0) && (
                  <tfoot>
                    <tr className="border-t-2 border-[#E8D5B0] bg-[#FDF6EE]">
                      <td colSpan={4} className="px-3 py-2 text-xs font-extrabold text-[#5C4A3A] uppercase">Total MC</td>
                      <td className="px-3 py-2 text-right text-xs font-extrabold text-[#5C4A3A]">{fmt(totals.manuallyCollected)}</td>
                      {!isReadOnly && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
