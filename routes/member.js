const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const Member = require('../models/Member');
const Gym = require('../models/Gym');
const EventLog = require('../models/EventLog');
const MembershipRequest = require('../models/MembershipRequest');
const MacroLog = require('../models/MacroLog');
const ProgressLog = require('../models/ProgressLog');
const cloudinary = require('cloudinary').v2;

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });


// Log a macro entry (Member only)
router.post('/macros', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { food, macros } = req.body;

    if (!food || !macros || !macros.calories || !macros.protein || !macros.carbs || !macros.fats) {
        return res.status(400).json({ message: 'Food and macros (calories, protein, carbs, fats) are required' });
    }

    try {
        const macroLog = new MacroLog({
            member: req.user.id,
            food,
            macros,
        });

        await macroLog.save();
        res.status(201).json({ message: 'Macro logged', macroLog });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all macro logs for the member
router.get('/macros', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const macroLogs = await MacroLog.find({ member: req.user.id }).sort({ date: -1 });
        res.json(macroLogs);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update a macro log
router.put('/macros/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { food, macros } = req.body;

    if (!food || !macros || !macros.calories || !macros.protein || !macros.carbs || !macros.fats) {
        return res.status(400).json({ message: 'Food and macros (calories, protein, carbs, fats) are required' });
    }

    try {
        const macroLog = await MacroLog.findById(req.params.id);
        if (!macroLog) {
            return res.status(404).json({ message: 'Macro log not found' });
        }

        if (macroLog.member.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to edit this log' });
        }

        macroLog.food = food;
        macroLog.macros = macros;
        await macroLog.save();

        res.json({ message: 'Macro log updated', macroLog });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete a macro log
router.delete('/macros/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const macroLog = await MacroLog.findById(req.params.id);
        if (!macroLog) {
            return res.status(404).json({ message: 'Macro log not found' });
        }

        if (macroLog.member.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to delete this log' });
        }

        await macroLog.deleteOne();
        res.json({ message: 'Macro log deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Log a progress entry (Member only)
router.post('/progress', authMiddleware, upload.array('images', 3), async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { weight, muscleMass, fatPercentage } = req.body;

    if (!weight || !muscleMass || !fatPercentage) {
        return res.status(400).json({ message: 'Weight, muscle mass, and fat percentage are required' });
    }

    try {
        let images = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map((file) =>
                new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: 'progress_images' },
                        (error, result) => {
                            if (error) reject(error);
                            resolve(result.secure_url);
                        }
                    ).end(file.buffer);
                })
            );
            images = await Promise.all(uploadPromises);
        }

        const progressLog = new ProgressLog({
            member: req.user.id,
            weight,
            muscleMass,
            fatPercentage,
            images,
        });

        await progressLog.save();
        res.status(201).json({ message: 'Progress logged', progressLog });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all progress logs for the member
router.get('/progress', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const progressLogs = await ProgressLog.find({ member: req.user.id }).sort({ date: -1 });
        res.json(progressLogs);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update a progress log
router.put('/progress/:id', authMiddleware, upload.array('images', 3), async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { weight, muscleMass, fatPercentage, deleteImages } = req.body;

    if (!weight || !muscleMass || !fatPercentage) {
        return res.status(400).json({ message: 'Weight, muscle mass, and fat percentage are required' });
    }

    try {
        const progressLog = await ProgressLog.findById(req.params.id);
        if (!progressLog) {
            return res.status(404).json({ message: 'Progress log not found' });
        }

        if (progressLog.member.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to edit this log' });
        }

        progressLog.weight = weight;
        progressLog.muscleMass = muscleMass;
        progressLog.fatPercentage = fatPercentage;

        // Handle image deletions
        if (deleteImages) {
            const imagesToDelete = JSON.parse(deleteImages);
            for (const imageUrl of imagesToDelete) {
                const publicId = imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`progress_images/${publicId}`);
                progressLog.images = progressLog.images.filter((image) => image !== imageUrl);
            }
        }

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map((file) =>
                new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: 'progress_images' },
                        (error, result) => {
                            if (error) reject(error);
                            resolve(result.secure_url);
                        }
                    ).end(file.buffer);
                })
            );
            const uploadedImages = await Promise.all(uploadPromises);
            progressLog.images.push(...uploadedImages);
        }

        await progressLog.save();
        res.json({ message: 'Progress log updated', progressLog });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete a progress log
router.delete('/progress/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const progressLog = await ProgressLog.findById(req.params.id);
        if (!progressLog) {
            return res.status(404).json({ message: 'Progress log not found' });
        }

        if (progressLog.member.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to delete this log' });
        }

        // Delete images from Cloudinary
        if (progressLog.images && progressLog.images.length > 0) {
            for (const imageUrl of progressLog.images) {
                const publicId = imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`progress_images/${publicId}`);
            }
        }

        await progressLog.deleteOne();
        res.json({ message: 'Progress log deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});


// Leave gym (Member only)
router.post('/leave-gym', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const member = await Member.findById(req.user.id);
        if (!member || !member.gym) {
            return res.status(404).json({ message: 'Member not found or not in a gym' });
        }

        const gym = await Gym.findById(member.gym);
        if (!gym) {
            return res.status(404).json({ message: 'Gym not found' });
        }

        // Remove member from gym
        gym.members = gym.members.filter((id) => id.toString() !== req.user.id);
        await gym.save();

        // Clear gym and membership from member
        member.gym = undefined;
        member.membership = undefined;
        await member.save();

        // Log the leave gym event
        const eventLog = new EventLog({
            event: 'Leave Gym',
            page: '/member-dashboard',
            user: req.user.id,
            userModel: 'Member',
            details: `Member left gym ${gym.gymName}`,
        });
        await eventLog.save();

        res.json({ message: 'Left gym successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Request membership update (Member only)
router.post('/membership-request', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { requestedDuration } = req.body;

    if (!requestedDuration) {
        return res.status(400).json({ message: 'Requested duration is required' });
    }

    const validDurations = ['1 week', '1 month', '3 months', '6 months', '1 year'];
    if (!validDurations.includes(requestedDuration)) {
        return res.status(400).json({ message: 'Invalid membership duration' });
    }

    try {
        const member = await Member.findById(req.user.id);
        if (!member || !member.gym) {
            return res.status(404).json({ message: 'Member not found or not in a gym' });
        }

        const gym = await Gym.findById(member.gym);
        if (!gym) {
            return res.status(404).json({ message: 'Gym not found' });
        }

        const existingRequest = await MembershipRequest.findOne({
            member: req.user.id,
            gym: member.gym,
            status: 'pending',
        });
        if (existingRequest) {
            return res.status(400).json({ message: 'You already have a pending membership request' });
        }

        const membershipRequest = new MembershipRequest({
            member: req.user.id,
            gym: member.gym,
            requestedDuration,
        });

        await membershipRequest.save();

        // Log the membership request event
        const eventLog = new EventLog({
            event: 'Membership Request',
            page: '/membership-update',
            user: req.user.id,
            userModel: 'Member',
            details: `Member requested membership update to ${requestedDuration}`,
        });
        await eventLog.save();

        res.status(201).json({ message: 'Membership request sent', membershipRequest });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get membership requests for a Member
router.get('/membership-requests', authMiddleware, async (req, res) => {
    if (req.user.role !== 'member') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const member = await Member.findById(req.user.id);
        if (!member || !member.gym) {
            return res.status(404).json({ message: 'Member not found or not in a gym' });
        }

        const membershipRequests = await MembershipRequest.find({ member: req.user.id })
            .populate('gym', 'gymName')
            .sort({ createdAt: -1 });

        res.json(membershipRequests);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;