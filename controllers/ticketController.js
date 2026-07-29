const Ticket = require('../models/Ticket');
const Message = require('../models/Message');

// @desc    User: Create a support ticket
// @route   POST /api/tickets
// @access  Private
exports.createTicket = async (req, res) => {
    try {
        const { subject, category, description, attachments } = req.body;
        
        const ticketId = `TKT-${Math.floor(Math.random() * 900000) + 100000}`;
        
        const ticket = new Ticket({
            ticketId,
            userId: req.user._id,
            subject,
            category,
            description,
            attachments
        });

        await ticket.save();

        // Save initial message
        const message = new Message({
            ticketId: ticket._id,
            senderId: req.user._id,
            message: description,
            attachments
        });
        await message.save();

        res.status(201).json({ success: true, ticket });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    User: Get my tickets
// @route   GET /api/tickets/my-tickets
// @access  Private
exports.getMyTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    User/Admin: Get ticket details and messages
// @route   GET /api/tickets/:id
// @access  Private
exports.getTicketDetails = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id).populate('userId', 'name email');
        if (!ticket) return res.status(404).json({ msg: 'Ticket not found' });

        // Access control: User can only see their own ticket, Admin sees all
        if (req.user.role !== 'Super Admin' && ticket.userId._id.toString() !== req.user._id.toString()) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        const messages = await Message.find({ 
            ticketId: ticket._id,
            isInternal: req.user.role === 'Super Admin' ? undefined : false
        }).populate('senderId', 'name role').sort({ createdAt: 1 });

        res.json({ ticket, messages });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    User/Admin: Reply to ticket
// @route   POST /api/tickets/:id/reply
// @access  Private
exports.replyToTicket = async (req, res) => {
    try {
        const { message, attachments, isInternal } = req.body;
        const ticket = await Ticket.findById(req.params.id);
        
        if (!ticket) return res.status(404).json({ msg: 'Ticket not found' });

        const newMessage = new Message({
            ticketId: ticket._id,
            senderId: req.user._id,
            message,
            attachments,
            isInternal: req.user.role === 'Super Admin' ? isInternal : false
        });

        await newMessage.save();

        // Update ticket last response
        ticket.lastResponseAt = Date.now();
        if (req.user.role === 'Super Admin') {
            ticket.status = 'pending_user';
        } else {
            ticket.status = 'open';
        }
        await ticket.save();

        res.status(201).json(newMessage);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
