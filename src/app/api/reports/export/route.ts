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
        // G TOTAL = cash + gpay + card + counterFlow + totalDue + manuallyCollected
        const systemTotal =
          entry.cash + entry.gpay + entry.card + entry.counterFlow + entry.totalDue + ((entry as any).manuallyCollected ?? 0);

        // Build multiline strings from JSON arrays (fallback to legacy single fields)
        const rawDue = entry.dueBillsJson as any[];
        const dueBills = Array.isArray(rawDue) && rawDue.length > 0 ? rawDue : null;
        const rawMC = (entry as any).manuallyCollectedBillsJson as any[];
        const mcBills = Array.isArray(rawMC) && rawMC.length > 0 ? rawMC : null;

          return {
            counterName: entry.counter.name,
            cash: entry.cash,
            gpay: entry.gpay,
            card: entry.card,
            totalDue: entry.totalDue,
            counterFlow: entry.counterFlow,
            manuallyCollected: (entry as any).manuallyCollected ?? 0,
          // Due Created details — join multiple bills with newline
          dueBillNo:     dueBills ? dueBills.map((b: any) => b.billNo  || "").join("\n") : (entry.dueBillNo   || ""),
          dueBillName:   dueBills ? dueBills.map((b: any) => b.name    || "").join("\n") : (entry.dueBillName || ""),
          dueBillMobile: dueBills ? dueBills.map((b: any) => b.mobile  || "").join("\n") : (entry.dueBillMobile || ""),
          dueBillAmount: dueBills ? dueBills.map((b: any) => b.amount  || 0).join("\n")  : (entry.dueBillAmount || 0),
          // Manually Collected details
          mcBillNo:     mcBills ? mcBills.map((b: any) => b.billNo || "").join("\n") : "",
          mcBillName:   mcBills ? mcBills.map((b: any) => b.name   || "").join("\n") : "",
          mcBillMobile: mcBills ? mcBills.map((b: any) => b.mobile || "").join("\n") : "",
          mcBillAmount: mcBills ? mcBills.map((b: any) => b.amount || 0).join("\n")  : "",
          systemTotal,
          manualTotal: entry.manualTotal,
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
        cash: 0, gpay: 0, card: 0,
        totalDue: 0, counterFlow: 0, manuallyCollected: 0,
        dueBillNo: "", dueBillName: "", dueBillMobile: "", dueBillAmount: 0,
        mcBillNo: "", mcBillName: "", mcBillMobile: "", mcBillAmount: "",
        systemTotal: 0, manualTotal: 0,
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
    // Target layout: A=C.N | B=CASH | C=G.PAY | D=CARD | E=DUE Created | F=COUNTER FLOW | G=MANUALLY TAKEN | H=C.T Sum | I=+/-
    const leftHeaders = [
      { col: "A", label: "C.N" },
      { col: "B", label: "CASH" },
      { col: "C", label: "G.PAY" },
      { col: "D", label: "CARD" },
      { col: "E", label: "DUE\nCreated" },
      { col: "F", label: "COUNTER FLOW" },
      { col: "G", label: "MANUALLY\nTaken" },
      { col: "H", label: "C.T\nSum" },
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
    // Col K–L: SYSTEM COUNTER block
    ws.mergeCells("K5:L5");
    const scHeader = ws.getCell("K5");
    scHeader.value = "SYSTEM COUNTER";
    scHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    scHeader.fill = headerFill("1D4ED8");
    scHeader.alignment = { vertical: "middle", horizontal: "center" };
    scHeader.border = allBorders("334155");

    // Col N–Q: DUE CREATED DETAILS block (BILL NO, NAME, MOBILE, AMOUNT)
    ws.mergeCells("N5:Q5");
    const dcHeader = ws.getCell("N5");
    dcHeader.value = "DUE CREATED DETAILS";
    dcHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    dcHeader.fill = headerFill("1B8A7A");
    dcHeader.alignment = { vertical: "middle", horizontal: "center" };
    dcHeader.border = allBorders("334155");

    // Col S–V: MANUALLY COLLECTED DETAILS block (BILL NO, NAME, MOBILE, AMOUNT)
    ws.mergeCells("S5:V5");
    const mcHeader = ws.getCell("S5");
    mcHeader.value = "MANUALLY COLLECTED DETAILS";
    mcHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    mcHeader.fill = headerFill("4338CA");
    mcHeader.alignment = { vertical: "middle", horizontal: "center" };
    mcHeader.border = allBorders("334155");

    // Sub-headers row 6
    ws.getRow(6).height = 18;
    // Due Created sub-headers (N6, O6, P6, Q6)
    ["N6", "O6", "P6", "Q6"].forEach((addr, i) => {
      const cell = ws.getCell(addr);
      cell.value = ["BILL NO", "NAME", "MOBILE", "AMOUNT"][i];
      cell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: "1F2937" } };
      cell.fill = headerFill("CCFBF1");
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = allBorders("1B8A7A");
    });
    // Manually Collected sub-headers (S6, T6, U6, V6)
    ["S6", "T6", "U6", "V6"].forEach((addr, i) => {
      const cell = ws.getCell(addr);
      cell.value = ["BILL NO", "NAME", "MOBILE", "AMOUNT"][i];
      cell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: "1F2937" } };
      cell.fill = headerFill("E0E7FF");
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = allBorders("4338CA");
    });

    // ── DATA ROWS start at row 7 ─────────────────────────────────────
    const dataStart = 7;

    entriesData.forEach((entry, idx) => {
      const r = dataStart + idx;
      // Dynamic row height: count newline-separated bill lines in due/MC detail cells
      const dueBillLines = entry.dueBillNo ? String(entry.dueBillNo).split("\n").length : 1;
      const mcBillLines  = entry.mcBillNo  ? String(entry.mcBillNo).split("\n").length  : 1;
      const maxBillLines = Math.max(dueBillLines, mcBillLines, 1);
      ws.getRow(r).height = Math.max(20, maxBillLines * 15);

      const hasDiff = (entry.manualTotal || 0) !== 0;

      // Left table data — A=C.N, B=CASH, C=GPAY, D=CARD, E=DUE Created, F=COUNTER FLOW, G=MANUALLY TAKEN
      ws.getCell(`A${r}`).value = entry.counterName;
      ws.getCell(`B${r}`).value = entry.cash;
      ws.getCell(`C${r}`).value = entry.gpay;
      ws.getCell(`D${r}`).value = entry.card;
      ws.getCell(`E${r}`).value = entry.totalDue;
      ws.getCell(`F${r}`).value = entry.counterFlow;
      ws.getCell(`G${r}`).value = entry.manuallyCollected;
      // H: C.T Sum = B+C+D+E+F+G
      ws.getCell(`H${r}`).value = {
        formula: `B${r}+C${r}+D${r}+E${r}+F${r}+G${r}`,
        result: entry.systemTotal,
      };
      // I: +/- = user-entered discrepancy (manualTotal)
      ws.getCell(`I${r}`).value = entry.manualTotal;

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
        if (col === "I" && hasDiff) {
          cell.fill = headerFill("FEE2E2");
          cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "EF4444" } };
        }
      }

      // Due Created detail columns N–Q (BILL NO, NAME, MOBILE, AMOUNT)
      ws.getCell(`N${r}`).value = entry.dueBillNo || "";
      ws.getCell(`O${r}`).value = entry.dueBillName || "";
      ws.getCell(`P${r}`).value = entry.dueBillMobile || "";
      ws.getCell(`Q${r}`).value = entry.dueBillAmount || "";

      for (const col of ["N", "O", "P"]) {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = allBorders("1B8A7A");
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
      // AMOUNT column (Q) — right-aligned number
      ws.getCell(`Q${r}`).border = allBorders("1B8A7A");
      ws.getCell(`Q${r}`).font = { name: "Segoe UI", size: 9 };
      ws.getCell(`Q${r}`).alignment = { vertical: "middle", horizontal: "right", wrapText: true };

      // Manually Collected detail columns S–V (BILL NO, NAME, MOBILE, AMOUNT)
      ws.getCell(`S${r}`).value = entry.mcBillNo || "";
      ws.getCell(`T${r}`).value = entry.mcBillName || "";
      ws.getCell(`U${r}`).value = entry.mcBillMobile || "";
      ws.getCell(`V${r}`).value = entry.mcBillAmount || "";

      for (const col of ["S", "T", "U"]) {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = allBorders("4338CA");
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
      // AMOUNT column (V) — right-aligned
      ws.getCell(`V${r}`).border = allBorders("4338CA");
      ws.getCell(`V${r}`).font = { name: "Segoe UI", size: 9 };
      ws.getCell(`V${r}`).alignment = { vertical: "middle", horizontal: "right", wrapText: true };
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

    // ── SYSTEM COUNTER block (col K:L, rows 7 onwards) ───────────────
    // G TOTAL = CASH + G.PAY + CARD + COUNTER FLOW + DUE CREATED + MANUALLY TAKEN
    // Columns: B=CASH, C=GPAY, D=CARD, E=DUE Created, F=COUNTER FLOW, G=MANUALLY TAKEN
    const scLabels = [
      { label: "CASH",           formula: `SUM(B${dataStart}:B${gtRow - 1})` },
      { label: "G.PAY",          formula: `SUM(C${dataStart}:C${gtRow - 1})` },
      { label: "CARD",           formula: `SUM(D${dataStart}:D${gtRow - 1})` },
      { label: "COUNTER FLOW",   formula: `SUM(F${dataStart}:F${gtRow - 1})` },
      { label: "DUE CREATED",    formula: `SUM(E${dataStart}:E${gtRow - 1})` },
      { label: "MANUALLY TAKEN", formula: `SUM(G${dataStart}:G${gtRow - 1})` },
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
    // G TOTAL = CASH + GPAY + CARD + COUNTER FLOW + DUE CREATED + MANUALLY TAKEN = L[0]+L[1]+L[2]+L[3]+L[4]+L[5]
    const gtScRow = dataStart + scLabels.length; // row after the 6 label rows
    ws.getCell(`K${gtScRow}`).value = "G TOTAL";
    ws.getCell(`K${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`K${gtScRow}`).fill = headerFill("1D4ED8");
    ws.getCell(`K${gtScRow}`).border = allBorders("1D4ED8");
    ws.getCell(`K${gtScRow}`).alignment = { vertical: "middle" };

    ws.getCell(`L${gtScRow}`).value = {
      formula: `L${dataStart}+L${dataStart+1}+L${dataStart+2}+L${dataStart+3}+L${dataStart+4}+L${dataStart+5}`,
    };
    ws.getCell(`L${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`L${gtScRow}`).fill = headerFill("1D4ED8");
    ws.getCell(`L${gtScRow}`).border = allBorders("1D4ED8");
    ws.getCell(`L${gtScRow}`).numFmt = rupee;
    ws.getCell(`L${gtScRow}`).alignment = { vertical: "middle", horizontal: "right" };

    // DIFFERENCE row = SUM of user-entered +/- values (col I)
    const diffScRow = gtScRow + 1;
    ws.getCell(`K${diffScRow}`).value = "DIFFERENCE";
    ws.getCell(`K${diffScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    ws.getCell(`K${diffScRow}`).fill = headerFill("7F1D1D");
    ws.getCell(`K${diffScRow}`).border = allBorders("7F1D1D");
    ws.getCell(`K${diffScRow}`).alignment = { vertical: "middle" };

    ws.getCell(`L${diffScRow}`).value = {
      formula: `SUM(I${dataStart}:I${gtRow - 1})`, // sum of all user-entered +/- values (col I)
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
    ws.getColumn("F").width = 14;  // COUNTER FLOW
    ws.getColumn("G").width = 14;  // MANUALLY TAKEN
    ws.getColumn("H").width = 13;  // C.T Sum
    ws.getColumn("I").width = 13;  // +/-
    ws.getColumn("J").width = 3;   // spacer
    ws.getColumn("K").width = 18;  // SC labels
    ws.getColumn("L").width = 14;  // SC values
    ws.getColumn("M").width = 3;   // spacer
    ws.getColumn("N").width = 14;  // Created Bill No
    ws.getColumn("O").width = 20;  // Created Name
    ws.getColumn("P").width = 14;  // Created Mobile
    ws.getColumn("Q").width = 13;  // Created Amount
    ws.getColumn("R").width = 3;   // spacer
    ws.getColumn("S").width = 14;  // MC Bill No
    ws.getColumn("T").width = 20;  // MC Name
    ws.getColumn("U").width = 14;  // MC Mobile
    ws.getColumn("V").width = 13;  // MC Amount

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
