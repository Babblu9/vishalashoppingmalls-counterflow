import ExcelJS from "exceljs";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

const counterSort = (a: string, b: string) => {
  const n = (s: string) => parseInt(s.replace(/\D/g, "") || "0", 10);
  return n(a) - n(b);
};

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return new Response("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    if (!dateStr) return new Response("date param required", { status: 400 });

    // Validate date format (must be YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return new Response("Invalid date format. Use YYYY-MM-DD", { status: 400 });
    }

    // Validate date is within 45-day window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    if (dateStr < cutoff.toISOString().split("T")[0]) {
      return new Response("Date is outside the 45-day retention window", { status: 400 });
    }

    // Fetch all branches + all reports for this date in one query (eliminates N+1)
    const [branches, allReports, allCounters] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: "asc" } }),
      prisma.dailyReport.findMany({
        where: { businessDate: dateStr },
        include: {
          submittedBy: { select: { name: true } },
          entries: { include: { counter: true } },
        },
      }),
      prisma.counter.findMany({ orderBy: { name: "asc" } }),
    ]);

    // Index reports and counters by branchId for O(1) lookups
    const reportByBranch = new Map(allReports.map((r) => [r.branchId, r]));
    const countersByBranch = new Map<string, typeof allCounters>();
    for (const c of allCounters) {
      if (!countersByBranch.has(c.branchId)) countersByBranch.set(c.branchId, []);
      countersByBranch.get(c.branchId)!.push(c);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Vishala Mall Super Admin";
    workbook.created = new Date();

    // ── Summary sheet ──────────────────────────────────────────────────
    const summary = workbook.addWorksheet("Summary");
    summary.views = [{ showGridLines: true }];

    const headerFill = (argb: string): ExcelJS.Fill => ({
      type: "pattern", pattern: "solid", fgColor: { argb },
    });
    const thinBorder = (): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb: "CBD5E1" } });
    const allBorders = () => ({ top: thinBorder(), bottom: thinBorder(), left: thinBorder(), right: thinBorder() });
    const rupee = "[$₹-4009] #,##0";

    // Title
    summary.mergeCells("A1:H1");
    const t = summary.getCell("A1");
    t.value = "VISHALA SHOPPING MALL — DAILY BACKUP";
    t.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
    t.fill = headerFill("8B1A1A");
    t.alignment = { vertical: "middle", horizontal: "center" };
    summary.getRow(1).height = 36;

    summary.mergeCells("A2:H2");
    const sub = summary.getCell("A2");
    sub.value = `Business Date: ${dateStr}   |   Exported: ${new Date().toLocaleString("en-IN")}`;
    sub.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "5C4A3A" } };
    sub.fill = headerFill("FDF6EE");
    sub.alignment = { vertical: "middle", horizontal: "center" };
    summary.getRow(2).height = 22;

    // Headers
    const sumHeaders = ["Branch", "Status", "Submitted By", "Submitted At", "Total Cash", "Total GPay", "Total Card", "Grand Total"];
    summary.getRow(4).height = 22;
    sumHeaders.forEach((h, i) => {
      const cell = summary.getCell(4, i + 1);
      cell.value = h;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = headerFill("1E293B");
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = allBorders();
    });

    let summaryRow = 5;
    let grandCash = 0, grandGpay = 0, grandCard = 0, grandTotal = 0;

    for (const branch of branches) {
      const report = reportByBranch.get(branch.id) ?? null;

      // ── Per-branch sheet ──────────────────────────────────────────
      const ws = workbook.addWorksheet(branch.name.substring(0, 31));
      ws.views = [{ showGridLines: true }];

      // Title rows
      ws.mergeCells("A1:L1");
      const bt = ws.getCell("A1");
      bt.value = "VISHALA SHOPPING MALL";
      bt.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFF" } };
      bt.fill = headerFill("10B981");
      bt.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(1).height = 36;

      ws.mergeCells("A2:L2");
      const bs = ws.getCell("A2");
      bs.value = `DAILY CLOSING REPORT — ${branch.name.toUpperCase()}   |   BUSINESS DATE: ${dateStr}`;
      bs.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "1F2937" } };
      bs.fill = headerFill("E2E8F0");
      bs.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(2).height = 26;

      const isSubmitted = report?.status === "SUBMITTED";
      const submittedByText = report?.submittedBy?.name || "N/A";
      const submittedAtText = report?.submittedAt
        ? new Date(report.submittedAt).toLocaleString("en-IN") : "N/A";

      const metaStyle = { font: { name: "Segoe UI", size: 9, bold: true }, alignment: { vertical: "middle" as const } };
      const metaValStyle = { font: { name: "Segoe UI", size: 9 }, alignment: { vertical: "middle" as const } };
      ws.getRow(3).height = 20;
      ws.getCell("A3").value = "Status:"; Object.assign(ws.getCell("A3"), metaStyle);
      ws.getCell("B3").value = isSubmitted ? "SUBMITTED & LOCKED" : (report ? "DRAFT" : "NO DATA");
      ws.getCell("B3").font = { name: "Segoe UI", size: 9, bold: true, color: { argb: isSubmitted ? "15803D" : "B45309" } };
      ws.getCell("D3").value = "Submitted By:"; Object.assign(ws.getCell("D3"), metaStyle);
      ws.getCell("E3").value = submittedByText; Object.assign(ws.getCell("E3"), metaValStyle);
      ws.getCell("G3").value = "Submitted At:"; Object.assign(ws.getCell("G3"), metaStyle);
      ws.getCell("H3").value = submittedAtText; Object.assign(ws.getCell("H3"), metaValStyle);
      ws.getCell("J3").value = "Exported On:"; Object.assign(ws.getCell("J3"), metaStyle);
      ws.getCell("K3").value = new Date().toLocaleString("en-IN"); Object.assign(ws.getCell("K3"), metaValStyle);

      // Column headers row 5
      const leftHeaders = [
        { col: "A", label: "C.N" }, { col: "B", label: "CASH" }, { col: "C", label: "G.PAY" },
        { col: "D", label: "CARD" }, { col: "E", label: "DUE\nCreated" }, { col: "F", label: "DUE\nCollected" },
        { col: "G", label: "COUNTER FLOW" }, { col: "H", label: "C.T\nSum" }, { col: "I", label: "+/-" },
      ];
      ws.getRow(5).height = 30;
      leftHeaders.forEach(({ col, label }) => {
        const cell = ws.getCell(`${col}5`);
        cell.value = label;
        cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
        cell.fill = headerFill("1E293B");
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = allBorders();
      });

      ws.mergeCells("K5:L5");
      const scHeader = ws.getCell("K5");
      scHeader.value = "SYSTEM COUNTER"; scHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      scHeader.fill = headerFill("1D4ED8"); scHeader.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells("N5:P5");
      const dcHeader = ws.getCell("N5");
      dcHeader.value = "DUE CREATED DETAILS"; dcHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      dcHeader.fill = headerFill("1B8A7A"); dcHeader.alignment = { vertical: "middle", horizontal: "center" };

      ws.mergeCells("R5:T5");
      const dlHeader = ws.getCell("R5");
      dlHeader.value = "DUE COLLECTED DETAILS"; dlHeader.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      dlHeader.fill = headerFill("92400E"); dlHeader.alignment = { vertical: "middle", horizontal: "center" };

      ws.getRow(6).height = 18;
      ["N6", "O6", "P6"].forEach((addr, i) => {
        const cell = ws.getCell(addr);
        cell.value = ["BILL NO", "NAME", "MOBILE"][i];
        cell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: "1F2937" } };
        cell.fill = headerFill("CCFBF1");
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = allBorders();
      });
      ["R6", "S6", "T6"].forEach((addr, i) => {
        const cell = ws.getCell(addr);
        cell.value = ["BILL NO", "NAME", "MOBILE"][i];
        cell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: "1F2937" } };
        cell.fill = headerFill("FEF3C7");
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = allBorders();
      });

      // Entries data
      let entriesData: any[] = [];
      if (report && report.entries.length > 0) {
        entriesData = report.entries
          .sort((a, b) => counterSort(a.counter.name, b.counter.name))
          .map((e) => {
            const rawDue = e.dueBillsJson as any[];
            const dueBills = Array.isArray(rawDue) && rawDue.length > 0
              ? rawDue
              : (e.dueBillNo || e.dueBillName || e.dueBillMobile || e.dueBillAmount)
                ? [{ billNo: e.dueBillNo || "", name: e.dueBillName || "", mobile: e.dueBillMobile || "", amount: e.dueBillAmount || 0 }]
                : [];
            const rawCol = e.collectedDueBillsJson as any[];
            const colBills = Array.isArray(rawCol) && rawCol.length > 0
              ? rawCol
              : (e.collectedDueBillNo || e.collectedDueBillName || e.collectedDueBillMobile || e.collectedDue)
                ? [{ billNo: e.collectedDueBillNo || "", name: e.collectedDueBillName || "", mobile: e.collectedDueBillMobile || "", amount: e.collectedDue || 0 }]
                : [];
            return {
              counterName: e.counter.name,
              cash: e.cash, gpay: e.gpay, card: e.card,
              totalDue: e.totalDue, collectedDue: e.collectedDue,
              counterFlow: e.counterFlow,
              dueBills,
              colBills,
              // G TOTAL = cash + gpay + card + counterFlow + totalDue (DUE CREATED)
              systemTotal: e.cash + e.gpay + e.card + e.counterFlow + e.totalDue,
              manualTotal: e.manualTotal,
            };
          });
      } else {
        const counters = (countersByBranch.get(branch.id) ?? []).sort((a, b) => counterSort(a.name, b.name));
        entriesData = counters.map((c) => ({
          counterName: c.name, cash: 0, gpay: 0, card: 0,
          totalDue: 0, collectedDue: 0, counterFlow: 0,
          dueBills: [],
          colBills: [],
          systemTotal: 0, manualTotal: 0,
        }));
      }

      const dataStart = 7;
      let currentRow = dataStart;

      entriesData.forEach((entry) => {
        const dueBills = entry.dueBills || [];
        const colBills = entry.colBills || [];
        const rowSpan = Math.max(1, dueBills.length, colBills.length);
        const hasDiff = (entry.manualTotal || 0) !== 0;

        // 1. Render left table data on first row
        const r = currentRow;
        ws.getCell(`A${r}`).value = entry.counterName;
        ws.getCell(`B${r}`).value = entry.cash;
        ws.getCell(`C${r}`).value = entry.gpay;
        ws.getCell(`D${r}`).value = entry.card;
        ws.getCell(`E${r}`).value = entry.totalDue;
        ws.getCell(`F${r}`).value = entry.collectedDue;
        ws.getCell(`G${r}`).value = entry.counterFlow;
        // H: C.T Sum = computed sum (B+C+D+E+G)
        ws.getCell(`H${r}`).value = { formula: `B${r}+C${r}+D${r}+E${r}+G${r}`, result: entry.systemTotal };
        // I: +/- = user-entered discrepancy (manualTotal)
        ws.getCell(`I${r}`).value = entry.manualTotal;

        // 2. Borders and formatting across the rowSpan for left cols A–I
        for (let s = 0; s < rowSpan; s++) {
          const subRow = currentRow + s;
          ws.getRow(subRow).height = 20;

          for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
            const cell = ws.getCell(`${col}${subRow}`);
            cell.border = allBorders();
            cell.font = { name: "Segoe UI", size: 9 };
            cell.alignment = col === "A" ? { vertical: "middle", horizontal: "left" } : { vertical: "middle", horizontal: "right" };
            if (col !== "A") cell.numFmt = rupee;
            if (col === "I" && hasDiff) {
              cell.fill = headerFill("FEE2E2");
              cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "EF4444" } };
            }
          }
        }

        // Merge left-hand cells vertically if rowSpan > 1
        if (rowSpan > 1) {
          for (let colIdx = 1; colIdx <= 9; colIdx++) {
            ws.mergeCells(currentRow, colIdx, currentRow + rowSpan - 1, colIdx);
          }
        }

        // 3. Render sub-bills
        for (let s = 0; s < rowSpan; s++) {
          const subRow = currentRow + s;

          // Due Created details
          if (s < dueBills.length) {
            const bill = dueBills[s];
            ws.getCell(`N${subRow}`).value = bill.billNo || "";
            ws.getCell(`O${subRow}`).value = bill.name || "";
            ws.getCell(`P${subRow}`).value = bill.mobile || "";
          } else {
            ws.getCell(`N${subRow}`).value = "";
            ws.getCell(`O${subRow}`).value = "";
            ws.getCell(`P${subRow}`).value = "";
          }

          for (const col of ["N", "O", "P"]) {
            const cell = ws.getCell(`${col}${subRow}`);
            cell.border = allBorders();
            cell.font = { name: "Segoe UI", size: 9 };
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          }

          // Due Collected details
          if (s < colBills.length) {
            const bill = colBills[s];
            ws.getCell(`R${subRow}`).value = bill.billNo || "";
            ws.getCell(`S${subRow}`).value = bill.name || "";
            ws.getCell(`T${subRow}`).value = bill.mobile || "";
          } else {
            ws.getCell(`R${subRow}`).value = "";
            ws.getCell(`S${subRow}`).value = "";
            ws.getCell(`T${subRow}`).value = "";
          }

          for (const col of ["R", "S", "T"]) {
            const cell = ws.getCell(`${col}${subRow}`);
            cell.border = allBorders();
            cell.font = { name: "Segoe UI", size: 9 };
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          }
        }

        currentRow += rowSpan;
      });

      // Grand total row
      const gtRow = currentRow;
      ws.getRow(gtRow).height = 24;
      ws.getCell(`A${gtRow}`).value = "G.T";
      ws.getCell(`A${gtRow}`).font = { name: "Segoe UI", size: 9, bold: true };
      for (const col of ["B", "C", "D", "E", "F", "G", "H", "I"]) {
        const cell = ws.getCell(`${col}${gtRow}`);
        cell.value = { formula: `SUM(${col}${dataStart}:${col}${gtRow - 1})` };
        cell.font = { name: "Segoe UI", size: 9, bold: true };
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = rupee;
      }
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        const cell = ws.getCell(`${col}${gtRow}`);
        cell.fill = headerFill("F1F5F9");
        cell.border = { top: { style: "medium", color: { argb: "1E293B" } }, bottom: { style: "double", color: { argb: "1E293B" } }, left: thinBorder(), right: thinBorder() };
      }

      // System Counter block
      const scLabels = [
        { label: "CASH",         formula: `SUM(B${dataStart}:B${gtRow - 1})` },
        { label: "G.PAY",        formula: `SUM(C${dataStart}:C${gtRow - 1})` },
        { label: "CARD",         formula: `SUM(D${dataStart}:D${gtRow - 1})` },
        { label: "COUNTER FLOW", formula: `SUM(G${dataStart}:G${gtRow - 1})` },
        { label: "DUE CREATED",  formula: `SUM(E${dataStart}:E${gtRow - 1})` },
      ];
      scLabels.forEach(({ label, formula }, i) => {
        const r = dataStart + i;
        ws.getCell(`K${r}`).value = label;
        ws.getCell(`K${r}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "1E293B" } };
        ws.getCell(`K${r}`).fill = headerFill("EFF6FF");
        ws.getCell(`K${r}`).border = allBorders();
        ws.getCell(`K${r}`).alignment = { vertical: "middle" };
        ws.getCell(`L${r}`).value = { formula };
        ws.getCell(`L${r}`).font = { name: "Segoe UI", size: 9, bold: true };
        ws.getCell(`L${r}`).fill = headerFill("EFF6FF");
        ws.getCell(`L${r}`).border = allBorders();
        ws.getCell(`L${r}`).numFmt = rupee;
        ws.getCell(`L${r}`).alignment = { vertical: "middle", horizontal: "right" };
      });

      const gtScRow = dataStart + scLabels.length;
      ws.getCell(`K${gtScRow}`).value = "G TOTAL";
      ws.getCell(`K${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      ws.getCell(`K${gtScRow}`).fill = headerFill("1D4ED8");
      ws.getCell(`K${gtScRow}`).border = allBorders();
      ws.getCell(`K${gtScRow}`).alignment = { vertical: "middle" };
      ws.getCell(`L${gtScRow}`).value = { formula: `L${dataStart}+L${dataStart+1}+L${dataStart+2}+L${dataStart+3}+L${dataStart+4}` };
      ws.getCell(`L${gtScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      ws.getCell(`L${gtScRow}`).fill = headerFill("1D4ED8");
      ws.getCell(`L${gtScRow}`).border = allBorders();
      ws.getCell(`L${gtScRow}`).numFmt = rupee;
      ws.getCell(`L${gtScRow}`).alignment = { vertical: "middle", horizontal: "right" };

      const diffScRow = gtScRow + 1;
      ws.getCell(`K${diffScRow}`).value = "DIFFERENCE";
      ws.getCell(`K${diffScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      ws.getCell(`K${diffScRow}`).fill = headerFill("7F1D1D");
      ws.getCell(`K${diffScRow}`).border = allBorders();
      ws.getCell(`K${diffScRow}`).alignment = { vertical: "middle" };
      ws.getCell(`L${diffScRow}`).value = { formula: `SUM(I${dataStart}:I${gtRow - 1})` }; // sum of user-entered +/- values
      ws.getCell(`L${diffScRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      ws.getCell(`L${diffScRow}`).fill = headerFill("7F1D1D");
      ws.getCell(`L${diffScRow}`).border = allBorders();
      ws.getCell(`L${diffScRow}`).numFmt = rupee;
      ws.getCell(`L${diffScRow}`).alignment = { vertical: "middle", horizontal: "right" };

      // Column widths
      ws.getColumn("A").width = 16; ws.getColumn("B").width = 13; ws.getColumn("C").width = 13;
      ws.getColumn("D").width = 13; ws.getColumn("E").width = 13; ws.getColumn("F").width = 13;
      ws.getColumn("G").width = 14; ws.getColumn("H").width = 13; ws.getColumn("I").width = 13;
      ws.getColumn("J").width = 3; ws.getColumn("K").width = 18; ws.getColumn("L").width = 14;
      ws.getColumn("M").width = 3; ws.getColumn("N").width = 14; ws.getColumn("O").width = 20; ws.getColumn("P").width = 14;
      ws.getColumn("Q").width = 3; ws.getColumn("R").width = 14; ws.getColumn("S").width = 20; ws.getColumn("T").width = 14;

      // Summary aggregates
      const branchCash = entriesData.reduce((s, e) => s + e.cash, 0);
      const branchGpay = entriesData.reduce((s, e) => s + e.gpay, 0);
      const branchCard = entriesData.reduce((s, e) => s + e.card, 0);
      const branchGrand = entriesData.reduce((s, e) => s + e.systemTotal, 0);
      grandCash += branchCash; grandGpay += branchGpay; grandCard += branchCard; grandTotal += branchGrand;

      const sr = summary.getRow(summaryRow);
      sr.height = 20;
      const rowCells = [
        branch.name,
        report?.status ?? "NO DATA",
        submittedByText,
        submittedAtText,
        branchCash, branchGpay, branchCard, branchGrand,
      ];
      rowCells.forEach((v, i) => {
        const cell = summary.getCell(summaryRow, i + 1);
        cell.value = v;
        cell.font = { name: "Segoe UI", size: 9 };
        cell.border = allBorders();
        if (i >= 4) { cell.numFmt = rupee; cell.alignment = { vertical: "middle", horizontal: "right" }; }
        else cell.alignment = { vertical: "middle" };
        if (i === 1) {
          const status = report?.status ?? "NO DATA";
          cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: status === "SUBMITTED" ? "15803D" : status === "DRAFT" ? "B45309" : "9A7E6A" } };
        }
      });
      summaryRow++;
    }

    // Totals row in summary
    summary.getRow(summaryRow).height = 24;
    summary.getCell(summaryRow, 1).value = "ALL BRANCHES TOTAL";
    summary.getCell(summaryRow, 1).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    [grandCash, grandGpay, grandCard, grandTotal].forEach((v, i) => {
      const cell = summary.getCell(summaryRow, 5 + i);
      cell.value = v; cell.numFmt = rupee;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "right" };
    });
    for (let c = 1; c <= 8; c++) {
      const cell = summary.getCell(summaryRow, c);
      cell.fill = headerFill("8B1A1A");
      cell.border = allBorders();
    }

    summary.getColumn(1).width = 22; summary.getColumn(2).width = 18;
    summary.getColumn(3).width = 20; summary.getColumn(4).width = 22;
    summary.getColumn(5).width = 14; summary.getColumn(6).width = 14;
    summary.getColumn(7).width = 14; summary.getColumn(8).width = 16;

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `vishala_backup_${dateStr}.xlsx`;
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
