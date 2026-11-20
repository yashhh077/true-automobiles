import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

// Turn any axios error into a readable message
export const errMsg = (e) =>
  e?.response?.data?.message || (e?.code === 'ERR_NETWORK' ? 'Cannot reach server. Is the backend running?' : e?.message) || 'Something went wrong';

// ---- Tickets ----
export const getNextNumber = () => http.get('/tickets/next-number').then((r) => r.data.ticketNo);
export const listTickets = (params = {}) => http.get('/tickets', { params: clean(params) }).then((r) => r.data);
export const createTicket = (data) => http.post('/tickets', data).then((r) => r.data);
export const updateTicket = (id, data) => http.put(`/tickets/${id}`, data).then((r) => r.data);
export const deleteTicket = (id) => http.delete(`/tickets/${id}`).then((r) => r.data);

// ---- Previously used mechanic names (suggestions) ----
export const listMechanics = () => http.get('/mechanics').then((r) => r.data);

// ---- Branch settings ----
export const getBranchSettings = () => http.get('/settings/branch').then((r) => r.data);
export const saveBranchSettings = (data) => http.put('/settings/branch', data).then((r) => r.data);

// ---- CSV export (downloads a file in the browser) ----
export const exportCsv = async (params = {}) => {
  const res = await http.get('/tickets/export/csv', { params: clean(params), responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `True_Automotives_Breakdown_Log_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Drop empty filter values so they are not sent as ?status=&from=
function clean(params) {
  const out = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) out[k] = v;
  });
  return out;
}
