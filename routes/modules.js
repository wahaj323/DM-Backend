import express from 'express';
import Module from '../models/Module.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/modules
// @desc    Create a new module
// @access  Private/Teacher
router.post('/', protect, authorizeTeacher, async (req, res) => {
  try {
    const { title, description, courseId, order } = req.body;

    if (!title || !courseId) {
      return res.status(400).json({ message: 'Please provide title and courseId' });
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const module = await Module.create({
      title,
      description,
      courseId,
      order: order !== undefined ? order : course.modules.length
    });

    // Add module to course
    course.modules.push(module._id);
    await course.save();

    res.status(201).json(module);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/modules/:id
// @desc    Get single module with lessons
// @access  Public/Private
router.get('/:id', async (req, res) => {
  try {
    const module = await Module.findById(req.params.id)
      .populate('lessons');

    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    res.json(module);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/modules/:id
// @desc    Update module
// @access  Private/Teacher
router.put('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    let module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, order, isPublished } = req.body;

    module = await Module.findByIdAndUpdate(
      req.params.id,
      { title, description, order, isPublished },
      { new: true, runValidators: true }
    );

    res.json(module);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/modules/:id
// @desc    Delete module
// @access  Private/Teacher
router.delete('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete all lessons in module
    await Lesson.deleteMany({ moduleId: module._id });

    // Remove from course
    course.modules = course.modules.filter(m => m.toString() !== req.params.id);
    await course.save();

    // Delete module
    await Module.findByIdAndDelete(req.params.id);

    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/modules/:id/lessons
// @desc    Add lesson to module
// @access  Private/Teacher
router.post('/:id/lessons', protect, authorizeTeacher, async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const course = await Course.findById(module.courseId);

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, type, order } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Please provide a title' });
    }

    const lesson = await Lesson.create({
      title,
      description,
      type: type || 'lecture',
      moduleId: module._id,
      order: order !== undefined ? order : module.lessons.length
    });

    // Add lesson to module
    module.lessons.push(lesson._id);
    await module.save();

    res.status(201).json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/modules/:id/reorder
// @desc    Reorder modules in course
// @access  Private/Teacher
router.put('/:id/reorder', protect, authorizeTeacher, async (req, res) => {
  try {
    const { newOrder } = req.body; // Array of module IDs in new order

    if (!Array.isArray(newOrder)) {
      return res.status(400).json({ message: 'Please provide an array of module IDs' });
    }

    // Update order for each module
    const updatePromises = newOrder.map((moduleId, index) => 
      Module.findByIdAndUpdate(moduleId, { order: index })
    );

    await Promise.all(updatePromises);

    res.json({ message: 'Modules reordered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;