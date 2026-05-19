import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const EmployeeView = ({
  departmentName,
  departmentId,   // dept_id from the parent — used for signatory fetch (mirrors ReportPreview)
  batchId,
  onBack,
  onSelectEmployee,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null); // "Fetching 3 / 20..."

  const pdfDropdownRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // ── Fetch Employees ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        if (!departmentName || !batchId) return;
        setLoading(true);
        const res = await fetch(
          `${API_BASE_URL}/api/dtr/employees?department=${encodeURIComponent(
            departmentName,
          )}&batch_id=${batchId}`,
        );
        const data = await res.json();
        // Sort A-Z
        const sorted = (data || [])
          .slice()
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        setEmployees(sorted);
      } catch (err) {
        console.error("Failed to fetch employees:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, [departmentName, batchId]);

  // ── Close PDF dropdown when clicking outside ───────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pdfDropdownRef.current && !pdfDropdownRef.current.contains(e.target)) {
        setShowPdfOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.id?.toString().includes(searchTerm),
  );

  // ── Export XLSX (unchanged — hits backend) ─────────────────────────────────
  const handleExportXLSX = async () => {
    try {
      setExportingXlsx(true);
      const response = await fetch(
        `${API_BASE_URL}/api/dtr/export-department-xlsx?department=${encodeURIComponent(
          departmentName,
        )}&batch_id=${batchId}`,
      );
      if (!response.ok) throw new Error("Failed to export XLSX");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${departmentName}_employees.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExportingXlsx(false);
    }
  };

  // ── Shared date/time helpers (identical to ReportPreview) ─────────────────

  const parseDate = (value) => {
    if (!value) return null;
    const parts = String(value).trim().split(/[/-]/);
    if (parts.length !== 3) return null;
    const month = Number(parts[0]);
    const day   = Number(parts[1]);
    let   year  = Number(parts[2]);
    if (!month || !day || !year) return null;
    if (year < 100) year += 2000;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateIso = (date) => {
    if (!date) return "-";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  };

  const getDateRange = (rows) => {
    const validDates = rows
      .map((r) => parseDate(r.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (!validDates.length) return { monthYear: "-", rangeText: "-" };
    const first = validDates[0];
    const last  = validDates[validDates.length - 1];
    return {
      monthYear: first.toLocaleString("en-US", { month: "long", year: "numeric" }),
      rangeText: `${formatDateIso(first)} - ${formatDateIso(last)}`,
    };
  };

  // Strip seconds/AM-PM suffix: "08:30:00 AM" → "08:30"
  const formatTimeShort = (timeStr) => {
    if (!timeStr || timeStr === "-" || timeStr === "--") return "";
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    return `${parts[0]}:${parts[1].split(" ")[0]}`;
  };

  const formatDateForOneColumn = (value) => {
    const parsed = parseDate(value);
    if (!parsed) return value || "";
    return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
  };

  const formatTimeForOneColumn = (value) => {
    if (!value) return "";
    const text = String(value).trim();
    if (!text || text === "-" || text === "--") return "";
    const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
    if (!match) return text;
    let hours = Number(match[1]);
    const minutes = match[2];
    const suffix  = match[3]?.toUpperCase();
    if (suffix === "AM" && hours === 12) hours = 0;
    else if (suffix === "PM" && hours !== 12) hours += 12;
    const twelveHour = ((hours + 11) % 12) + 1;
    return `${twelveHour}:${minutes}`;
  };

  // ── 2-Column: drawDTRForm — exactly mirrors ReportPreview ─────────────────
  const drawDTRForm = (doc, startX, width, dtrRows, empObj, signatory) => {
    const margin       = 3;          // matches ReportPreview
    const centerX      = startX + width / 2;
    const contentWidth = width - margin * 2;
    const zoom         = 1.4;        // matches ReportPreview
    const z            = zoom;
    const { monthYear } = getDateRange(dtrRows);

    // --- 1. Header ---
    doc.setFont("times", "bold");
    doc.setFontSize(12 * z);
    doc.text("Monthly Daily Time Record", centerX, 12, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(9 * z);
    doc.text(`For the Month of ${String(monthYear).toUpperCase()}`, centerX, 18, { align: "center" });

    // --- 2. Identity ---
    doc.setLineWidth(0.1);
    doc.line(startX + margin, 21, startX + width - margin, 21);

    doc.setFont("times", "bold");
    doc.setFontSize(8 * z);
    doc.text(`Name: ${empObj?.name?.toUpperCase() || "-"}`, startX + margin, 26);

    doc.setFont("times", "normal");
    doc.setFontSize(7.5 * z);
    doc.text(`Dept / Office: ${departmentName || "-"}`, startX + margin, 31);

    doc.line(startX + margin, 33, startX + width - margin, 33);

    // --- 3. Table header (2 rows — group + IN/OUT) ---
    const tableHeader = [
      [
        { content: "No / Day", rowSpan: 2, styles: { valign: "middle", halign: "left" } },
        { content: "AM", colSpan: 2 },
        { content: "PM", colSpan: 2 },
        { content: "OT", colSpan: 2 },
      ],
      ["IN", "OUT", "IN", "OUT", "IN", "OUT"],
    ];

    // --- 4. 31-row data ---
    const daysArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const rows = [];
    for (let i = 1; i <= 31; i++) {
      const dayNum = String(i).padStart(2, "0");
      const record = dtrRows.find((r) => {
        const d = parseDate(r.date);
        return d && d.getDate() === i;
      });

      let dayName = record?.day || "";
      if (!dayName && dtrRows.length > 0) {
        const firstDate = parseDate(dtrRows[0].date);
        if (firstDate) {
          const d = new Date(firstDate.getFullYear(), firstDate.getMonth(), i);
          dayName = daysArr[d.getDay()];
        }
      }

      rows.push([
        `${dayNum}    ${dayName}`,   // 4 spaces — matches ReportPreview exactly
        formatTimeShort(record?.amIn),
        formatTimeShort(record?.amOut),
        formatTimeShort(record?.pmIn),
        formatTimeShort(record?.pmOut),
        formatTimeShort(record?.otIn),
        formatTimeShort(record?.otOut),
      ]);
    }

    autoTable(doc, {
      startY: 33,
      head: tableHeader,
      body: rows,
      margin: { left: startX + margin },
      tableWidth: contentWidth,
      theme: "plain",
      styles: {
        fontSize: 8 * z,
        cellPadding: 0.8,
        halign: "center",
        textColor: [0, 0, 0],
        font: "times",
      },
      headStyles: {
        fillColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { halign: "left", cellWidth: 20 },
      },
      didDrawCell: (data) => {
        doc.setLineWidth(0.1);
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height,
        );
      },
    });

    // Capture finalY immediately — before any subsequent autoTable call can overwrite
    // doc.lastAutoTable (critical when drawing left then right half on the same page).
    const finalTableY = doc.lastAutoTable.finalY;

    // --- 5. Footer / Signature ---
    const footerY = finalTableY + 8;   // matches ReportPreview

    doc.line(startX + margin + 5, footerY, startX + width - margin - 5, footerY);
    doc.setFont("times", "normal");
    doc.setFontSize(8 * z);
    doc.text("EMPLOYEE SIGNATURE", centerX, footerY + 4, { align: "center" }); // +4 matches RP

    const sigY = footerY + 14;  // matches ReportPreview (was +18)
    doc.line(startX + margin + 5, sigY, startX + width - margin - 5, sigY);

    doc.setFont("times", "bold");
    doc.setFontSize(9 * z);
    const bossName =
      signatory?.head_name?.toUpperCase() ||
      "CAPT JOHN RONALD A MANGAHAS PN(GSC)";
    doc.text(bossName, centerX, sigY + 4, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(8 * z);
    const bossPos = signatory?.position || "AC of S for Plans and Programs, MA5, PMA";
    doc.text(bossPos, centerX, sigY + 8, { align: "center" });

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.setFontSize(7.5 * z);
    doc.text(`dateprint: ${dateStr}`, startX + margin, sigY + 14);  // +14 matches RP
    doc.text("Page 1 of 1", startX + width - margin, sigY + 14, { align: "right" });
  };

  // ── 1-Column: header, table, footer — exactly mirrors ReportPreview ────────

  const drawOneColumnHeader = (doc, dtrRows, empObj) => {
    const validDates = dtrRows
      .map((r) => parseDate(r.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const monthYear = validDates.length
      ? validDates[0].toLocaleString("en-US", { month: "long", year: "numeric" })
      : "-";

    const employeeName = empObj?.name || "";
    const employeeId   = empObj?.id   || "";

    doc.setLineWidth(0.4);
    doc.line(18, 13, 192, 13);

    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text("MONTHLY DAILY TIME RECORD -- DRAFT COPY", 105, 18, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(`For the Month of ${String(monthYear).toUpperCase()}`, 105, 23, { align: "center" });

    doc.setLineWidth(0.25);
    doc.line(18, 25.2, 192, 25.2);

    doc.setFontSize(8);
    doc.text(`Employee Name: ${employeeName || "-"}`, 19, 29);
    doc.text(`Department: ${departmentName || "-"}`, 105, 29, { align: "center" });
    doc.text(`BIO ID NO: ${employeeId || "-"}`, 192, 29, { align: "right" });

    doc.setLineWidth(0.25);
    doc.line(18, 31.8, 192, 31.8);
  };

  const drawOneColumnTable = (doc, dtrRows) => {
    const marginLeft = 18;
    const tableWidth = 174;  // matches ReportPreview

    autoTable(doc, {
      startY: 35,
      head: [[
        { content: "Date", styles: { halign: "left" } },
        "Day",
        "AM IN",
        "AM OUT",
        "PM IN",
        "PM OUT",
        "OT IN",
        "OT OUT",
      ]],
      body: dtrRows.map((row) => [
        formatDateForOneColumn(row.date),
        row.day || "",
        formatTimeForOneColumn(row.amIn  || row.am_in),
        formatTimeForOneColumn(row.amOut || row.am_out),
        formatTimeForOneColumn(row.pmIn  || row.pm_in),
        formatTimeForOneColumn(row.pmOut || row.pm_out),
        formatTimeForOneColumn(row.otIn  || row.ot_in),
        formatTimeForOneColumn(row.otOut || row.ot_out),
      ]),
      margin: { left: marginLeft },
      tableWidth,
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: 1.2,
        halign: "center",
        valign: "middle",
        lineColor: 0,
        lineWidth: 0,
        font: "times",
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: 0,
        fontStyle: "bold",
        lineColor: 0,
        lineWidth: 0,
      },
      bodyStyles: {
        lineColor: 0,
        lineWidth: 0,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: 24.5 },
        1: { cellWidth: 14.5 },
        2: { cellWidth: 20.5 },
        3: { cellWidth: 20.5 },
        4: { cellWidth: 20.5 },
        5: { cellWidth: 20.5 },
        6: { cellWidth: 20.5 },
        7: { cellWidth: 20.5 },
      },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === 0) {
          data.cell.styles.halign = "left";
        }
      },
      didDrawCell: (data) => {
        if (
          (data.section === "head" || data.section === "body") &&
          data.column.index === data.table.columns.length - 1
        ) {
          const y = data.cell.y + data.cell.height;
          doc.setLineWidth(0.2);
          doc.line(marginLeft, y, marginLeft + tableWidth, y);
        }
      },
    });
  };

  const drawOneColumnSignatures = (doc, dtrRows, empObj, signatory) => {
    const validDates = dtrRows
      .map((r) => parseDate(r.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const monthYear = validDates.length
      ? validDates[0].toLocaleString("en-US", { month: "long", year: "numeric" })
      : "-";

    const finalY = doc.lastAutoTable?.finalY || 35;

    // Note block — matches ReportPreview exactly
    const noteY = finalY + 6;
    const note =
      "SUBMIT DRAFT COPY OF DTR AT OMAI for validation/approval of entries. Attach original QB form and mission order in your field copy only. Draft Copy must also be signed by your DEPT. HEAD / SUPERVISOR prior to submission to OMAI.";
    const noteLines = doc.splitTextToSize(note, 160);
    doc.setFont("times", "bold");
    doc.setFontSize(7);
    doc.text(noteLines, 18, noteY);

    const extraSignatureSpace = 18;
    let signatureY = noteY + noteLines.length * 3.5 + 10 + extraSignatureSpace;

    if (signatureY > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      // Redraw header on overflow page
      doc.setLineWidth(0.4);
      doc.line(18, 13, 192, 13);
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.text("MONTHLY DAILY TIME RECORD -- DRAFT COPY", 105, 18, { align: "center" });
      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.text(`For the Month of ${String(monthYear).toUpperCase()}`, 105, 23, { align: "center" });
      doc.setLineWidth(0.25);
      doc.line(18, 25.2, 192, 25.2);
      doc.setFontSize(8);
      doc.text(`Employee Name: ${empObj?.name || "-"}`, 19, 29);
      doc.text(`Department: ${departmentName || "-"}`, 105, 29, { align: "center" });
      doc.text(`BIO ID NO: ${empObj?.id || "-"}`, 192, 29, { align: "right" });
      doc.setLineWidth(0.25);
      doc.line(18, 31.8, 192, 31.8);
      signatureY = 52;
    }

    // Certified / Approved labels
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.text("Certified True and Correct", 48, signatureY - 8, { align: "center" });
    doc.text("Approved by", 152, signatureY - 8, { align: "center" });

    const leftStart = 26, leftEnd = 86;
    const rightStart = 124, rightEnd = 184;

    doc.setLineWidth(0.3);
    doc.line(leftStart, signatureY, leftEnd, signatureY);
    doc.line(rightStart, signatureY, rightEnd, signatureY);

    doc.setFontSize(9);
    doc.setFont("times", "bold");
    // Employee name centred between left signature line endpoints (same as ReportPreview: x=56)
    doc.text(empObj?.name || "Employee", 56, signatureY - 2, { align: "center" });

    const supervisorName     = signatory?.head_name || "Supervisor";
    const supervisorPosition = signatory?.position  || "";
    const supervisorSignature =
      signatory?.signature     ||
      signatory?.signature_url ||
      signatory?.signatureUrl  ||
      signatory?.signature_file ||
      "";

    if (typeof supervisorSignature === "string" && supervisorSignature.startsWith("data:image/")) {
      try {
        doc.addImage(supervisorSignature, "PNG", rightStart + 10, signatureY - 13, 40, 10);
      } catch (err) {
        console.warn("Supervisor signature image could not be rendered:", err);
      }
    }

    doc.text(supervisorName, 154, signatureY + 5, { align: "center" });
    doc.setFont("times", "normal");
    doc.text("EMPLOYEE SIGNATURE", 56, signatureY + 5, { align: "center" });
    doc.text(supervisorPosition, 154, signatureY + 10, { align: "center" });

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(`dateprint: ${dateStr}`, 18, signatureY + 13);
    doc.text("Page 1 of 1", 192, signatureY + 13, { align: "right" });
  };

  // ── Main export — consolidated across all employees ────────────────────────
  const handleExportPDF = async (columnLayout) => {
    setShowPdfOptions(false);
    setExportingPdf(true);
    setPdfProgress("Starting export…");

    try {
      // Fetch the department signatory once — mirrors ReportPreview's useEffect fetch.
      // Uses dept_id (departmentId prop) with the same endpoint and fallback pattern.
      let signatory = null;
      try {
        const deptId = departmentId;
        if (deptId) {
          const sigRes = await fetch(
            `${API_BASE_URL}/api/dtr/signatory?dept_id=${encodeURIComponent(deptId)}`,
          );
          if (sigRes.ok) signatory = await sigRes.json();
        }
      } catch {
        // continue without signatory — fallback text will be used in the PDF
      }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      const sorted = [...employees].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      );

      for (let i = 0; i < sorted.length; i++) {
        const emp = sorted[i];
        setPdfProgress(`Fetching ${i + 1} / ${sorted.length}: ${emp.name}`);

        // Fetch DTR rows for this employee
        let dtrRows = [];
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/dtr/employee-dtr?bio_id=${encodeURIComponent(
              emp.id,
            )}&batch_id=${batchId}`,
          );
          dtrRows = res.ok ? await res.json() : [];
        } catch {
          dtrRows = [];
        }

        // Normalise YYYY-MM-DD → MM/DD/YY (matches parseDate expected input)
        const normalisedRows = (dtrRows || []).map((r) => {
          let dateStr = r.date || "";
          const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (iso) dateStr = `${iso[2]}/${iso[3]}/${iso[1].slice(2)}`;
          return { ...r, date: dateStr };
        });

        // New page for every employee after the first
        if (i > 0) doc.addPage();

        const empObj = { name: emp.name, id: emp.id };

        if (columnLayout === "2") {
          // Draw left then right half — matches ReportPreview drawDTRForm(0, half) + drawDTRForm(half, half)
          drawDTRForm(doc, 0,             pageWidth / 2, normalisedRows, empObj, signatory);
          drawDTRForm(doc, pageWidth / 2, pageWidth / 2, normalisedRows, empObj, signatory);

        } else {
          // 1-column: header → table → note + signatures
          drawOneColumnHeader(doc, normalisedRows, empObj);
          drawOneColumnTable(doc, normalisedRows);
          drawOneColumnSignatures(doc, normalisedRows, empObj, signatory);
        }
      }

      setPdfProgress("Saving PDF…");
      const safeDept = departmentName.replace(/[^\w\s]/gi, "_");
      doc.save(`${safeDept}_consolidated_${columnLayout}col.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setExportingPdf(false);
      setPdfProgress(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden max-w-5xl mx-auto border border-gray-100 flex flex-col h-[650px]">
      {/* HEADER */}
      <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
        <h2 className="text-xl font-bold text-gray-800">
          {departmentName} <span className="text-gray-400 mx-1">•</span> Employees
        </h2>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft size={18} />
          Back
        </button>
      </div>

      {/* SEARCH + EXPORT */}
      <div className="p-6 pb-4 flex items-center justify-between shrink-0">
        <div className="relative w-full max-w-xl">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search by BIO ID or Employee Name"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 ml-4">
          <button
            onClick={handleExportXLSX}
            disabled={exportingXlsx}
            className="border border-green-600 text-green-600 px-4 py-1 rounded hover:bg-green-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingXlsx ? "Exporting…" : "Export XLSX"}
          </button>

          <div className="relative" ref={pdfDropdownRef}>
            <button
              onClick={() => setShowPdfOptions((prev) => !prev)}
              disabled={exportingPdf}
              className="border border-gray-400 text-gray-700 px-4 py-1 rounded hover:bg-gray-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingPdf ? "Exporting…" : "Export PDF"}
            </button>

            {showPdfOptions && (
              <div className="absolute right-0 mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-lg z-20 p-2">
                <p className="text-[11px] text-gray-500 mb-2 px-1">
                  Consolidated PDF — choose layout
                </p>
                <button
                  onClick={() => handleExportPDF("1")}
                  className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100"
                >
                  1 Column
                </button>
                <button
                  onClick={() => handleExportPDF("2")}
                  className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100"
                >
                  2 Columns
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PROGRESS (visible while PDF builds) */}
      {exportingPdf && pdfProgress && (
        <div className="px-6 pb-2 shrink-0">
          <div className="text-xs text-gray-500 mb-1">{pdfProgress}</div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-400 rounded-full animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="flex-1 overflow-hidden p-6 pt-0 flex flex-col">
        <div className="overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-100">
              <tr className="text-xs uppercase text-gray-700 font-bold">
                <th className="px-6 py-4">BIO ID</th>
                <th className="px-6 py-4">
                  Employee Name{" "}
                  <span className="normal-case font-normal text-gray-400">(A–Z)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={2} className="text-center py-10 text-gray-400">
                    Loading employees...
                  </td>
                </tr>
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="cursor-pointer hover:bg-orange-50"
                  >
                    <td className="px-6 py-4 text-sm font-semibold text-gray-500">{emp.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-medium">{emp.name}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-gray-400 bg-gray-50">
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeView;
