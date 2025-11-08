import express from 'express';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import fs from 'fs';

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('enrolledCourses.courseId', 'title description');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) user.name = name;

    await user.save();

    // Log activity
    await Activity.create({
      userId: user._id,
      type: 'profile_updated',
      description: 'Updated profile information'
    });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users/profile/image
// @desc    Upload profile image
// @access  Private
router.post('/profile/image', protect, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete old image from Cloudinary if exists
    if (user.profileImage) {
      const publicId = user.profileImage.split('/').pop().split('.')[0];
      await deleteFromCloudinary(`deutschmeister/${publicId}`);
    }

    // Upload new image to Cloudinary
    const result = await uploadToCloudinary(req.file, 'deutschmeister/profiles');

    // Delete local file
    fs.unlinkSync(req.file.path);

    user.profileImage = result.url;
    await user.save();

    res.json({
      profileImage: user.profileImage
    });
  } catch (error) {
    console.error(error);
    // Clean up file if upload fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Failed to upload image' });
  }
});

// @route   GET /api/users/activity
// @desc    Get user activity feed
// @access  Private
router.get('/activity', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const activities = await Activity.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .populate('metadata.courseId', 'title')
      .populate('metadata.lessonId', 'title');

    const total = await Activity.countDocuments({ userId: req.user._id });

    res.json({
      activities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const stats = {
      enrolledCourses: user.enrolledCourses.length,
      unlockedLessons: user.unlockedLessons.length,
      vocabularyCount: user.personalDictionary.length,
      completedLessons: await Activity.countDocuments({
        userId: req.user._id,
        type: 'lesson_completed'
      }),
      quizzesPassed: await Activity.countDocuments({
        userId: req.user._id,
        type: 'quiz_passed'
      })
    };

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;