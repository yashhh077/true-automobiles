const mongoose = require('mongoose');

// Single-document settings: branch title + address shown on every slip
const settingSchema = new mongoose.Schema({
  key: { type: String, default: 'branch', unique: true },
  dealerName: { type: String, default: 'ASHOK LEYLAND – TRUE AUTOMOTIVES' },
  dealerAddress: {
    type: String,
    default: 'Authorized Service Center, Amravati, Maharashtra | Helpline: +91 00000 00000',
  },
});

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
