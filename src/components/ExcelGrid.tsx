"use client";

import React, { useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Lock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export interface ReportEntryData {
  id?: string;
  counterId: string;
  counterName: string;
  cash: number;
  gpay: number;
  card: number;
  counterFlow: number;
  totalDue: number;
  collectedDue: number;
  dueBillNo?: string;
  dueBillName?: string;
  dueBillAmount?: number;
  manualTotal: number;
  systemTotal?: number;
  difference?: number;
}

interface ExcelGridProps {
  data: ReportEntryData[];
  onChange: (newData: ReportEntryData[]) => void;
  isReadOnly: boolean;
  saveStatus: "draft" | "saving" | "saved" | "error";
}

interface ColumnConfig {
  header: string;
  subHeader?: string;
  key: keyof ReportEntryData | "systemTotal" | "difference";
  type: "text" | "number" | "computed" | "string";
  editable: boolean;
}

const COLUMNS: ColumnConfig[] = [
  { header: "C.N", key: "counterName", type: "text", editable: false },
  { header: "CASH", key: "cash", type: "number", editable: true },
  { header: "G.PAY", key: "gpay", type: "number", editable: true },
  { header: "CARD", key: "card", type: "number", editable: true },
  { header: "DUE", subHeader: "Created", key: "totalDue", type: "number", editable: true },
  { header: "DUE", subHeader: "Collected", key: "collectedDue", type: "number", editable: true },
  { header: "COUNTER FLOW", key: "counterFlow", type: "number", editable: true },
  { header: "C.T", subHeader: "Physical", key: "manualTotal", type: "number", editable: true },
  { header: "+/-", key: "difference", type: "computed", editable: false },
];

export default function ExcelGrid({ data, onChange, isReadOnly, saveStatus }: ExcelGridProps) {
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingValue, setEditingValue] = useState<string>("");
  const editingValueRef = useRef<string>("");

  const processedData = data.map((row) => {
    const systemTotal =
      (row.cash || 0) +
      (row.gpay || 0) +
      (row.card || 0) +
      (row.counterFlow || 0) +
      (row.collectedDue || 0);
    const difference = Math.abs((row.manualTotal || 0) - systemTotal);
    return { ...row, systemTotal, difference };
  });

  const totals = processedData.reduce(
    (acc, row) => {
      acc.cash += row.cash || 0;
      acc.gpay += row.gpay || 0;
      acc.card += row.card || 0;
      acc.counterFlow += row.counterFlow || 0;
      acc.totalDue += row.totalDue || 0;
      acc.collectedDue += row.collectedDue || 0;
      acc.systemTotal += row.systemTotal || 0;
      acc.manualTotal += row.manualTotal || 0;
      acc.difference += row.difference || 0;
      acc.dueBillAmount += row.dueBillAmount || 0;
      return acc;
    },
    { cash: 0, gpay: 0, card: 0, counterFlow: 0, totalDue: 0, collectedDue: 0, systemTotal: 0, manualTotal: 0, difference: 0, dueBillAmount: 0 }
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
                const hasDiff = row.difference !== 0;
                const isExpanded = expandedRows.has(rIdx);

                return (
                  <React.Fragment key={row.counterId}>
                    <tr className={`transition-colors ${hasDiff ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-[#FDF6EE]"}`}>
                      {/* Toggle */}
                      <td className="p-0 text-center border-r border-[#E8D5B0]">
                        <button
                          onClick={() => toggleRow(rIdx)}
                          className="w-full h-full py-2.5 px-1 text-[#C9A227] hover:text-[#8B1A1A] transition-colors"
                          title="Toggle Due Bill"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      </td>

                      {COLUMNS.map((col, cIdx) => {
                        const isColEditable = col.editable && !isReadOnly;
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
                                value={
                                  col.key === "difference"
                                    ? hasDiff ? fmt(value as number) : "₹0"
                                    : fmt(value as number)
                                }
                                readOnly
                                onFocus={() => {
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
                            {col.key === "difference" && hasDiff && (
                              <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(220,38,38,0.8)]"></div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Due Bill sub-row */}
                    {isExpanded && (
                      <tr className="bg-[#FFF8F2] border-b border-[#E8D5B0]">
                        <td></td>
                        <td colSpan={COLUMNS.length} className="px-5 py-3">
                          <div className="flex items-center gap-6 flex-wrap">
                            <span className="text-[10px] font-bold text-[#C9A227] uppercase tracking-widest shrink-0">Due Bill</span>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Bill No:</label>
                              <input
                                type="text"
                                value={row.dueBillNo || ""}
                                onChange={(e) => handleCellChange(rIdx, "dueBillNo", e.target.value, true)}
                                disabled={isReadOnly}
                                placeholder="e.g. BL-001"
                                className="w-28 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Name:</label>
                              <input
                                type="text"
                                value={row.dueBillName || ""}
                                onChange={(e) => handleCellChange(rIdx, "dueBillName", e.target.value, true)}
                                disabled={isReadOnly}
                                placeholder="Customer name"
                                className="w-36 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[#9A7E6A] font-semibold whitespace-nowrap">Amount:</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.dueBillAmount || ""}
                                onChange={(e) => handleCellChange(rIdx, "dueBillAmount", e.target.value)}
                                disabled={isReadOnly}
                                placeholder="0"
                                className="w-24 bg-white border border-[#E8D5B0] rounded px-2 py-1 text-xs text-[#1A0A0A] text-right focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                              />
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
                {[totals.cash, totals.gpay, totals.card, totals.totalDue, totals.collectedDue, totals.counterFlow, totals.manualTotal].map((v, i) => (
                  <td key={i} className="py-3 px-3 text-right text-xs text-white border-r border-[#C9A227]/20">{fmt(v)}</td>
                ))}
                <td className={`py-3 px-3 text-right text-xs font-extrabold border-r border-[#C9A227]/20 ${totals.difference !== 0 ? "text-red-300" : "text-[#C9A227]"}`}>
                  {fmt(totals.difference)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Keyboard hints */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 bg-[#FDF6EE] border-t border-[#E8D5B0] text-[#9A7E6A] text-xs">
          <div className="flex items-center gap-1.5">
            <HelpCircle size={13} className="text-[#C9A227]" />
            <span>Arrow keys to navigate · Enter/Tab to move forward · Click ▶ to expand Due Bill per counter</span>
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
                { label: "DUO (Due Collected)", value: totals.collectedDue },
                { label: "ADV (Due Bill Amt)", value: totals.dueBillAmount, gold: true },
                { label: "MANUAL (C.T)", value: totals.manualTotal },
              ].map((item, i) => (
                <tr key={i} className="border-b border-[#E8D5B0] hover:bg-[#FDF6EE]">
                  <td className="px-5 py-2.5 text-xs font-semibold text-[#5C4A3A]">{item.label}</td>
                  <td className={`px-5 py-2.5 text-right text-xs font-bold ${item.gold ? "text-[#C9A227]" : "text-[#1A0A0A]"}`}>
                    {fmt(item.value)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#8B1A1A]/10 border-b-2 border-[#8B1A1A]/20">
                <td className="px-5 py-3 text-xs font-extrabold text-[#8B1A1A] uppercase tracking-wider">G TOTAL</td>
                <td className="px-5 py-3 text-right text-sm font-extrabold text-[#8B1A1A]">{fmt(totals.systemTotal)}</td>
              </tr>
              <tr className={totals.difference !== 0 ? "bg-red-50" : "bg-[#1B8A7A]/5"}>
                <td className="px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-[#5C4A3A]">DIFFERENCE</td>
                <td className={`px-5 py-3 text-right text-sm font-extrabold ${totals.difference !== 0 ? "text-red-600" : "text-[#1B8A7A]"}`}>
                  {fmt(totals.difference)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Due Bills Summary */}
        <div className="bg-white border border-[#E8D5B0] rounded-xl overflow-hidden shadow-md">
          <div className="px-5 py-3 bg-[#8B1A1A] flex items-center gap-2 border-b border-[#C9A227]/30">
            <div className="h-2 w-2 rounded-full bg-[#C9A227]"></div>
            <span className="text-xs font-bold text-white uppercase tracking-widest">Due Bills</span>
          </div>
          <div className="overflow-y-auto max-h-[260px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#FDF6EE] border-b border-[#E8D5B0]">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-[#9A7E6A] uppercase">Counter</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-[#9A7E6A] uppercase">Bill No</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-[#9A7E6A] uppercase">Name</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-[#9A7E6A] uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D5B0]">
                {data.filter((r) => r.dueBillNo || r.dueBillName || (r.dueBillAmount && r.dueBillAmount > 0)).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-[#9A7E6A]">
                      No due bills entered. Click ▶ on any counter row to add.
                    </td>
                  </tr>
                ) : (
                  data
                    .filter((r) => r.dueBillNo || r.dueBillName || (r.dueBillAmount && r.dueBillAmount > 0))
                    .map((r, i) => (
                      <tr key={i} className="hover:bg-[#FDF6EE]">
                        <td className="px-4 py-2 text-xs font-bold text-[#8B1A1A]">{r.counterName}</td>
                        <td className="px-4 py-2 text-xs text-[#5C4A3A]">{r.dueBillNo || "—"}</td>
                        <td className="px-4 py-2 text-xs text-[#5C4A3A]">{r.dueBillName || "—"}</td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-[#C9A227]">
                          {fmt(r.dueBillAmount || 0)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
              {data.some((r) => r.dueBillAmount && r.dueBillAmount > 0) && (
                <tfoot>
                  <tr className="border-t-2 border-[#E8D5B0] bg-[#FDF6EE]">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-extrabold text-[#5C4A3A] uppercase">Total</td>
                    <td className="px-4 py-2.5 text-right text-xs font-extrabold text-[#C9A227]">
                      {fmt(totals.dueBillAmount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
