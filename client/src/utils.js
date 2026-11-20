// YYYY-MM-DD (or ISO string) -> DD-MM-YYYY for Indian slips
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : String(iso);
};

// Today in local time as YYYY-MM-DD (for <input type="date">)
export const todayISO = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// End KM - Start KM, or null if it cannot be computed
export const calcTotalKm = (start, end) => {
  if (start === '' || end === '' || start == null || end == null) return null;
  const s = Number(start);
  const e = Number(end);
  if (isNaN(s) || isNaN(e) || e < s) return null;
  return Math.round((e - s) * 10) / 10;
};

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
