import express from 'express';
import Lesson from '../models/Lesson.js';
import Module from '../models/Module.js';
import Course from '../models/Course.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/lessons/:id
// @desc    Get single lesson with all blocks
// @access  Public/Private
router.get('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/lessons/:id
// @desc    Update lesson (including blocks)
// @access  Private/Teacher
router.put('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    let lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { 
      title, 
      description, 
      type, 
      order, 
      isPublished, 
      isLocked, 
      estimatedDuration,
      blocks,
      vocabItems,
      ttsSettings
    } = req.body;

    lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { 
        title, 
        description, 
        type, 
        order, 
        isPublished, 
        isLocked, 
        estimatedDuration,
        blocks: blocks || lesson.blocks,
        vocabItems: vocabItems || lesson.vocabItems,
        ttsSettings: ttsSettings || lesson.ttsSettings
      },
      { new: true, runValidators: true }
    );

    res.json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/lessons/:id/blocks
// @desc    Update lesson blocks only
// @access  Private/Teacher
router.put('/:id/blocks', protect, authorizeTeacher, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { blocks } = req.body;

    if (!Array.isArray(blocks)) {
      return res.status(400).json({ message: 'Blocks must be an array' });
    }

    lesson.blocks = blocks;
    await lesson.save();

    res.json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/lessons/:id
// @desc    Delete lesson
// @access  Private/Teacher
router.delete('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Remove from module
    module.lessons = module.lessons.filter(l => l.toString() !== req.params.id);
    await module.save();

    // Delete lesson
    await Lesson.findByIdAndDelete(req.params.id);

    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/lessons/:id/reorder
// @desc    Reorder lessons in module
// @access  Private/Teacher
router.put('/:id/reorder', protect, authorizeTeacher, async (req, res) => {
  try {
    const { newOrder } = req.body; // Array of lesson IDs in new order

    if (!Array.isArray(newOrder)) {
      return res.status(400).json({ message: 'Please provide an array of lesson IDs' });
    }

    // Update order for each lesson
    const updatePromises = newOrder.map((lessonId, index) => 
      Lesson.findByIdAndUpdate(lessonId, { order: index })
    );

    await Promise.all(updatePromises);

    res.json({ message: 'Lessons reordered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;