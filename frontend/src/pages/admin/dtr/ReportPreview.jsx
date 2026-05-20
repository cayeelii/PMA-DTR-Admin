import React, { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ReportPreview({
  onBack,
  dtrRows = [],
  employee,
  department,
  signatory,
}) {
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [resolvedSignatory, setResolvedSignatory] = useState(signatory || null);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const deptId = department?.dept_id || department?.id;
    if (!deptId || !API_BASE_URL) {
      setResolvedSignatory(signatory || null);
      return;
    }

    let cancelled = false;

    const fetchSignatory = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/dtr/signatory?dept_id=${encodeURIComponent(deptId)}`,
        );
        const data = await res.json();
        if (!cancelled) {
          setResolvedSignatory(data || null);
        }
      } catch (error) {
        console.error("Failed to fetch supervisor name:", error);
        if (!cancelled) {
          setResolvedSignatory(signatory || null);
        }
      }
    };

    fetchSignatory();

    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, department?.dept_id, department?.id, signatory]);

  const activeSignatory = resolvedSignatory || signatory;
  const reportRows = dtrRows;

  const tableData = reportRows.map((row) => [
    row.date,
    row.day,
    row.amIn,
    row.amOut,
    row.pmIn,
    row.pmOut,
    row.otIn,
    row.otOut,
  ]);

  const parseDate = (value) => {
    if (!value) return null;

    const parts = String(value).trim().split(/[/-]/);
    if (parts.length !== 3) return null;

    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);

    if (!month || !day || !year) return null;

    if (year < 100) {
      year += 2000;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateIso = (date) => {
    if (!date) return "-";

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const getDateRange = () => {
    const validDates = reportRows
      .map((row) => parseDate(row.date))
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (!validDates.length) {
      return {
        monthYear: "-",
        rangeText: "-",
      };
    }

    const first = validDates[0];
    const last = validDates[validDates.length - 1];

    return {
      monthYear: first.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      }),
      rangeText: `${formatDateIso(first)} - ${formatDateIso(last)}`,
    };
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
    const suffix = match[3]?.toUpperCase();

    // Convert to 24-hour military format
    if (suffix === "AM") {
      if (hours === 12) hours = 0;
    } else if (suffix === "PM") {
      if (hours !== 12) hours += 12;
    }

    return `${String(hours).padStart(2, "0")}:${minutes}`;
  };

  //Export to XLSX
  const exportToXLSX = () => {
    const header = [
      ["Monthly Daily Time Record"],
      ["For the Month of"],
      [`Name: ${employee?.name || "-"}`],
      [`Office: ${department?.name || "-"}`],
      [],
    ];

    const tableHeader = [
      ["Date", "Day", "AM IN", "AM OUT", "PM IN", "PM OUT", "OT IN", "OT OUT"],
    ];

    const worksheetData = [...header, ...tableHeader, ...tableData];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "DTR");

    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
    ];

    XLSX.writeFile(workbook, `${employee?.name || "DTR"}_Report.xlsx`);
  };

  //Export PDF
  const exportToPDF = (columnLayout = "1") => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      // zoom only scales font sizes; Y positions are fixed to fit portrait A4 (297mm)
      const zoom = 1.4;

      // Helper to convert to 24-hour military format (e.g., "08:30:00 AM" -> "08:30", "02:30:00 PM" -> "14:30")
      const formatTimeShort = (timeStr) => {
        if (!timeStr || timeStr === "-" || timeStr === "--") return "";
        
        const text = String(timeStr).trim();
        const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
        if (!match) return text;
        
        let hours = Number(match[1]);
        const minutes = match[2];
        const suffix = match[4]?.toUpperCase();
        
        // Convert to 24-hour military format
        if (suffix === "AM") {
          if (hours === 12) hours = 0;
        } else if (suffix === "PM") {
          if (hours !== 12) hours += 12;
        }
        
        return `${String(hours).padStart(2, "0")}:${minutes}`;
      };

      // Helper function to draw a single DTR slip
      const drawDTRForm = (startX, width) => {
        // Tight margins to maximise usable width
        const margin = 3;
        const centerX = startX + width / 2;
        const contentWidth = width - margin * 2;
        const z = zoom;

        // --- 1. Header Section ---
        // Y positions are NOT multiplied by z so layout stays within page height
        doc.setFont("times", "bold");
        doc.setFontSize(12 * z);
        doc.text("Monthly Daily Time Record", centerX, 12, { align: "center" });

        doc.setFont("times", "normal");
        doc.setFontSize(9 * z);
        const { monthYear } = getDateRange();
        doc.text(`For the Month of ${String(monthYear).toUpperCase()}`, centerX, 18, { align: "center" });

        // --- 2. Identity Section ---
        doc.setLineWidth(0.1);
        doc.line(startX + margin, 21, startX + width - margin, 21);

        doc.setFont("times", "bold");
        doc.setFontSize(8 * z);
        doc.text(`Name: ${employee?.name?.toUpperCase() || "-"}`, startX + margin, 26);

        doc.setFont("times", "normal");
        doc.setFontSize(7.5 * z);
        doc.text(`Dept / Office: ${department?.name || "-"}`, startX + margin, 31);

        doc.line(startX + margin, 33, startX + width - margin, 33);

        // --- 3. Table Header ---
        const tableHeader = [
          [
            { content: "No / Day", rowSpan: 2, styles: { valign: "middle", halign: "left" } },
            { content: "AM", colSpan: 2 },
            { content: "PM", colSpan: 2 },
            { content: "OT", colSpan: 2 },
          ],
          ["IN", "OUT", "IN", "OUT", "IN", "OUT"],
        ];

        // --- 4. Data Generation (31 rows) ---
        const rows = [];
        const daysArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
            `${dayNum}    ${dayName}`,
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
              data.cell.y + data.cell.height
            );
          },
        });

        // --- 5. Footer / Signature Section ---
        const finalTableY = doc.lastAutoTable.finalY;
        const footerY = finalTableY + 8;

        doc.line(startX + margin + 5, footerY, startX + width - margin - 5, footerY);
        doc.setFont("times", "normal");
        doc.setFontSize(8 * z);
        doc.text("EMPLOYEE SIGNATURE", centerX, footerY + 4, { align: "center" });

        const sigY = footerY + 14;
        doc.line(startX + margin + 5, sigY, startX + width - margin - 5, sigY);
        doc.setFont("times", "bold");
        doc.setFontSize(9 * z);
        const bossName =
          activeSignatory?.head_name?.toUpperCase() ||
          "CAPT JOHN RONALD A MANGAHAS PN(GSC)";
        doc.text(bossName, centerX, sigY + 4, { align: "center" });

        doc.setFont("times", "normal");
        doc.setFontSize(8 * z);
        const bossPos =
          activeSignatory?.position || "AC of S for Plans and Programs, MA5, PMA";
        doc.text(bossPos, centerX, sigY + 8, { align: "center" });

        const dateStr = new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        doc.setFontSize(7.5 * z);
        doc.text(`dateprint: ${dateStr}`, startX + margin, sigY + 14);
        doc.text(`Page 1 of 1`, startX + width - margin, sigY + 14, { align: "right" });
      };

      // --- EXECUTION LOGIC ---
      if (columnLayout === "2") {
        // Form 1 (Left side)
        drawDTRForm(0, pageWidth / 2);
        drawDTRForm(pageWidth / 2, pageWidth / 2);
      } else {
        // --- 1 COLUMN FORMAT
        const employeeName = employee?.name || employee?.username || "";
        const employeeId =
          employee?.bio_id ||
          employee?.bioId ||
          employee?.employee_id ||
          employee?.id ||
          "";
        const deptName     = department?.name || department?.dept_name || department?.department || "";

        const validDates = reportRows
          .map((r) => parseDate(r.date))
          .filter(Boolean)
          .sort((a, b) => a - b);
        const monthYear = validDates.length
          ? validDates[0].toLocaleString("en-US", { month: "long", year: "numeric" })
          : "-";

        // Draw header
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
        doc.text(`Department: ${deptName || "-"}`, 105, 29, { align: "center" });
        doc.text(`BIO ID NO: ${employeeId || "-"}`, 192, 29, { align: "right" });
        doc.setLineWidth(0.25);
        doc.line(18, 31.8, 192, 31.8);

        // Table
        const marginLeft = 18;
        const tableWidth = 174;
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
          body: reportRows.map((row) => [
            formatDateForOneColumn(row.date),
            row.day || "",
            formatTimeForOneColumn(row.amIn || row.am_in),
            formatTimeForOneColumn(row.amOut || row.am_out),
            formatTimeForOneColumn(row.pmIn || row.pm_in),
            formatTimeForOneColumn(row.pmOut || row.pm_out),
            formatTimeForOneColumn(row.otIn || row.ot_in),
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

        // Footer (copied from EmployeeDTR)
        const finalY = doc.lastAutoTable?.finalY || 35;
        // Draw footer
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
          // Redraw header if new page
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
          doc.text(`Department: ${deptName || "-"}`, 105, 29, { align: "center" });
          doc.text(`BIO ID NO: ${employeeId || "-"}`, 192, 29, { align: "right" });
          doc.setLineWidth(0.25);
          doc.line(18, 31.8, 192, 31.8);
          signatureY = 52;
        }
        doc.setFont("times", "normal");
        doc.text("Certified True and Correct", 48, signatureY - 8, { align: "center" });
        doc.text("Approved by", 152, signatureY - 8, { align: "center" });
        const leftStart = 26;
        const leftEnd = 86;
        const rightStart = 124;
        const rightEnd = 184;
        doc.setLineWidth(0.3);
        doc.line(leftStart, signatureY, leftEnd, signatureY);
        doc.line(rightStart, signatureY, rightEnd, signatureY);
        doc.setFontSize(9);
        doc.setFont("times", "bold");
        doc.text(employeeName || "Employee", 56, signatureY - 2, { align: "center" });
        const supervisorName = activeSignatory?.head_name || "Supervisor";
        const supervisorPosition = activeSignatory?.position || "";
        const supervisorSignature =
          activeSignatory?.signature ||
          activeSignatory?.signature_url ||
          activeSignatory?.signatureUrl ||
          activeSignatory?.signature_file ||
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
      }

      doc.save(`${employee?.name || "DTR"}_Report.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
    }
  };

  const handleExportPDF = (columnLayout) => {
    setShowPdfOptions(false);
    exportToPDF(columnLayout);
  };

  console.log("SIGNATORY IN PREVIEW:", activeSignatory);

  return (
    <div>
      {/* Report Card */}
      <div className="bg-white rounded-xl shadow p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              className="text-gray-500 hover:text-blue-900 p-1 rounded-full"
              onClick={onBack}
            >
              <ChevronLeft size={22} />
            </button>
            <span className="font-semibold text-lg">Report Preview</span>
            <span className="ml-2 text-xs text-gray-400">OMA1</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToXLSX}
              className="border border-green-600 text-green-600 px-4 py-1 rounded hover:bg-green-50 text-sm font-medium"
            >
              Export XLSX
            </button>
            <div className="relative">
              <button
                onClick={() => setShowPdfOptions((prev) => !prev)}
                className="border border-gray-400 text-gray-700 px-4 py-1 rounded hover:bg-gray-100 text-sm font-medium"
              >
                Export PDF
              </button>

              {showPdfOptions && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-20 p-2">
                  <p className="text-[11px] text-gray-500 mb-2 px-1">
                    Choose layout
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
        {/* Report Info */}
        <div className="mb-2">
          <div className="w-full text-center">
            <div className="text-sm font-medium">
              Monthly Daily Time Record
            </div>
            <div className="text-xs text-gray-500">
              {(() => {
                // Dynamically compute the month/year from dtrRows
                const parseDate = (value) => {
                  if (!value) return null;
                  const parts = String(value).trim().split(/[/-]/);
                  if (parts.length !== 3) return null;
                  const m = Number(parts[0]);
                  const d = Number(parts[1]);
                  let y = Number(parts[2]);
                  if (!m || !d || !y) return null;
                  if (y < 100) y += 2000;
                  const parsed = new Date(y, m - 1, d);
                  return Number.isNaN(parsed.getTime()) ? null : parsed;
                };
                const validDates = (dtrRows || [])
                  .map((r) => parseDate(r.date))
                  .filter(Boolean)
                  .sort((a, b) => a - b);
                const monthYear = validDates.length
                  ? validDates[0].toLocaleString("en-US", { month: "long", year: "numeric" })
                  : "-";
                return `For the Month of ${monthYear.toUpperCase()}`;
              })()}
            </div>
          </div>
          <div className="mt-2 flex justify-between items-center">
            <div className="text-xs">
              Name:{" "}
              <span className="font-semibold">{employee?.name || "—"}</span>
            </div>
            <div className="text-xs">
              Office:{" "}
              <span className="font-semibold">{department?.name || "—"}</span>
            </div>
          </div>
        </div>
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-separate border-spacing-0 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-semibold">
                <th className="px-4 py-2 text-left rounded-tl-lg">Date</th>
                <th className="px-4 py-2 text-left">Day</th>
                <th className="px-4 py-2 text-left">AM IN</th>
                <th className="px-4 py-2 text-left">AM OUT</th>
                <th className="px-4 py-2 text-left">PM IN</th>
                <th className="px-4 py-2 text-left">PM OUT</th>
                <th className="px-4 py-2 text-left">OT IN</th>
                <th className="px-4 py-2 text-left rounded-tr-lg">OT OUT</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 border-t border-gray-200 text-center text-gray-500"
                  >
                    No days with time entries to include in the report.
                  </td>
                </tr>
              ) : (
                reportRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 border-t border-gray-200 text-left font-medium text-gray-700">
                      {row.date}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.day}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.amIn}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.amOut}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.pmIn}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.pmOut}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.otIn}
                    </td>
                    <td className="px-4 py-2 border-t border-gray-200 text-left">
                      {row.otOut}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
