const express = require('express');
const c = require('../controllers/ticketController');

const router = express.Router();

// Branch header/address settings
router.get('/settings/branch', c.getSettings);
router.put('/settings/branch', c.saveSettings);

// Previously used mechanic names (for suggestions)
router.get('/mechanics', c.listMechanics);

// Tickets (specific routes BEFORE the :id routes)
router.get('/tickets/next-number', c.getNextNumber);
router.get('/tickets/export/csv', c.exportCSV);
router.get('/tickets', c.listTickets);
router.post('/tickets', c.createTicket);
router.get('/tickets/:id', c.getTicket);
router.put('/tickets/:id', c.updateTicket);
router.delete('/tickets/:id', c.deleteTicket);

module.exports = router;
