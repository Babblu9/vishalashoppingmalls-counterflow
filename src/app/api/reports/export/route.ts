import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

// Numeric sort for counter names like "Counter 1", "Counter 10", etc.
const counterSort = (a: string, b: string) => {
  const n = (s: string) => parseInt(s.replace(/\D/g, "") || "0", 10);
  return n(a) - n(b);
};

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const dateStr = searchParams.get("date");

    if (!branchId || !dateStr) {
      return new Response("Branch ID and Date are required", { status: 400 });
    }

    // Admins can only export their own branch
    if (session.role === "ADMIN" && session.branchId !== branchId) {
      return new Response("Forbidden: You can only export your own branch", { status: 403 });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return new Response("Branch not found", { status: 404 });
    }

    const report = await prisma.dailyReport.findFirst({
      where: { branchId, businessDate: dateStr },
      include: {
        submittedBy: { select: { name: true } },
        entries: {
          include: { counter: true },
          orderBy: { counter: { name: "asc" } },
        },
      },
    });

    let entriesData: any[] = [];
    let isSubmitted = false;
    let submittedByText = "N/A";
    let submittedAtText = "N/A";

    if (report) {
      isSubmitted = report.status === "SUBMITTED";
      submittedByText = report.submittedBy?.name || "System";
      submittedAtText = report.submittedAt
        ? new Date(report.submittedAt).toLocaleString("en-IN")
        : "N/A";

      entriesData = report.entries
        .sort((a, b) => counterSort(a.counter.name, b.counter.name))
        .map((entry) => {
        const systemTotal =
          entry.cash + entry.gpay + entry.card + entry.counterFlow + entry.collectedDue;
        const difference = entry.manualTotal - systemTotal;
        return {
          counterName: entry.counter.name,
          cash: entry.cash,
          gpay: entry.gpay,
          card: entry.card,
          totalDue: entry.totalDue,
          collectedDue: entry.collectedDue,
          counterFlow: entry.counterFlow,
          dueBillNo: entry.dueBillNo || "",
          dueBillName: entry.dueBillName || "",
          dueBillAmount: entry.dueBillAmount,
          systemTotal,
          manualTotal: entry.manualTotal,
          difference,
        };
      });
    } else {
      const counters = await prisma.counter.findMany({
        where: { branchId },
        orderBy: { name: "asc" },
      });
      entriesData = counters
        .sort((a, b) => counterSort(a.name, b.name))
        .map((counter) => ({
        counterName: counter.name,
        cash: 0,
        gpay: 0,
        card: 0,
        totalDue: 0,
        collectedDue: 0,
        counterFlow: 0,
        dueBillNo: "",
        dueBillName: "",
        dueBillAmount: 0,
        systemTotal: 0,
        manualTotal: 0,
        difference: 0,
      }));
    }

    // ── Build workbook ──────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Daily Closing Report");
    ws.views = [{ showGridLines: true }];

    // Helper styles
    const headerFill = (argb: string): ExcelJS.Fill => ({
      type: "pattern", pattern: "solid", fgColor: { argb },
    });
    const thinBorder = (argb = "CBD5E1"): Partial<ExcelJS.Border> => ({
      style: "thin", color: { argb },
    });
    const allBorders = (argb = "CBD5E1") => ({
      top: thinBorder(argb),
      bottom: thinBorder(argb),
      left: thinBorder(argb),
      right: thinBorder(argb),
    });
    const rupee = "[$₹-4009] #,##0";

    // ── ROW 1: Title banner (A1:L1) ─────────────────────────────────
    ws.mergeCells("A1:L1");
    const titleCell = ws.getCell("A1");
    titleCell.value = "VISHALA SHOPPING MALL";
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFF" } };
    titleCell.fill = headerFill("10B981");
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 36;

    // ── ROW 2: Subtitle (A2:L2) ──────────────────────────────────────
    ws.mergeCells("A2:L2");
    const subCell = ws.getCell("A2");
    subCell.value = `DAILY CLOSING REPORT — ${branch.name.toUpperCase()}   |   BUSINESS DATE: ${dateStr}`;
    subCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "1F2937" } };
    subCell.fill = headerFill("E2E8F0");
    subCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(2).height = 26;

    // ── ROW 3: Meta info ─────────────────────────────────────────────
    ws.getRow(3).height = 20;
    const metaStyle = { font: { name: "Segoe UI", size: 9, bold: true }, alignment: { vertical: "middle" as const } };
    const metaValStyle = { font: { name: "Segoe UI", size: 9 }, alignment: { vertical: "middle" as const } };

    ws.getCell("A3").value = "Status:";      Object.assign(ws.getCell("A3"), metaStyle);
    ws.getCell("B3").value = isSubmitted ? "SUBMITTED & LOCKED" : "DRAFT (OPEN)";
    ws.getCell("B3").font = { name: "Segoe UI", size: 9, bold: true, color: { argb: isSubmitted ? "15803D" : "B45309" } };

    ws.getCell("D3").value = "Submitted By:"; Object.assign(ws.getCell("D3"), metaStyle);
    ws.getCell("E3").value = submittedByText;  Object.assign(ws.getCell("E3"), metaValStyle);

    ws.getCell("G3").value = "Submitted At:"; Object.assign(ws.getCell("G3"), metaStyle);
    ws.getCell("H3").value = submittedAtText;  Object.assign(ws.getCell("H3"), metaValStyle);

    ws.getCell("J3").value = "Exported On:";  Object.assign(ws.getCell("J3"), metaStyle);
    ws.getCell("K3").value = new Date().toLocaleString("en-IN"); Object.assign(ws.getCell("K3"), metaValStyle);

    // ── ROW 5: Left table column headers (A–I) ───────────────────────
    // A: C.N | B: CASH | C: G.PAY | D: CARD | E: DUE CREATED | F: DUE COLLECTED | G: COUNTER FLOW | H: C.T | I: +/-
    const leftHeaders = [
      { col: "A", label: "C.N" },
      { col: "B", label: "CASH" },
      { col: "C", label: "G.PAY" },
      { col: "D", label: "CARD" },
      { col: "E", label: "DUE\nCreated" },
      { col: "F", label: "DUE\nCollected" },
      { col: "G", label: "COUNTER FLOW" },
      { col: "H", label: "C.T Physical" },
      { col: "I", label: "+/-" },
    ];

    ws.getRow(5).height = 30;
    leftHeaders.forEach(({ col, label }) => {
      const cell = ws.getCell(`${col}5`);
      cell.value = label;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = headerFill("1E293B");
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = allBorders("334155");
    });

    // ── Right section headers ────────────────────────────────────────
    // Col K: SYSTEM COUNTER block | Col L: values
    // Col N: DUE BILL block
    ws.mergeCells("K5:L5");
    const scHeader = ws.getCell("K5");
    scHeader.value = "SYSTEM COUNTER";
    scHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    scHeader.fill = headerFill("1D4ED8");
    scHeader.alignment = { vertical: "middle", horizontal: "center" };
    scHeader.border = allBorders("334155");

    ws.mergeCells("N5:P5");
    const dbHeader = ws.getCell("N5");
    dbHeader.value = "DUE BILL";
    dbHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    dbHeader.fill = headerFill("92400E");
    dbHeader.alignment = { vertical: "middle", horizontal: "center" };
    dbHeader.border = allBorders("334155");

    // Sub-headers for DUE BILL cols
    ws.getRow(6).height = 18;
    ["N6", "O6", "P6"].forEach((addr, i) => {
      const cell = ws.getCell(addr);
      cell.value = ["BILL NO", "NAME", "AMOUNT"][i];
      cell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: "1F2937" } };
      cell.fill = headerFill("FEF3C7");
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = allBorders("D97706");
    });

    // ── DATA ROWS start at row 7 ─────────────────────────────────────
    const dataStart = 7;

    entriesData.forEach((entry, idx) => {
      const r = dataStart + idx;
      ws.getRow(r).height = 20;

      const hasDiff = entry.difference !== 0;

      // Left table data
      ws.getCell(`A${r}`).value = entry.counterName;
      ws.getCell(`B${r}`).value = entry.cash;
      ws.getCell(`C${r}`).value = entry.gpay;
      ws.getCell(`D${r}`).value = entry.card;
      ws.getCell(`E${r}`).value = entry.totalDue;
      ws.getCell(`F${r}`).value = entry.collectedDue;
      ws.getCell(`G${r}`).value = entry.counterFlow;

      // H: C.T Physical (manual total entered by user)
      ws.getCell(`H${r}`).value = entry.manualTotal;

      // I: +/- difference = ABS(C.T - system total)
      ws.getCell(`I${r}`).value = {
        formula: `ABS(H${r}-(B${r}+C${r}+D${r}+F${r}+G${r}))`,
        result: Math.abs(entry.difference),
      };

      // Borders and formatting for left table cols A–I
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = allBorders();
        cell.font = { name: "Segoe UI", size: 9 };
        if (col === "A") {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = rupee;
        }
        // Highlight difference cell (col I = +/-)
        if (col === "I" && hasDiff) {
          cell.fill = headerFill("FEE2E2");
          cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "EF4444" } };
        }
      }

      // Due bill columns N-P for this row
      ws.getCell(`N${r}`).value = entry.dueBillNo || "";
      ws.getCell(`O${r}`).value = entry.dueBillName || "";
      ws.getCell(`P${r}`).value = entry.dueBillAmount || 0;

      for (const col of ["N", "O", "P"]) {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = allBorders("D97706");
        cell.font = { name: "Segoe UI", size: 9 };
        if (col === "P") {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = rupee;
        } else {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      }
    });

    // ── GRAND TOTAL row ──────────────────────────────────────────────
    const gtRow = dataStart + entriesData.length;
    ws.getRow(gtRow).height = 24;
    ws.getCell(`A${gtRow}`).value = "G.T";
    ws.getCell(`A${gtRow}`).font = { name: "Segoe UI", size: 9, bold: true };
    ws.getCell(`A${gtRow}`).alignment = { vertical: "middle", horizontal: "left" };

    for (const col of ["B", "C", "D", "E", "F", "G", "H", "I"]) {
      const cell = ws.getCell(`${col}${gtRow}`);
      cell.value = { formula: `SUM(${col}${dataStart}:${col}${gtRow - 1})` };
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "1E293B" } };
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = rupee;
    }

    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
      const cell = ws.getCell(`${col}${gtRow}`);
      cell.fill = headerFill("F1F5F9");
      cell.border = {
        top: { style: "medium", color: { argb: "1E293B" } },
        bottom: { style: "double", color: { argb: "1E293B" } },
        left: thinBorder(),
        right: thinBorder(),
      };
    }

    // Due bill total
    ws.getCell(`N${gtRow}`).value = "TOTAL";
    ws.getCell(`N${gtRow}`).font = { name: "Segoe UI", size: 9, bold: true };
    ws.getCell(`P${gtRow}`).value = { formula: `SUM(P${dataStart}:P${gtRow - 1})` };
    ws.getCell(`P${gtRow}`).numFmt = rupee;
    ws.getCell(`P${gtRow}`).font = { name: "Segoe UI", size: 9, bold: true };
    ws.getCell(`P${gtRow}`).alignment = { vertical: "middle", horizontal: "right" };

    for (const col of ["N", "O", "P"]) {
      const cell = ws.getCell(`${col}${gtRow}`);
      cell.fill = headerFill("FEF3C7");
      cell.border = allBorders("D97706");
    }

    // ── SYSTEM COUNTER block (col K:L, rows 7 onwards) ───────────────
    const scLabels = [
      { label: "CASH",          formula: `SUM(B${dataStart}:B${gtRow - 1})` },
      { label: "G.PAY",         formula: `SUM(C${dataStart}:C${gtRow - 1})` },
      { label: "CARD",          formula: `SUM(D${dataStart}:D${gtRow - 1})` },
      { label: "DUO (Due Col.)", formula: `SUM(F${dataStart}:F${gtRow - 1})` },
      { label: "ADV (Bill Amt)", formula: `SUM(P${dataStart}:P${gtRow - 1})` },
      { label: "MANUAL",        formula: `SUM(H${dataStart}:H${gtRow - 1})` },
    ];

    scLabels.forEach(({ label, formula }, i) => {
      const r = dataStart + i;
      ws.getCell(`K${r}`).value = label;
      ws.getCell(`K${r}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "1E293B" } };
      ws.getCell(`K${r}`).fill = headerFill("EFF6FF");
      ws.getCell(`K${r}`).border = allBorders("93C5FD");
      ws.getCell(`K${r}`).alignment = { vertical: "middle" };

      ws.getCell(`L${r}`).value = { formula };
      ws.getCell(`L${r}`).font = { name: "Segoe UI", size: 9, bold: true };
      ws.getCell(`L${r}`).fill = headerFill("EFF6FF");
      ws.getCell(`L${r}`).border = allBorders("93C5FD");
      ws.getCell(`L${r}`).numFmt = rupee;
      ws.getCell(`L${r}`).alignment = { vertical: "middle", horizontal: "right" };
    });

    // G TOTAL row in system counter
    const gtScRow = dataStart + scLabels.length;
    ws.getCell(`K${gtScRow}`).value = "G TOTAL";
    ws.getCell(`K${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`K${gtScRow}`).fill = headerFill("1D4ED8");
    ws.getCell(`K${gtScRow}`).border = allBorders("1D4ED8");
    ws.getCell(`K${gtScRow}`).alignment = { vertical: "middle" };

    ws.getCell(`L${gtScRow}`).value = {
      formula: `SUM(L${dataStart}:L${dataStart + scLabels.length - 1})-L${dataStart + 5}`, // sum minus MANUAL row (it's not part of system total)
    };
    // Actually G TOTAL = CASH+GPAY+CARD+DUO+ADV (L7:L11) not MANUAL
    ws.getCell(`L${gtScRow}`).value = {
      formula: `L${dataStart}+L${dataStart+1}+L${dataStart+2}+L${dataStart+3}+L${dataStart+4}`,
    };
    ws.getCell(`L${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`L${gtScRow}`).fill = headerFill("1D4ED8");
    ws.getCell(`L${gtScRow}`).border = allBorders("1D4ED8");
    ws.getCell(`L${gtScRow}`).numFmt = rupee;
    ws.getCell(`L${gtScRow}`).alignment = { vertical: "middle", horizontal: "right" };

    // DIFFERENCE row
    const diffScRow = gtScRow + 1;
    ws.getCell(`K${diffScRow}`).value = "DIFFERENCE";
    ws.getCell(`K${diffScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`K${diffScRow}`).fill = headerFill("7F1D1D");
    ws.getCell(`K${diffScRow}`).border = allBorders("7F1D1D");
    ws.getCell(`K${diffScRow}`).alignment = { vertical: "middle" };

    ws.getCell(`L${diffScRow}`).value = {
      formula: `ABS(L${dataStart + 5}-L${gtScRow})`, // ABS(MANUAL - G TOTAL)
    };
    ws.getCell(`L${diffScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`L${diffScRow}`).fill = headerFill("7F1D1D");
    ws.getCell(`L${diffScRow}`).border = allBorders("7F1D1D");
    ws.getCell(`L${diffScRow}`).numFmt = rupee;
    ws.getCell(`L${diffScRow}`).alignment = { vertical: "middle", horizontal: "right" };

    // ── Column widths ─────────────────────────────────────────────────
    ws.getColumn("A").width = 16;  // C.N
    ws.getColumn("B").width = 13;  // CASH
    ws.getColumn("C").width = 13;  // G.PAY
    ws.getColumn("D").width = 13;  // CARD
    ws.getColumn("E").width = 13;  // DUE Created
    ws.getColumn("F").width = 13;  // DUE Collected
    ws.getColumn("G").width = 14;  // COUNTER FLOW
    ws.getColumn("H").width = 13;  // C.T Physical
    ws.getColumn("I").width = 13;  // +/-
    ws.getColumn("J").width = 3;   // spacer
    ws.getColumn("K").width = 18;  // SC labels
    ws.getColumn("L").width = 14;  // SC values
    ws.getColumn("M").width = 3;   // spacer
    ws.getColumn("N").width = 14;  // Bill No
    ws.getColumn("O").width = 20;  // Name
    ws.getColumn("P").width = 14;  // Amount

    // ── Build buffer and respond ──────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const cleanBranchName = branch.name.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `closing_report_${cleanBranchName}_${dateStr}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
