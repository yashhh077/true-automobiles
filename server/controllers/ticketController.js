const { Parser } = require('json2csv');
const { Ticket, nextTicketNo, peekTicketNo } = require('../models/Ticket');
const Setting = require('../models/Setting');

// ---------- helpers ----------
const numOrNull = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

function cleanPayload(body) {
  const out = {};
  const strFields = ['customerName', 'vehicleNo', 'chassisNo', 'engineNo', 'problem', 'travelMode', 'fuelType'];
  strFields.forEach((f) => {
    if (body[f] !== undefined) out[f] = String(body[f]).trim();
  });
  if (Array.isArray(body.mechanics)) {
    out.mechanics = body.mechanics.map((m) => String(m || '').trim()).filter(Boolean).slice(0, 6);
    // reset legacy fields so removing mechanics really removes them (model re-syncs them)
    out.mechanic1 = '';
    out.mechanic2 = '';
  }
  if (body.date) out.date = new Date(body.date);
  if (body.startKm !== undefined) out.startKm = numOrNull(body.startKm);
  if (body.endKm !== undefined) out.endKm = numOrNull(body.endKm);
  if (body.fuelQty !== undefined) out.fuelQty = numOrNull(body.fuelQty);
  return out;
}

function buildFilter(q) {
  const filter = {};
  if (q.status && q.status !== 'ALL') filter.status = q.status;

  if (q.search) {
    const rx = new RegExp(String(q.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { ticketNo: rx },
      { vehicleNo: rx },
      { customerName: rx },
      { mechanics: rx },
      { mechanic1: rx },
      { mechanic2: rx },
    ];
  }

  if (q.from || q.to) {
    filter.date = {};
    // Slip dates are stored as UTC midnight of the chosen day, so filter in UTC too
    if (q.from) filter.date.$gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) filter.date.$lte = new Date(`${q.to}T23:59:59.999Z`);
  }
  return filter;
}

// Works for new tickets (mechanics[]) and old ones (mechanic1/2 only)
const mechList = (t) =>
  t.mechanics && t.mechanics.length ? t.mechanics : [t.mechanic1, t.mechanic2].filter(Boolean);

// ---------- handlers ----------
// Names used before, for the dropdown suggestions in the form
exports.listMechanics = async (req, res) => {
  try {
    const [fromArray, m1, m2] = await Promise.all([
      Ticket.distinct('mechanics'),
      Ticket.distinct('mechanic1'),
      Ticket.distinct('mechanic2'),
    ]);
    const names = [...new Set([...fromArray, ...m1, ...m2].map((n) => String(n || '').trim()).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    res.json(names);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getNextNumber = async (req, res) => {
  try {
    res.json({ ticketNo: await peekTicketNo() });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find(buildFilter(req.query)).sort({ date: -1, createdAt: -1 });
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    res.json(t);
  } catch (e) {
    res.status(400).json({ message: 'Invalid ticket id' });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const data = cleanPayload(req.body);
    if (!data.customerName || !data.vehicleNo) {
      return res.status(400).json({ message: 'Customer Name and Vehicle No. are required' });
    }
    if (data.startKm != null && data.endKm != null && data.endKm < data.startKm) {
      return res.status(400).json({ message: 'End KM cannot be less than Starting KM' });
    }
    data.ticketNo = await nextTicketNo(data.date || new Date());
    const ticket = await Ticket.create(data);
    res.status(201).json(ticket);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const data = cleanPayload(req.body);
    ticket.set(data);

    if (ticket.startKm != null && ticket.endKm != null && ticket.endKm < ticket.startKm) {
      return res.status(400).json({ message: 'End KM cannot be less than Starting KM' });
    }
    await ticket.save(); // pre-validate hook recalculates totalKm + status
    res.json(ticket);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.deleteTicket = async (req, res) => {
  try {
    const t = await Ticket.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ message: 'Ticket deleted' });
  } catch (e) {
    res.status(400).json({ message: 'Invalid ticket id' });
  }
};

exports.exportCSV = async (req, res) => {
  try {
    const tickets = await Ticket.find(buildFilter(req.query)).sort({ date: 1, createdAt: 1 }).lean();

    const fmt = (d) => {
      if (!d) return '';
      const x = new Date(d);
      return `${String(x.getUTCDate()).padStart(2, '0')}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${x.getUTCFullYear()}`;
    };

    const rows = tickets.map((t) => ({
      Date: fmt(t.date),
      'Ticket No': t.ticketNo,
      Status: t.status,
      'Customer Name': t.customerName,
      'Vehicle No': t.vehicleNo,
      'Chassis No': t.chassisNo,
      'Engine No': t.engineNo,
      Problem: t.problem,
      'Starting KM': t.startKm ?? '',
      'End KM': t.endKm ?? '',
      'Total Travel KM': t.totalKm ?? '',
      'Mechanic Count': mechList(t).length,
      Mechanics: mechList(t).join(' / '),
      'Travel Mode': t.travelMode,
      'Fuel Type': t.fuelType,
      'Fuel Qty (Ltrs)': t.fuelQty ?? '',
    }));

    const fields = rows.length
      ? Object.keys(rows[0])
      : ['Date', 'Ticket No', 'Status', 'Customer Name', 'Vehicle No', 'Chassis No', 'Engine No', 'Problem', 'Starting KM', 'End KM', 'Total Travel KM', 'Mechanic Count', 'Mechanics', 'Travel Mode', 'Fuel Type', 'Fuel Qty (Ltrs)'];

    const csv = new Parser({ fields, withBOM: true }).parse(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="True_Automotives_Breakdown_Log_${stamp}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- branch settings ----------
exports.getSettings = async (req, res) => {
  try {
    let s = await Setting.findOne({ key: 'branch' });
    if (!s) s = await Setting.create({ key: 'branch' });
    res.json(s);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const { dealerName, dealerAddress } = req.body;
    const s = await Setting.findOneAndUpdate(
      { key: 'branch' },
      { $set: { dealerName: String(dealerName || '').trim(), dealerAddress: String(dealerAddress || '').trim() } },
      { new: true, upsert: true }
    );
    res.json(s);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
