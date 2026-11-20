import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FilePlus2,
  History,
  Info,
  AlertCircle,
  TruckIcon,
} from "lucide-react";
import BreakdownSlip from "./BreakdownSlip.jsx";
import TicketHistory from "./TicketHistory.jsx";
import * as api from "./api";

const DEFAULT_SETTINGS = {
  dealerName: "ASHOK LEYLAND – TRUE AUTOMOBILES",
  dealerAddress: "",
};

export default function App() {
  const [view, setView] = useState("slip"); // 'slip' | 'history'
  const [settings, setSettings] = useState(null);
  const [count, setCount] = useState(0);
  const [toasts, setToasts] = useState([]);

  // What the slip screen is showing: a brand-new slip or an existing ticket
  const [slipKey, setSlipKey] = useState(0);
  const [activeTicket, setActiveTicket] = useState(null);
  const [autoAction, setAutoAction] = useState(null);

  const toastId = useRef(0);

  const notify = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refreshCount = useCallback(() => {
    api
      .listTickets({})
      .then((list) => setCount(list.length))
      .catch(() => {});
  }, []);

  // Load branch header/address once
  useEffect(() => {
    api
      .getBranchSettings()
      .then(setSettings)
      .catch((e) => {
        setSettings(DEFAULT_SETTINGS);
        notify(api.errMsg(e), "error");
      });
    refreshCount();
  }, [notify, refreshCount]);

  const startNewSlip = () => {
    setActiveTicket(null);
    setAutoAction(null);
    setSlipKey((k) => k + 1);
    setView("slip");
  };

  // Called from History: edit (add End KM), reprint or download PDF
  const openTicket = (ticket, action) => {
    setActiveTicket(ticket);
    setAutoAction(action === "edit" ? null : action);
    setSlipKey((k) => k + 1);
    setView("slip");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toasts */}
      <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium max-w-sm ${
              t.type === "success"
                ? "bg-emerald-700 text-white border-emerald-800"
                : t.type === "error"
                  ? "bg-leylandRed text-white border-red-800"
                  : "bg-slate-900 text-white border-slate-700"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : t.type === "error" ? (
              <AlertCircle size={16} />
            ) : (
              <Info size={16} />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="no-print bg-leylandBlue text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white text-leylandBlue font-extrabold px-2.5 py-1.5 rounded-lg tracking-tight text-sm sm:text-base flex items-center gap-1.5">
              <TruckIcon size={18} className="text-leylandRed" />
              <span>ASHOK LEYLAND</span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-blue-400/40" />
            <div>
              <h1 className="font-bold text-sm sm:text-lg leading-tight tracking-wide">
                TRUE AUTOMOBILES
              </h1>
              <p className="text-[11px] text-blue-200 hidden md:block">
                Roadside Breakdown &amp; MSV Dispatch Slip System
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={startNewSlip}
              className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium flex items-center gap-2 transition cursor-pointer ${
                view === "slip"
                  ? "bg-white text-leylandBlue border-white"
                  : "bg-blue-900/70 hover:bg-blue-800 border-blue-400/30"
              }`}
            >
              <FilePlus2 size={16} />{" "}
              <span className="hidden sm:inline">New Slip</span>
            </button>
            <button
              onClick={() => {
                setView("history");
                refreshCount();
              }}
              className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium flex items-center gap-2 transition cursor-pointer ${
                view === "history"
                  ? "bg-white text-leylandBlue border-white"
                  : "bg-blue-900/70 hover:bg-blue-800 border-blue-400/30"
              }`}
            >
              <History size={16} />
              <span className="hidden sm:inline">Saved Tickets</span>
              <span className="bg-leylandRed text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!settings ? (
          <p className="text-center text-slate-500 py-20">Loading…</p>
        ) : view === "slip" ? (
          <BreakdownSlip
            key={slipKey}
            ticket={activeTicket}
            settings={settings}
            onSettingsSaved={setSettings}
            notify={notify}
            onSaved={refreshCount}
            onNew={startNewSlip}
            autoAction={autoAction}
          />
        ) : (
          <TicketHistory
            onOpen={openTicket}
            notify={notify}
            onChanged={refreshCount}
          />
        )}
      </main>
    </div>
  );
}
