import express from 'express';
import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// Helper middleware to optionally authenticate
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      // Token invalid, but continue anyway
      req.user = null;
    }
  }
  next();
};

// @route   GET /api/courses
// @desc    Get all courses (public if published, all for teacher)
// @access  Public/Private
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { level, category, search, published } = req.query;
    
    let query = {};

    // If not authenticated or not a teacher, only show published courses
    if (!req.user || req.user.role === 'student') {
      query.isPublished = true;
    } else if (published !== undefined) {
      query.isPublished = published === 'true';
    }

    // Filters
    if (level) query.level = level;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await Course.find(query)
      .populate('teacherId', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses/my-courses
// @desc    Get teacher's courses
// @access  Private/Teacher
router.get('/my-courses', protect, authorizeTeacher, async (req, res) => {
  try {
    const courses = await Course.find({ teacherId: req.user._id })
      .populate('modules')
      .sort({ createdAt: -1 });

    res.json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/courses/:id
// @desc    Get single course
// @access  Public/Private (but requires auth to view unpublished)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacherId', 'name email profileImage')
      .populate({
        path: 'modules',
        populate: {
          path: 'lessons'
        }
      });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user can access this course
    if (!course.isPublished) {
      // Unpublished course - only teacher can view
      if (!req.user || 
          (req.user.role !== 'teacher' && req.user.role !== 'admin') ||
          course.teacherId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'This course is not published yet' });
      }
    }

    res.json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/courses
// @desc    Create a new course
// @access  Private/Teacher
router.post('/', protect, authorizeTeacher, async (req, res) => {
  try {
    const { title, description, level, category, tags, difficulty, estimatedDuration } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Please provide title and description' });
    }

    const course = await Course.create({
      title,
      description,
      level: level || 'A1',
      category: category || 'General German',
      tags: tags || [],
      difficulty: difficulty || 'Beginner',
      estimatedDuration: estimatedDuration || 0,
      teacherId: req.user._id
    });

    res.status(201).json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course
// @access  Private/Teacher
router.put('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this course' });
    }

    const { title, description, level, category, tags, difficulty, estimatedDuration } = req.body;

    course = await Course.findByIdAndUpdate(
      req.params.id,
      { title, description, level, category, tags, difficulty, estimatedDuration },
      { new: true, runValidators: true }
    );

    res.json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete course
// @access  Private/Teacher
router.delete('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this course' });
    }

    // Delete all modules and lessons
    for (const moduleId of course.modules) {
      const module = await Module.findById(moduleId);
      if (module) {
        // Delete all lessons in module
        await Lesson.deleteMany({ moduleId: module._id });
        // Delete module
        await Module.findByIdAndDelete(moduleId);
      }
    }

    // Delete course
    await Course.findByIdAndDelete(req.params.id);

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/courses/:id/publish
// @desc    Publish/Unpublish course
// @access  Private/Teacher
router.put('/:id/publish', protect, authorizeTeacher, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check ownership
    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    course.isPublished = !course.isPublished;
    if (course.isPublished) {
      course.publishedAt = new Date();
    }

    await course.save();

    res.json(course);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/courses/:id/enroll/:studentId
// @desc    Enroll student in course
// @access  Private/Teacher
router.post('/:id/enroll/:studentId', protect, authorizeTeacher, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    const student = await User.findById(req.params.studentId);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if already enrolled
    const alreadyEnrolled = course.enrolledStudents.some(
      e => e.studentId.toString() === req.params.studentId
    );

    if (alreadyEnrolled) {
      return res.status(400).json({ message: 'Student already enrolled' });
    }

    // Add to course
    course.enrolledStudents.push({
      studentId: req.params.studentId,
      enrolledAt: new Date(),
      progress: 0
    });

    await course.save();

    // Add to student
    student.enrolledCourses.push({
      courseId: course._id,
      enrolledAt: new Date()
    });

    await student.save();

    // Log activity
    await Activity.create({
      userId: student._id,
      type: 'course_enrolled',
      description: `Enrolled in ${course.title}`,
      metadata: { courseId: course._id }
    });

    res.json({ message: 'Student enrolled successfully', course });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/courses/:id/unenroll/:studentId
// @desc    Unenroll student from course
// @access  Private/Teacher
router.delete('/:id/unenroll/:studentId', protect, authorizeTeacher, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    const student = await User.findById(req.params.studentId);

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Remove from course
    course.enrolledStudents = course.enrolledStudents.filter(
      e => e.studentId.toString() !== req.params.studentId
    );

    await course.save();

    // Remove from student
    student.enrolledCourses = student.enrolledCourses.filter(
      e => e.courseId.toString() !== req.params.id
    );

    await student.save();

    res.json({ message: 'Student unenrolled successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;