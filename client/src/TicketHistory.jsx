import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileDown, FileSpreadsheet, Loader2, Pencil, Printer, RotateCcw, Search, Trash2 } from 'lucide-react';
import * as api from './api';
import { fmtDate } from './utils';

const EMPTY_FILTERS = { search: '', status: 'ALL', from: '', to: '' };

export default function TicketHistory({ onOpen, notify, onChanged }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Debounce the text search so we do not hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const query = useMemo(
    () => ({ search: debouncedSearch, status: filters.status, from: filters.from, to: filters.to }),
    [debouncedSearch, filters.status, filters.from, filters.to]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets(await api.listTickets(query));
    } catch (e) {
      notify(api.errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [query, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  // Totals for the current (filtered) list
  const totals = useMemo(() => {
    let km = 0;
    let diesel = 0;
    let petrol = 0;
    tickets.forEach((t) => {
      km += t.totalKm || 0;
      if (t.fuelType === 'Petrol') petrol += t.fuelQty || 0;
      else diesel += t.fuelQty || 0;
    });
    const r = (n) => Math.round(n * 10) / 10;
    return { km: r(km), diesel: r(diesel), petrol: r(petrol) };
  }, [tickets]);

  const confirmDelete = async () => {
    const t = toDelete;
    setToDelete(null);
    try {
      await api.deleteTicket(t._id);
      notify(`Ticket ${t.ticketNo} deleted.`, 'info');
      load();
      onChanged?.();
    } catch (e) {
      notify(api.errMsg(e), 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportCsv(query);
      notify('CSV downloaded (current filters applied).', 'success');
    } catch (e) {
      notify(api.errMsg(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-slate-800">Saved Breakdown Tickets</h2>
          <button onClick={handleExport} disabled={exporting} className="btn !py-2 !px-3.5 !text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="inp !pl-10"
              placeholder="Search Ticket No, Vehicle No, Customer, Mechanic..."
              value={filters.search}
              onChange={setF('search')}
            />
          </div>
          <div className="md:col-span-2">
            <select className="inp font-semibold" value={filters.status} onChange={setF('status')}>
              <option value="ALL">All Status</option>
              <option value="OPEN">OPEN</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <input type="date" className="inp font-mono" value={filters.from} onChange={setF('from')} title="From date" />
          </div>
          <div className="md:col-span-2">
            <input type="date" className="inp font-mono" value={filters.to} onChange={setF('to')} title="To date" />
          </div>
          <div className="md:col-span-1">
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="btn w-full !px-2 bg-slate-100 text-slate-700 hover:bg-slate-200" title="Reset filters">
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Tickets" value={tickets.length} />
          <Stat label="Total KM" value={`${totals.km} km`} />
          <Stat label="Diesel" value={`${totals.diesel} L`} />
          <Stat label="Petrol" value={`${totals.petrol} L`} />
        </div>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {['Date', 'Ticket No', 'Customer', 'Vehicle No', 'Mechanic(s)', 'Mode', 'Start', 'End', 'Total KM', 'Fuel', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left font-bold px-3 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <Loader2 className="animate-spin inline mr-2" size={16} /> Loading…
                  </td>
                </tr>
              )}
              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-14 text-center text-slate-500">
                    <p className="font-semibold text-slate-600">No breakdown tickets found</p>
                    <p className="text-xs mt-1">Saved slips will appear here for reprinting and completion.</p>
                  </td>
                </tr>
              )}
              {!loading &&
                tickets.map((t) => (
                  <tr key={t._id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">{fmtDate(t.date)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-leylandBlue font-mono text-xs font-bold">{t.ticketNo}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900 min-w-[150px]">{t.customerName}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs font-bold">{t.vehicleNo}</td>
                    <td className="px-3 py-3 text-xs text-slate-600 min-w-[130px]">
                      {(t.mechanics?.length ? t.mechanics : [t.mechanic1, t.mechanic2].filter(Boolean)).join(', ') || '-'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs">{t.travelMode}</td>
                    <td className="px-3 py-3 font-mono text-xs text-right">{t.startKm ?? '-'}</td>
                    <td className="px-3 py-3 font-mono text-xs text-right">{t.endKm ?? '-'}</td>
                    <td className="px-3 py-3 font-mono text-xs text-right font-bold">{t.totalKm ?? '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">
                      {t.fuelQty != null ? `${t.fuelQty} L ${t.fuelType === 'Petrol' ? 'P' : 'D'}` : '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                          t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => onOpen(t, 'edit')} className="btn !py-1.5 !px-2.5 !text-xs bg-leylandBlue hover:bg-leylandDark text-white whitespace-nowrap" title="Load / Edit (add End KM)">
                          <Pencil size={13} /> {t.status === 'OPEN' ? 'Add End KM' : 'Edit'}
                        </button>
                        <button onClick={() => onOpen(t, 'print')} className="btn !py-1.5 !px-2 bg-slate-100 hover:bg-slate-200 text-slate-700" title="Reprint">
                          <Printer size={14} />
                        </button>
                        <button onClick={() => onOpen(t, 'pdf')} className="btn !py-1.5 !px-2 bg-slate-100 hover:bg-slate-200 text-slate-700" title="Download PDF">
                          <FileDown size={14} />
                        </button>
                        <button onClick={() => setToDelete(t)} className="btn !py-1.5 !px-2 bg-red-50 hover:bg-red-100 text-leylandRed" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-leylandRed flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Delete ticket?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              <b className="font-mono">{toDelete.ticketNo}</b> ({toDelete.vehicleNo}) will be permanently removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setToDelete(null)} className="btn bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
              <button onClick={confirmDelete} className="btn bg-leylandRed text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-mono text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
