const express = require('express');
const router = express.Router();
const { createTicket, getMyTickets, getTicketDetails, replyToTicket } = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createTicket);
router.get('/my-tickets', protect, getMyTickets);
router.get('/:id', protect, getTicketDetails);
router.post('/:id/reply', protect, replyToTicket);

module.exports = router;
