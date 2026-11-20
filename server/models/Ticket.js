const mongoose = require('mongoose');

// ---- Counter: one document per year, used for BD-YYYY-NNNN auto-increment ----
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "ticket-2026"
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function nextTicketNo(date = new Date()) {
  const year = date.getFullYear();
  const counter = await Counter.findByIdAndUpdate(
    `ticket-${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `BD-${year}-${String(counter.seq).padStart(4, '0')}`;
}

// Peek at the next number without consuming it (for display in the form)
async function peekTicketNo(date = new Date()) {
  const year = date.getFullYear();
  const counter = await Counter.findById(`ticket-${year}`);
  const next = (counter ? counter.seq : 0) + 1;
  return `BD-${year}-${String(next).padStart(4, '0')}`;
}

// ---- Ticket ----
const ticketSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, unique: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    customerName: { type: String, trim: true, required: true },
    vehicleNo: { type: String, trim: true, uppercase: true, required: true, index: true },
    chassisNo: { type: String, trim: true, uppercase: true, default: '' },
    engineNo: { type: String, trim: true, uppercase: true, default: '' },
    problem: { type: String, trim: true, default: '' },
    startKm: { type: Number, default: null },
    endKm: { type: Number, default: null },
    totalKm: { type: Number, default: null },
    // Any number of mechanics (max 6). mechanic1/mechanic2 are kept in sync for old records and quick access.
    mechanics: { type: [String], default: [] },
    mechanic1: { type: String, trim: true, default: '' },
    mechanic2: { type: String, trim: true, default: '' },
    travelMode: { type: String, enum: ['Bike', 'MSV', 'Pickup Van', 'Other'], default: 'Bike' },
    fuelType: { type: String, enum: ['Diesel', 'Petrol'], default: 'Diesel' },
    fuelQty: { type: Number, default: null },
    status: { type: String, enum: ['OPEN', 'COMPLETED'], default: 'OPEN', index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Keep totalKm and status consistent on every save
ticketSchema.pre('validate', function (next) {
  // Mechanics: use the array; old tickets (only mechanic1/2) are migrated on the fly
  let list = (this.mechanics || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!list.length) list = [this.mechanic1, this.mechanic2].map((s) => String(s || '').trim()).filter(Boolean);
  this.mechanics = list.slice(0, 6);
  this.mechanic1 = this.mechanics[0] || '';
  this.mechanic2 = this.mechanics[1] || '';

  const hasStart = typeof this.startKm === 'number';
  const hasEnd = typeof this.endKm === 'number';

  if (hasStart && hasEnd && this.endKm >= this.startKm) {
    this.totalKm = Math.round((this.endKm - this.startKm) * 10) / 10;
  } else {
    this.totalKm = null;
  }

  if (hasEnd) {
    if (this.status !== 'COMPLETED') this.completedAt = new Date();
    this.status = 'COMPLETED';
  } else {
    this.status = 'OPEN';
    this.completedAt = null;
  }
  next();
});

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

module.exports = { Ticket, nextTicketNo, peekTicketNo };
