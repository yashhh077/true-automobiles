import { useEffect, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import {
  AlertTriangle,
  Bookmark,
  Building2,
  FileDown,
  Fuel,
  Pencil,
  Plus,
  Printer,
  Route,
  Save,
  Truck,
  UserPlus,
  X,
} from "lucide-react";
import * as api from "./api";
import { calcTotalKm, fmtDate, todayISO, wait } from "./utils";

const TRAVEL_MODES = [
  { value: "Bike", label: "Bike" },
  { value: "MSV", label: "MSV (Mobile Service Van)" },
  { value: "Pickup Van", label: "Pickup Van" },
  { value: "Other", label: "Other" },
];

const MAX_MECHANICS = 10;

// Always show at least 2 boxes (as on the paper slip)
const padMechanics = (list) => {
  const out = [...list];
  while (out.length < 2) out.push("");
  return out;
};

const emptyForm = () => ({
  date: todayISO(),
  customerName: "",
  vehicleNo: "",
  chassisNo: "",
  engineNo: "",
  problem: "",
  startKm: "",
  endKm: "",
  mechanics: ["", ""],
  travelMode: "Bike",
  fuelType: "Diesel",
  fuelQty: "",
});

const formFromTicket = (t) => ({
  date: t.date ? String(t.date).slice(0, 10) : todayISO(),
  customerName: t.customerName || "",
  vehicleNo: t.vehicleNo || "",
  chassisNo: t.chassisNo || "",
  engineNo: t.engineNo || "",
  problem: t.problem || "",
  startKm: t.startKm ?? "",
  endKm: t.endKm ?? "",
  mechanics: padMechanics(
    t.mechanics?.length
      ? t.mechanics
      : [t.mechanic1, t.mechanic2].filter(Boolean),
  ),
  travelMode: t.travelMode || "Bike",
  fuelType: t.fuelType || "Diesel",
  fuelQty: t.fuelQty ?? "",
});

export default function BreakdownSlip({
  ticket,
  settings,
  onSettingsSaved,
  notify,
  onSaved,
  onNew,
  autoAction,
}) {
  const [form, setForm] = useState(() =>
    ticket ? formFromTicket(ticket) : emptyForm(),
  );
  const [branch, setBranch] = useState({
    dealerName: settings.dealerName,
    dealerAddress: settings.dealerAddress,
  });
  const [saved, setSaved] = useState(ticket || null); // the ticket document stored in MongoDB
  const [ticketNo, setTicketNo] = useState(ticket?.ticketNo || "");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState("edit"); // mobile only: 'edit' | 'preview'
  const [knownMechanics, setKnownMechanics] = useState([]); // names used on earlier tickets

  const slipRef = useRef(null);
  const dirty = useRef(!ticket); // true when the form differs from what is saved

  // Mechanic name suggestions
  useEffect(() => {
    api
      .listMechanics()
      .then(setKnownMechanics)
      .catch(() => {});
  }, []);

  // New slip: show the next ticket number (final number is assigned by the server on save)
  useEffect(() => {
    if (!ticket) {
      api
        .getNextNumber()
        .then(setTicketNo)
        .catch((e) => notify(api.errMsg(e), "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reprint / PDF requested from the History screen
  useEffect(() => {
    if (!ticket || !autoAction) return;
    const run = async () => {
      await wait(400); // let fonts + layout settle
      if (autoAction === "print") await printSlip();
      if (autoAction === "pdf") await downloadPdf();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- derived ----------
  const totalKm = calcTotalKm(form.startKm, form.endKm);
  const kmError =
    form.startKm !== "" &&
    form.endKm !== "" &&
    Number(form.endKm) < Number(form.startKm);
  const isReturnStage = !!saved && saved.status === "OPEN";
  const willComplete = form.endKm !== "";
  const statusNow = saved ? (willComplete ? "COMPLETED" : saved.status) : "NEW";

  // ---------- form handlers ----------
  const set =
    (key, upper = false) =>
    (e) => {
      dirty.current = true;
      const v = upper ? e.target.value.toUpperCase() : e.target.value;
      setForm((f) => ({ ...f, [key]: v }));
    };

  // ---------- mechanics (any number, up to MAX_MECHANICS) ----------
  const setMechanic = (i) => (e) => {
    dirty.current = true;
    const v = e.target.value;
    setForm((f) => ({
      ...f,
      mechanics: f.mechanics.map((m, idx) => (idx === i ? v : m)),
    }));
  };
  const addMechanic = () => {
    if (form.mechanics.length >= MAX_MECHANICS) return;
    dirty.current = true;
    setForm((f) => ({ ...f, mechanics: [...f.mechanics, ""] }));
  };
  const removeMechanic = (i) => {
    dirty.current = true;
    setForm((f) => ({
      ...f,
      mechanics: f.mechanics.filter((_, idx) => idx !== i),
    }));
  };

  const validate = () => {
    if (!form.customerName.trim()) {
      notify("Customer Name is required.", "error");
      return false;
    }
    if (!form.vehicleNo.trim()) {
      notify("Vehicle No. is required.", "error");
      return false;
    }
    if (kmError) {
      notify("End KM cannot be less than Starting KM.", "error");
      return false;
    }
    return true;
  };

  // ---------- save ----------
  const saveTicket = async ({ silent = false } = {}) => {
    if (!validate()) return null;
    setBusy(true);
    try {
      const payload = {
        ...form,
        vehicleNo: form.vehicleNo.trim().toUpperCase(),
      };
      const doc = saved
        ? await api.updateTicket(saved._id, payload)
        : await api.createTicket(payload);
      setSaved(doc);
      setTicketNo(doc.ticketNo);
      dirty.current = false;
      if (!silent) {
        notify(
          doc.status === "COMPLETED"
            ? `Ticket ${doc.ticketNo} updated and marked COMPLETED.`
            : `Ticket ${doc.ticketNo} saved as OPEN.`,
          "success",
        );
      }
      onSaved?.();
      return doc;
    } catch (e) {
      notify(api.errMsg(e), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  // Save only if there is something new; used before print / PDF
  const ensureSaved = async () => {
    if (saved && !dirty.current) return saved;
    return saveTicket({ silent: true });
  };

  // ---------- print + PDF ----------
  const printSlip = async () => {
    const doc = await ensureSaved();
    if (!doc) return;
    setTab("preview");
    await wait(300); // make sure the preview shows the saved ticket number
    window.print();
  };

  const downloadPdf = async () => {
    const doc = await ensureSaved();
    if (!doc) return;
    setTab("preview");
    setExporting(true);
    await wait(350);
    try {
      const fileName = `${doc.ticketNo}_${String(doc.vehicleNo).replace(/[^A-Za-z0-9]/g, "")}.pdf`;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: fileName,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollY: 0,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all"] },
        })
        .from(slipRef.current)
        .save();
      notify(`Downloaded ${fileName}`, "success");
    } catch (e) {
      notify(
        "PDF generation failed. Try the Print Slip button instead.",
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  const saveBranchDefault = async () => {
    try {
      const s = await api.saveBranchSettings(branch);
      onSettingsSaved?.(s);
      notify("Branch title & address saved as default.", "success");
    } catch (e) {
      notify(api.errMsg(e), "error");
    }
  };

  // ---------- render ----------
  return (
    <>
      {/* Mobile tab switcher */}
      <div className="no-print lg:hidden bg-white border border-slate-200 rounded-2xl p-1.5 mb-4 flex gap-1.5 sticky top-16 z-20">
        <button
          onClick={() => setTab("edit")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${tab === "edit" ? "bg-leylandBlue text-white" : "bg-slate-100 text-slate-700"}`}
        >
          <Pencil size={14} className="inline mr-1.5 -mt-0.5" /> Entry Form
        </button>
        <button
          onClick={() => setTab("preview")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${tab === "preview" ? "bg-leylandBlue text-white" : "bg-slate-100 text-slate-700"}`}
        >
          <Printer size={14} className="inline mr-1.5 -mt-0.5" /> Print Preview
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print-reset">
        {/* ============ LEFT: ENTRY FORM ============ */}
        <section
          className={`no-print lg:col-span-5 space-y-5 ${tab === "preview" ? "hidden lg:block" : ""}`}
        >
          {/* Status / stage banner */}
          <div className="card !p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 pl-1">
              <span
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                  statusNow === "COMPLETED"
                    ? "bg-emerald-100 text-emerald-700"
                    : statusNow === "OPEN"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-blue-50 text-leylandBlue"
                }`}
              >
                {statusNow === "NEW" ? "NEW SLIP" : statusNow}
              </span>
              <span className="font-mono text-slate-700">{ticketNo}</span>
            </div>
            <button
              onClick={onNew}
              className="btn !py-1.5 !px-3 !text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Plus size={14} /> New Slip
            </button>
          </div>

          {isReturnStage && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex gap-2.5">
              <Truck size={16} className="shrink-0 mt-0.5" />
              <span>
                <b>Mechanic returned?</b> Enter <b>End KM</b> and{" "}
                <b>Diesel / Petrol Qty</b> below, then press{" "}
                <b>Update &amp; Mark Completed</b>. The status changes to
                COMPLETED and you can reprint the final slip.
              </span>
            </div>
          )}

          {/* Card 1: branch header */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-50 text-leylandBlue flex items-center justify-center">
                  <Building2 size={14} />
                </span>
                Dealership Header
              </h2>
              <button
                type="button"
                onClick={saveBranchDefault}
                className="text-xs font-semibold text-leylandBlue hover:underline cursor-pointer flex items-center gap-1"
              >
                <Bookmark size={12} /> Save as Default
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="lbl">Dealership / Branch Title</label>
                <input
                  className="inp font-semibold"
                  value={branch.dealerName}
                  onChange={(e) =>
                    setBranch((b) => ({ ...b, dealerName: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="lbl">Branch Address &amp; Contact</label>
                <textarea
                  rows={2}
                  className="inp"
                  placeholder="Workshop address, highway landmark, phone number..."
                  value={branch.dealerAddress}
                  onChange={(e) =>
                    setBranch((b) => ({ ...b, dealerAddress: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Card 2: ticket + vehicle */}
          <div className="card">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-lg bg-red-50 text-leylandRed flex items-center justify-center">
                <Truck size={14} />
              </span>
              Ticket &amp; Vehicle Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="lbl">
                  Date <span className="text-leylandRed">*</span>
                </label>
                <input
                  type="date"
                  className="inp font-mono"
                  value={form.date}
                  onChange={set("date")}
                />
              </div>
              <div>
                <label className="lbl">Breakdown Counter .</label>
                <input
                  className="inp font-mono font-bold bg-slate-50"
                  value={ticketNo}
                  readOnly
                  title="Assigned automatically by the server"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="lbl">
                  <p>AL-Ticket-No.</p>
                  Customer Name <span className="text-leylandRed">*</span>
                </label>
                <input
                  className="inp"
                  placeholder="Enter customer or fleet operator name"
                  value={form.customerName}
                  onChange={set("customerName")}
                />
              </div>
              <div>
                <label className="lbl">
                  Vehicle No. <span className="text-leylandRed">*</span>
                </label>
                <input
                  className="inp font-mono font-semibold uppercase"
                  placeholder="e.g. MH-27-XX-XXXX"
                  value={form.vehicleNo}
                  onChange={set("vehicleNo", true)}
                />
              </div>
              <div>
                <label className="lbl">Engine No.</label>
                <input
                  className="inp font-mono uppercase"
                  placeholder="e.g. H6E2C123456"
                  value={form.engineNo}
                  onChange={set("engineNo", true)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="lbl">Chassis No.</label>
                <input
                  className="inp font-mono uppercase"
                  placeholder="e.g. MB1A3CFD5PEX78901"
                  value={form.chassisNo}
                  onChange={set("chassisNo", true)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="lbl">Problem / Breakdown Description</label>
                <textarea
                  rows={3}
                  className="inp"
                  placeholder="Describe vehicle breakdown issue, location, or fault symptoms..."
                  value={form.problem}
                  onChange={set("problem")}
                />
              </div>
            </div>
          </div>

          {/* Card 3: distance, mechanics, fuel */}
          <div className="card">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Route size={14} />
              </span>
              Distance, Mechanics &amp; Fuel
            </h2>

            <div className="grid grid-cols-3 gap-3.5 mb-4">
              <div>
                <label className="lbl">Starting KM</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="inp font-mono !px-3"
                  placeholder="0"
                  value={form.startKm}
                  onChange={set("startKm")}
                />
              </div>
              <div>
                <label
                  className={`lbl ${isReturnStage ? "text-amber-700" : ""}`}
                >
                  End KM {isReturnStage && "← fill"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={`inp font-mono !px-3 ${isReturnStage ? "!border-amber-400 ring-2 ring-amber-200" : ""}`}
                  placeholder="0"
                  value={form.endKm}
                  onChange={set("endKm")}
                />
              </div>
              <div>
                <label className="lbl">Total (KM)</label>
                <input
                  readOnly
                  className="inp font-mono font-bold text-leylandBlue bg-slate-50 !px-3"
                  placeholder="Auto"
                  value={totalKm ?? ""}
                />
              </div>
            </div>

            {kmError && (
              <div className="mb-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                End KM is less than Starting KM. Please verify odometer
                readings.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Mechanics ({form.mechanics.length}/{MAX_MECHANICS})
                  </span>
                  <button
                    type="button"
                    onClick={addMechanic}
                    disabled={form.mechanics.length >= MAX_MECHANICS}
                    className="text-xs font-semibold text-leylandBlue hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer flex items-center gap-1"
                  >
                    <UserPlus size={13} /> Add Mechanic
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {form.mechanics.map((m, i) => (
                    <div key={i}>
                      <label className="lbl">Mechanic Name - {i + 1}</label>
                      <div className="relative">
                        <input
                          list="mechanic-names"
                          className={`inp ${i >= 2 ? "!pr-9" : ""}`}
                          placeholder={
                            i === 0
                              ? "Lead technician name"
                              : i === 1
                                ? "Assistant (optional)"
                                : `Mechanic ${i + 1}`
                          }
                          value={m}
                          onChange={setMechanic(i)}
                        />
                        {i >= 2 && (
                          <button
                            type="button"
                            onClick={() => removeMechanic(i)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-leylandRed hover:bg-red-50 cursor-pointer"
                            title="Remove mechanic"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <datalist id="mechanic-names">
                  {knownMechanics.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="lbl">Travel Mode</label>
                <select
                  className="inp font-semibold"
                  value={form.travelMode}
                  onChange={set("travelMode")}
                >
                  {TRAVEL_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className={`lbl flex items-center gap-1 ${isReturnStage ? "text-amber-700" : ""}`}
                >
                  <Fuel size={12} /> Diesel / Petrol Qty (Ltrs)
                </label>
                <div
                  className={`flex rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-leylandBlue/30 focus-within:border-leylandBlue ${
                    isReturnStage
                      ? "border-amber-400 ring-2 ring-amber-200"
                      : "border-slate-300"
                  }`}
                >
                  <select
                    className="bg-slate-100 border-r border-slate-300 px-2.5 py-2 text-xs font-bold text-slate-700 focus:outline-none"
                    value={form.fuelType}
                    onChange={set("fuelType")}
                  >
                    <option value="Diesel">Diesel</option>
                    <option value="Petrol">Petrol</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
                    placeholder="0.0"
                    value={form.fuelQty}
                    onChange={set("fuelQty")}
                  />
                  <span className="bg-slate-50 px-2.5 text-xs font-semibold text-slate-500 flex items-center">
                    Ltrs
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => saveTicket()}
                className="btn flex-1 bg-leylandBlue hover:bg-leylandDark text-white shadow-sm"
              >
                <Save size={16} />
                {!saved
                  ? "Save Ticket (Dispatch)"
                  : willComplete
                    ? "Update & Mark Completed"
                    : "Update Ticket"}
              </button>
              <button
                type="button"
                disabled={busy || exporting}
                onClick={printSlip}
                className="btn flex-1 bg-leylandRed hover:bg-red-700 text-white shadow-sm"
              >
                <Printer size={16} /> Save &amp; Print
              </button>
            </div>
          </div>
        </section>

        {/* ============ RIGHT: LIVE PRINT PREVIEW ============ */}
        <section
          id="print-area-wrapper"
          className={`lg:col-span-7 lg:sticky lg:top-20 ${tab === "edit" ? "hidden lg:block" : ""}`}
        >
          <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Print Preview (A4 Ready)
            </span>
            <div className="flex gap-2">
              <button
                disabled={busy || exporting}
                onClick={printSlip}
                className="btn !py-2 !px-3.5 !text-xs bg-leylandRed hover:bg-red-700 text-white"
              >
                <Printer size={14} /> Print Slip
              </button>
              <button
                disabled={busy || exporting}
                onClick={downloadPdf}
                className="btn !py-2 !px-3.5 !text-xs bg-leylandBlue hover:bg-leylandDark text-white"
              >
                <FileDown size={14} />{" "}
                {exporting ? "Creating…" : "Download PDF"}
              </button>
            </div>
          </div>

          <SlipPreview
            innerRef={slipRef}
            exporting={exporting}
            branch={branch}
            ticketNo={ticketNo}
            form={form}
            totalKm={totalKm}
          />
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The printable slip (layout follows the workshop slip / reference UI) */
/* ------------------------------------------------------------------ */
function Box({ children, className = "", mono = false }) {
  return (
    <div
      className={`print-box flex-1 border border-slate-800 px-3 py-1.5 text-sm min-h-[34px] flex items-center ${mono ? "font-mono" : ""} ${className}`}
    >
      {children === "" || children == null ? " " : children}
    </div>
  );
}

function Row({ label, children, labelWidth = "w-44" }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm font-bold uppercase shrink-0 ${labelWidth}`}>
        {label}
      </span>
      {children}
    </div>
  );
}

function SlipPreview({ innerRef, exporting, branch, ticketNo, form, totalKm }) {
  const km = (v) => (v !== "" && v != null ? `${v} KM` : "-");

  return (
    <div
      ref={innerRef}
      id="printable-slip"
      className={`bg-white border-2 border-slate-900 p-6 text-slate-950 ${exporting ? "" : "slip-paper rounded-md"}`}
    >
      {/* 1. Header */}
      <div className="text-center border-b-2 border-slate-900 pb-4 mb-5">
        <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide">
          {branch.dealerName || "ASHOK LEYLAND – TRUE AUTOMOTIVES"}
        </h2>
        {branch.dealerAddress && (
          <p className="text-xs sm:text-sm text-slate-700 mt-1 max-w-xl mx-auto leading-relaxed whitespace-pre-line">
            {branch.dealerAddress}
          </p>
        )}
        <div className="mt-3 inline-block border border-slate-900 px-4 py-1 bg-slate-100">
          <span className="text-xs font-extrabold uppercase tracking-widest">
            Breakdown Service Slip
          </span>
        </div>
      </div>

      {/* 2. Date + Ticket No */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <Row label="Date :-" labelWidth="w-14">
          <Box mono className="font-bold bg-slate-50">
            {fmtDate(form.date)}
          </Box>
        </Row>
        <Row label="Ticket No. :-" labelWidth="w-auto">
          <Box mono className="font-extrabold bg-slate-50">
            {ticketNo}
          </Box>
        </Row>
      </div>

      {/* 3. Customer / vehicle / chassis / engine / problem */}
      <div className="space-y-3 mb-5">
        <Row label="Customer Name :-">
          <Box className="font-semibold">{form.customerName}</Box>
        </Row>
        <Row label="Vehicle No. :-">
          <Box mono className="font-bold uppercase">
            {form.vehicleNo}
          </Box>
        </Row>
        <Row label="Chassis No. :-">
          <Box mono className="font-semibold uppercase">
            {form.chassisNo}
          </Box>
        </Row>
        <Row label="Engine No. :-">
          <Box mono className="font-semibold uppercase">
            {form.engineNo}
          </Box>
        </Row>
        <div className="pt-1">
          <span className="block text-sm font-bold uppercase mb-1.5">
            Problem :-
          </span>
          <div className="print-box w-full border border-slate-800 p-3 text-sm leading-relaxed min-h-[96px] whitespace-pre-wrap">
            {form.problem || " "}
          </div>
        </div>
      </div>

      {/* 4. Odometer */}
      <div className="border-t border-dashed border-slate-400 pt-4 mb-5 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Row label="Starting KM :-" labelWidth="w-auto">
            <Box mono className="font-semibold justify-end">
              {km(form.startKm)}
            </Box>
          </Row>
          <Row label="End KM :-" labelWidth="w-auto">
            <Box mono className="font-semibold justify-end">
              {km(form.endKm)}
            </Box>
          </Row>
        </div>
        <Row label="Total Travel Distance :-" labelWidth="w-auto">
          <div className="print-box border border-slate-800 bg-slate-100 px-3 py-1.5 font-mono text-sm font-extrabold min-h-[34px] w-48 flex items-center justify-between">
            <span>{totalKm ?? "-"}</span>
            <span className="text-xs font-bold uppercase text-slate-600">
              KM
            </span>
          </div>
        </Row>
      </div>

      {/* 5. Mechanics */}
      <div className="space-y-3 mb-5">
        <Row label="Mechanic Name :- 1">
          <Box className="font-semibold">{form.mechanics[0]}</Box>
        </Row>
        <Row label="Mechanic Name :- 2">
          <Box className="font-semibold">{form.mechanics[1]}</Box>
        </Row>
        {/* Extra mechanics sit two per row so the slip still fits on one A4 page */}
        {form.mechanics.length > 2 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {form.mechanics.slice(2).map((m, i) => (
              <Row key={i} label={`Mechanic ${i + 3} :-`} labelWidth="w-auto">
                <Box className="font-semibold">{m}</Box>
              </Row>
            ))}
          </div>
        )}
      </div>

      {/* 6. Travel mode + fuel */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-dashed border-slate-400">
        <Row label="Travel Mode :-" labelWidth="w-auto">
          <Box className="font-bold">{form.travelMode}</Box>
        </Row>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold uppercase whitespace-nowrap">
            {form.fuelType} Qty :-
          </span>
          <div className="print-box border border-slate-800 px-2.5 py-1.5 font-mono text-sm font-bold min-h-[34px] w-24 flex items-center justify-center">
            {form.fuelQty !== "" && form.fuelQty != null ? form.fuelQty : "-"}
          </div>
          <span className="text-sm font-bold uppercase">Ltrs</span>
        </div>
      </div>

      {/* 7. Signatures */}
      <div className="pt-14 mt-6 border-t border-slate-300 flex items-end justify-between gap-8">
        <div className="text-center w-52">
          <div className="border-b-2 border-slate-900 h-8 mb-1.5" />
          <span className="text-sm font-extrabold uppercase tracking-wide">
            Customer Sign :-
          </span>
        </div>
        <div className="text-center w-52">
          <div className="border-b-2 border-slate-900 h-8 mb-1.5" />
          <span className="text-sm font-extrabold uppercase tracking-wide">
            Mechanic Sign
          </span>
        </div>
      </div>
    </div>
  );
}
