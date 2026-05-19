import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { ChevronLeft, Save, FileText } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_FIELDS = ["amIn", "amOut", "pmIn", "pmOut", "otIn", "otOut"];

function getDateKey(value) {
  return String(value ?? "").split("T")[0];
}

function formatDisplayTime(value) {
  if (!value) return "";
  const raw = String(value).split(".")[0];
  let [hour, minute, second] = raw.split(":");
  second = (second != null && second !== "" ? String(second) : "00")
    .split(".")[0]
    .padStart(2, "0");
  minute = (minute != null && minute !== "" ? String(minute) : "00").padStart(
    2,
    "0",
  );

  let h = parseInt(hour, 10);
  if (Number.isNaN(h)) return "";

  const suffix = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;

  return `${String(h).padStart(2, "0")}:${minute}:${second} ${suffix}`;
}
// Enforce maintenance schedule values.
function enforcedMaintenanceCellValue(
  entry,
  field,
  maintenanceMap,
  { soft = false } = {},
) {
  if (field === "otIn" || field === "otOut") return null;
  if (!entry?.maintenanceLockedFields?.[field]) return null;

  const key = getDateKey(entry?.rawDate);
  const maint = maintenanceMap?.[key];
  if (!maint) return soft ? "" : null;

  const sched = buildMaintenanceSchedule(maint, entry);
  return sched[field] ?? (soft ? "" : null);
}

function rowHasRealDtrTimes(row) {
  return ["amIn", "amOut", "pmIn", "pmOut"].some(
    (f) => String(row?.[f] ?? "").trim() !== "",
  );
}

function isHalfDayMaintenanceType(category) {
  return category === "Half-day";
}

function buildMaintenanceSchedule(maint, row) {
  return {
    amIn: formatDisplayTime(maint?.am_in),
    amOut: formatDisplayTime(maint?.am_out),
    pmIn: formatDisplayTime(maint?.pm_in),
    pmOut: formatDisplayTime(maint?.pm_out),
    otIn: row?.otIn ?? "",
    otOut: row?.otOut ?? "",
  };
}

function applyHolidayRow(row, schedule, hasRealDtr) {
  if (hasRealDtr) {
    return {
      ...row,
      maintenanceType: "Holiday",
      maintenanceTimesLocked: false,
      maintenanceLockedFields: null,
    };
  }

  return {
    ...row,
    ...schedule,
    maintenanceType: "Holiday",
    maintenanceTimesLocked: true,
    maintenanceLockedFields: {
      amIn: true,
      amOut: true,
      pmIn: true,
      pmOut: true,
    },
  };
}

function applyHalfDayRow(row, schedule, hasRealDtr) {
  if (!hasRealDtr) {
    return {
      ...row,
      maintenanceType: "Half-day",
      maintenanceTimesLocked: false,
      maintenanceLockedFields: null,
    };
  }

  const next = {
    ...row,
    pmIn: row.pmIn || schedule.pmIn,
    pmOut: row.pmOut || schedule.pmOut,
  };

  return {
    ...next,
    maintenanceType: "Half-day",
    maintenanceTimesLocked: false,
    maintenanceLockedFields: {
      pmIn: true,
      pmOut: true,
    },
  };
}

function applyMaintenanceToRows(mergedRows, maintenanceMap, datesWithEntries) {
  return mergedRows.map((row) => {
    const key = getDateKey(row.rawDate);
    const maint = maintenanceMap[key] ?? null;
    const maintenanceType = maint?.category ?? null;

    const withUnlocked = {
      ...row,
      maintenanceTimesLocked: false,
      maintenanceLockedFields: null,
    };

    if (!maintenanceType) {
      return { ...withUnlocked, maintenanceType: null };
    }

    const schedule = buildMaintenanceSchedule(maint, row);
    const hasRealDtr = datesWithEntries.has(key);

    if (maintenanceType === "Holiday") {
      return applyHolidayRow(row, schedule, hasRealDtr);
    }

    if (maintenanceType === "Half-day") {
      return applyHalfDayRow(row, schedule, hasRealDtr);
    }

    return { ...withUnlocked, maintenanceType };
  });
}

// Parse YYYY-MM-DD as a local calendar date.
function parseLocalDateOnly(value) {
  const part = getDateKey(value);
  const [y, m, d] = part.split("-").map((x) => parseInt(x, 10));
  if (
    Number.isNaN(y) ||
    Number.isNaN(m) ||
    Number.isNaN(d) ||
    m < 1 ||
    m > 12
  ) {
    return null;
  }
  const dateObj = new Date(y, m - 1, d);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
}

// Fill calendar gaps in the editor.
function mergeDtrWithFullCalendarRange(formattedRows, maintenanceMap = {}) {
  const byKey = new Map();
  for (const row of formattedRows) {
    const key = getDateKey(row.rawDate);
    if (key) byKey.set(key, row);
  }

  // Use DTR dates to set the month range; if none exist, use maintenance dates.
  const dtrKeys = [...byKey.keys()].sort();
  const maintenanceKeys = Object.keys(maintenanceMap || {}).sort();

  const keysForRange = dtrKeys.length > 0 ? dtrKeys : maintenanceKeys;
  if (keysForRange.length === 0) return formattedRows;

  const minD = parseLocalDateOnly(keysForRange[0]);
  const maxD = parseLocalDateOnly(keysForRange[keysForRange.length - 1]);
  if (!minD || !maxD) return formattedRows;

  const rangeStart = new Date(minD.getFullYear(), minD.getMonth(), 1);
  const rangeEnd = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0);

  const out = [];
  for (
    let d = new Date(rangeStart);
    d <= rangeEnd;
    d.setDate(d.getDate() + 1)
  ) {
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    const key = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    if (byKey.has(key)) {
      out.push(byKey.get(key));
    } else {
      out.push({
        rawDate: key,
        date: `${String(mo).padStart(2, "0")}/${String(da).padStart(2, "0")}/${String(y).slice(-2)}`,
        day: DAY_LABELS[d.getDay()],
        amIn: "",
        amOut: "",
        pmIn: "",
        pmOut: "",
        otIn: "",
        otOut: "",
      });
    }
  }
  return out;
}

const DTREditView = ({ employee, batchId, onBack, onGenerateReport }) => {
  const [dtrEntries, setDtrEntries] = useState([]);
  const [initialEntries, setInitialEntries] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [maintenanceMap, setMaintenanceMap] = useState({});
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);
  const editingRef = useRef(null);
  editingRef.current = editing;
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const resolvedBatchId = useMemo(() => {
    if (batchId != null && String(batchId).trim() !== "") {
      return batchId;
    }
    const fromEmployee = employee?.batch_id;
    if (fromEmployee != null && String(fromEmployee).trim() !== "") {
      return fromEmployee;
    }
    return localStorage.getItem("current_batch_id");
  }, [batchId, employee?.batch_id]);

  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/maintenance`);
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const map = {};
      for (const item of data) {
        const key = getDateKey(item.config_date);
        if (!key) continue;
        map[key] = {
          category: item.category,
          am_in: item.am_in ?? null,
          am_out: item.am_out ?? null,
          pm_in: item.pm_in ?? null,
          pm_out: item.pm_out ?? null,
        };
      }
      setMaintenanceMap(map);
    } catch (err) {
      console.error("Maintenance fetch error:", err);
    } finally {
      setMaintenanceLoaded(true);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    loadMaintenance();
  }, [loadMaintenance]);

  const convertTo24Hour = (time, field) => {
    if (!time || typeof time !== "string") return null;

    let t = time.trim();
    t = t.replace(
      /([0-9]{1,2}:[0-9]{2}:[0-9]{2}|[0-9]{1,2}:[0-9]{2}|[0-9]{1,2})(AM|PM)\s*$/i,
      "$1 $2",
    );
    t = t.toUpperCase();
    t = t.replace(/\s*(AM|PM)\s*$/, " $1");
    t = t.replace(/\s+/g, " ").trim();

    const parts = t.split(/\s+/);
    if (parts.length < 1) return null;

    const timeSeg = parts[0].split(":");
    const secPart = timeSeg[2] != null ? String(timeSeg[2]).split(".")[0] : "0";
    let [hours, minutes, seconds] = [
      timeSeg[0],
      timeSeg[1] != null && timeSeg[1] !== "" ? timeSeg[1] : "0",
      secPart,
    ];
    let modifier =
      parts.length > 1 && (parts[1] === "AM" || parts[1] === "PM")
        ? parts[1]
        : null;

    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    seconds = parseInt(seconds, 10) || 0;

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;

    if (!modifier) {
      const inferred =
        field === "amIn"
          ? "AM"
          : field === "amOut" ||
              field === "pmIn" ||
              field === "pmOut" ||
              field === "otIn" ||
              field === "otOut"
            ? "PM"
            : null;
      if (inferred && hours >= 1 && hours <= 12) modifier = inferred;
    }

    if (!modifier) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };
  // Track which dates have any time entries
  const loadDTR = useCallback(async () => {
    try {
      const bioId = employee?.bio_id || employee?.id;
      if (!maintenanceLoaded) return;
      if (
        !bioId ||
        resolvedBatchId == null ||
        String(resolvedBatchId).trim() === ""
      ) {
        return;
      }

      const url = `${API_BASE_URL}/api/dtr/employee-dtr?bio_id=${bioId}&batch_id=${resolvedBatchId}`;
      console.log("Fetching DTR from:", url);

      const res = await fetch(url);
      const data = await res.json();

      if (!Array.isArray(data)) return;

      const formatted = data
        .map((row) => {
          const raw = getDateKey(row.date);
          const dateObj = parseLocalDateOnly(raw);
          if (!dateObj) return null;

          return {
            rawDate: raw,
            date: `${(dateObj.getMonth() + 1)
              .toString()
              .padStart(2, "0")}/${dateObj
              .getDate()
              .toString()
              .padStart(2, "0")}/${dateObj.getFullYear().toString().slice(-2)}`,

            day: DAY_LABELS[dateObj.getDay()],

            amIn: formatDisplayTime(row.amIn),
            amOut: formatDisplayTime(row.amOut),
            pmIn: formatDisplayTime(row.pmIn),
            pmOut: formatDisplayTime(row.pmOut),
            otIn: formatDisplayTime(row.otIn),
            otOut: formatDisplayTime(row.otOut),
          };
        })
        .filter(Boolean);

      const datesWithEntries = new Set();
      for (const row of formatted) {
        if (rowHasRealDtrTimes(row)) {
          datesWithEntries.add(getDateKey(row.rawDate));
        }
      }

      const merged = mergeDtrWithFullCalendarRange(formatted, maintenanceMap);
      const withMaintenance = applyMaintenanceToRows(
        merged,
        maintenanceMap,
        datesWithEntries,
      );

      setDtrEntries(withMaintenance);
      setInitialEntries(withMaintenance.map((r) => ({ ...r })));
      setEditing(null);
    } catch (err) {
      console.error("LOAD DTR ERROR:", err);
    }
  }, [
    employee,
    API_BASE_URL,
    maintenanceLoaded,
    maintenanceMap,
    resolvedBatchId,
  ]);

  useEffect(() => {
    loadDTR();
  }, [loadDTR]);

  useEffect(() => {
    if (toast) {
      setShowToast(true);

      const hideTimer = setTimeout(() => {
        setShowToast(false);
      }, 2500);

      const removeTimer = setTimeout(() => {
        setToast(null);
      }, 3000);

      return () => {
        clearTimeout(hideTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [toast]);

  const defaultAmPmForField = (field) => (field === "amIn" ? "AM" : "PM");

  const readAmPmFromText = (text) =>
    String(text)
      .match(/\b(am|pm)\b/i)?.[1]
      ?.toUpperCase() ?? null;

  const amPmLockForCell = (field, cellValue) => {
    const trimmed = (cellValue ?? "").trim();
    return trimmed
      ? (readAmPmFromText(trimmed) ?? defaultAmPmForField(field))
      : null;
  };

  const lockAmPmForTimeField = (field, value) => {
    if (field === "otIn" || field === "otOut") {
      return amPmLockForCell(field, value);
    }
    return (value ?? "").trim()
      ? amPmLockForCell(field, value)
      : defaultAmPmForField(field);
  };

  const formatDtrTimeInput = (field, value, lockedAmPm) => {
    let text = value.trim();
    if (!text) return "";

    const defaultAmPm = defaultAmPmForField(field);
    text = text.replace(
      /^([0-9]{1,2}:[0-9]{2}:[0-9]{2}|[0-9]{1,2}:[0-9]{2}|[0-9]+)(am|pm)\s*$/i,
      "$1 $2",
    );

    const amPmMatches = [...text.matchAll(/\b(am|pm)\b/gi)];
    const hadExplicitAmPm = amPmMatches.length > 0;

    text = text.replace(/\b(am|pm)\b/gi, " ");

    let digits = text.replace(/[^0-9:]/g, "");
    if (!digits) return "";
    if (!digits.includes(":") && digits.length > 2) {
      digits = digits.slice(0, 2) + ":" + digits.slice(2);
    }
    if (/^0+$/.test(digits.replace(/:/g, ""))) return "";

    const parts = digits.split(":").map((s) => s.slice(0, 2));
    const [h = "", m = "", s = ""] = parts;

    if (!h) return "";

    let hour = parseInt(h, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) return "";

    const resolveAmPm = () => {
      let ap = hadExplicitAmPm
        ? amPmMatches[amPmMatches.length - 1][1].toUpperCase()
        : defaultAmPm;
      if (lockedAmPm === "AM" || lockedAmPm === "PM") {
        ap = lockedAmPm;
      }
      return ap;
    };

    let ampm;
    if (hour > 12) {
      hour -= 12;
      if (hadExplicitAmPm) {
        ampm = resolveAmPm();
      } else {
        ampm = field === "amIn" ? "AM" : "PM";
      }
    } else if (hour === 0) {
      hour = 12;
      ampm = "AM";
    } else if (hour === 12) {
      ampm = hadExplicitAmPm ? resolveAmPm() : "PM";
    } else {
      ampm = resolveAmPm();
    }

    const min = (m || "00").slice(0, 2).padStart(2, "0");
    const sec = (s || "00").slice(0, 2).padStart(2, "0");
    return `${String(hour).padStart(2, "0")}:${min}:${sec} ${ampm}`;
  };

  const isRowChanged = (current, original) => {
    if (!original) return true;
    return TIME_FIELDS.some((f) => (current[f] || "") !== (original[f] || ""));
  };

  const isTimeCellChanged = (idx, field, entry) => {
    const cur =
      editing?.row === idx && editing?.field === field
        ? formatDtrTimeInput(field, editing.draft, editing.lockAmPm)
        : entry[field] || "";
    return cur !== (initialEntries[idx]?.[field] || "");
  };

  const hasChanges = () => {
    if (editing) {
      const formatted = formatDtrTimeInput(
        editing.field,
        editing.draft,
        editing.lockAmPm,
      );
      const init = initialEntries[editing.row]?.[editing.field] ?? "";
      if (formatted !== init) return true;
    }
    return dtrEntries.some((entry, i) =>
      isRowChanged(entry, initialEntries[i]),
    );
  };

  const finalizeTimeInput = () => {
    if (!editing) return dtrEntries;
    const f = formatDtrTimeInput(
      editing.field,
      editing.draft,
      editing.lockAmPm,
    );
    const next = dtrEntries.map((row, i) => {
      if (i !== editing.row) return row;
      const candidate = { ...row, [editing.field]: f };
      const enforced = enforcedMaintenanceCellValue(
        candidate,
        editing.field,
        maintenanceMap,
        { soft: true },
      );
      return {
        ...candidate,
        [editing.field]: enforced ?? f,
      };
    });
    setDtrEntries(next);
    setEditing(null);
    return next;
  };

  const finishEditingTimeCell = (rowIndex, fieldKey) => {
    const ed = editingRef.current;
    if (ed?.row === rowIndex && ed?.field === fieldKey) {
      const f = formatDtrTimeInput(fieldKey, ed.draft, ed.lockAmPm);
      setDtrEntries((prev) =>
        prev.map((row, i) => {
          if (i !== rowIndex) return row;
          const candidate = { ...row, [fieldKey]: f };
          const enforced = enforcedMaintenanceCellValue(
            candidate,
            fieldKey,
            maintenanceMap,
            { soft: true },
          );
          return { ...candidate, [fieldKey]: enforced ?? f };
        }),
      );
    }
    setEditing(null);
  };

  const initialDtrValueAt = (rowIndex, timeField) =>
    initialEntries[rowIndex]?.[timeField] ?? "";

  const timeFieldEditState = (rowIndex, timeField, draft) => ({
    row: rowIndex,
    field: timeField,
    draft,
    lockAmPm: lockAmPmForTimeField(
      timeField,
      initialDtrValueAt(rowIndex, timeField),
    ),
  });

  const handleSaveClick = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      const bioId = employee?.bio_id || employee?.id;

      const rows = finalizeTimeInput();

      const changedEntries = rows.filter((entry, i) =>
        isRowChanged(entry, initialEntries[i]),
      );

      if (changedEntries.length === 0) {
        alert("No changes to save.");
        return;
      }

      const origByDateKey = new Map(
        initialEntries.map((r) => [getDateKey(r?.rawDate), r]),
      );

      const fieldIfChanged = (entry, field) => {
        const dateKey = getDateKey(entry?.rawDate);
        const orig = origByDateKey.get(dateKey);
        const cur = (entry?.[field] ?? "").trim();
        const prev = (orig?.[field] ?? "").trim();
        if (cur === prev) {
          return "__UNCHANGED__";
        }

        // mark for deletion
        if (cur === "") {
          return null;
        }

        return convertTo24Hour(entry?.[field], field);
      };

      const payload = changedEntries.map((entry) => ({
        bio_id: bioId,
        batch_id: Number(resolvedBatchId),
        date: entry.rawDate ? getDateKey(entry.rawDate) : null,
        amIn: fieldIfChanged(entry, "amIn"),
        amOut: fieldIfChanged(entry, "amOut"),
        pmIn: fieldIfChanged(entry, "pmIn"),
        pmOut: fieldIfChanged(entry, "pmOut"),
        otIn: fieldIfChanged(entry, "otIn"),
        otOut: fieldIfChanged(entry, "otOut"),
      }));

      const res = await fetch(`${API_BASE_URL}/api/dtr/update-dtr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);

      await loadDTR();

      const misses = Array.isArray(data.misses) ? data.misses : [];
      if (misses.length > 0) {
        const list = misses.map((m) => `• ${m.date} — ${m.type}`).join("\n");

        setToast({
          type: "warning",
          message: `Saved ${changedEntries.length} row(s), but some records were not found.`,
          details: list,
        });
      } else {
        setToast({
          type: "success",
          message: `Saved ${changedEntries.length} row(s) successfully!`,
        });
      }
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const employeeBioId = employee?.bio_id || employee?.id || "N/A";

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden max-w-6xl mx-auto border border-gray-100 flex flex-col h-[calc(80vh-80px)] min-h-[300px]">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (hasChanges()) {
                setShowUnsavedModal(true);
                return;
              }
              onBack();
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={24} className="text-gray-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              {employee?.name}
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                BIO ID: {employeeBioId}
              </span>
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                {employee?.departmentName}
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveClick}
            disabled={isSaving || !hasChanges()}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold transition-all shadow-sm active:scale-95 ${
              isSaving || !hasChanges()
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-[#449d44] hover:bg-[#398439] text-white"
            }`}
          >
            <Save size={18} /> {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2 rounded-lg font-semibold transition-all active:scale-95"
            onClick={() =>
              onGenerateReport && onGenerateReport(finalizeTimeInput())
            }
          >
            <FileText size={18} /> Generate Report
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto p-6 pt-2">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full text-center border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-100 text-gray-500 uppercase text-[11px] font-bold tracking-widest">
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200 first:rounded-tl-lg">
                  Date
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  Day
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  AM IN
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  AM OUT
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  PM IN
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  PM OUT
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200">
                  OT IN
                </th>
                <th className="sticky top-0 z-20 bg-gray-100 py-4 px-2 border-b border-gray-200 last:rounded-tr-lg">
                  OT OUT
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {dtrEntries.length === 0 && (
                <tr>
                  <td colSpan="8" className="py-5 text-gray-400">
                    No DTR data found
                  </td>
                </tr>
              )}

              {dtrEntries.map((entry, idx) => (
                <tr
                  key={idx}
                  className={`transition-colors hover:bg-gray-50 ${
                    entry.maintenanceType === "Holiday" ? "bg-blue-100/80" : ""
                  } ${
                    isHalfDayMaintenanceType(entry.maintenanceType)
                      ? "bg-amber-100/70"
                      : ""
                  }`}
                >
                  <td className="py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="py-3 text-sm text-gray-700">{entry.day}</td>

                  {TIME_FIELDS.map((field) => {
                    const isActiveCell =
                      editing?.row === idx && editing?.field === field;
                    return (
                      <td key={`${field}-${idx}`}>
                        <input
                          type="text"
                          value={
                            isActiveCell ? editing.draft : entry[field] || ""
                          }
                          onFocus={() => {
                            setEditing(
                              timeFieldEditState(
                                idx,
                                field,
                                entry[field] ?? "",
                              ),
                            );
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditing((ed) =>
                              ed?.row === idx && ed?.field === field
                                ? {
                                    ...ed,
                                    draft: v,
                                  }
                                : timeFieldEditState(idx, field, v),
                            );
                          }}
                          onBlur={() => finishEditingTimeCell(idx, field)}
                          className={`w-24 text-center py-1.5 border rounded-full text-[11px] font-semibold outline-none transition-all shadow-sm
                            ${
                              isTimeCellChanged(idx, field, entry)
                                ? "bg-yellow-100 border-yellow-400 text-gray-800"
                                : "bg-white border-gray-200 text-gray-600"
                            }
                            focus:ring-2 focus:ring-orange-400 focus:border-transparent
                          `}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {toast && (
            <div
              className={`fixed bottom-6 right-6 z-50 max-w-sm w-full transition-all duration-300
                ${showToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
            >
              <div
                className={`rounded-lg shadow-lg p-4 text-sm border
            ${
              toast.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-yellow-50 border-yellow-200 text-yellow-800"
            }`}
              >
                <div className="font-semibold mb-2">{toast.message}</div>

                {toast.details && (
                  <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto bg-white/50 p-2 rounded">
                    {toast.details}
                  </pre>
                )}
              </div>
            </div>
          )}

          {showUnsavedModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl shadow-lg w-[450px] p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Unsaved Changes
                </h3>
                <p className="text-md text-gray-600 mb-6">
                  You have unsaved changes. Are you sure you want to leave?
                </p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowUnsavedModal(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() => {
                      setShowUnsavedModal(false);
                      onBack();
                    }}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DTREditView;
