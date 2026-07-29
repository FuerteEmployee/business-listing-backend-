const Slider = require('../models/Slider');

// @desc    Get all sliders
// @route   GET /api/sliders
const getSliders = async (req, res) => {
    try {
        const sliders = await Slider.find().sort({ order: 1, createdAt: -1 });
        res.json({ success: true, count: sliders.length, data: sliders });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Get single slider
// @route   GET /api/sliders/:id
const getSlider = async (req, res) => {
    try {
        const slider = await Slider.findById(req.params.id);
        if (!slider) return res.status(404).json({ success: false, msg: 'Slider not found' });
        res.json({ success: true, data: slider });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ success: false, msg: 'Slider not found' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Create new slider
// @route   POST /api/sliders
const createSlider = async (req, res) => {
    try {
        const slider = await Slider.create(req.body);
        res.status(201).json({ success: true, data: slider });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Update slider
// @route   PUT /api/sliders/:id
const updateSlider = async (req, res) => {
    try {
        let slider = await Slider.findById(req.params.id);
        if (!slider) return res.status(404).json({ success: false, msg: 'Slider not found' });

        slider = await Slider.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.json({ success: true, data: slider });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ success: false, msg: 'Slider not found' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Delete slider
// @route   DELETE /api/sliders/:id
const deleteSlider = async (req, res) => {
    try {
        const slider = await Slider.findById(req.params.id);
        if (!slider) return res.status(404).json({ success: false, msg: 'Slider not found' });

        await slider.deleteOne();
        res.json({ success: true, msg: 'Slider removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ success: false, msg: 'Slider not found' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

module.exports = {
    getSliders,
    getSlider,
    createSlider,
    updateSlider,
    deleteSlider
};
