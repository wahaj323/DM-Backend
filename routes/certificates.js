import express from 'express';
import Certificate from '../models/Certificate.js';
import Progress from '../models/Progress.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// Generate unique certificate number
const generateCertificateNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `CERT-${timestamp}-${random}`;
};

// @route   POST /api/certificates/generate/:courseId
// @desc    Generate certificate for course completion
// @access  Private/Student
router.post('/generate/:courseId', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId)
      .populate('teacherId', 'name')
      .populate('modules');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if student is enrolled
    const isEnrolled = course.enrolledStudents.some(
      e => e.studentId.toString() === req.user._id.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({ message: 'You are not enrolled in this course' });
    }

    // Check if already has certificate
    const existingCert = await Certificate.findOne({
      studentId: req.user._id,
      courseId: req.params.courseId
    });

    if (existingCert) {
      return res.status(400).json({ 
        message: 'Certificate already issued',
        certificate: existingCert
      });
    }

    // Get all lessons in course
    const totalLessons = course.modules.reduce((acc, module) => 
      acc + (module.lessons?.length || 0), 0
    );

    // Check completion status
    const progressRecords = await Progress.find({
      studentId: req.user._id,
      courseId: req.params.courseId
    });

    const completedLessons = progressRecords.filter(p => 
      p.status === 'completed'
    ).length;

    if (completedLessons < totalLessons) {
      return res.status(400).json({ 
        message: 'Course not completed yet',
        completed: completedLessons,
        total: totalLessons
      });
    }

    // Calculate total time spent
    const totalTimeSpent = progressRecords.reduce((acc, p) => 
      acc + p.timeSpent, 0
    );

    // Generate certificate
    const certificate = await Certificate.create({
      studentId: req.user._id,
      courseId: course._id,
      certificateNumber: generateCertificateNumber(),
      completionDate: new Date(),
      totalLessons,
      totalTimeSpent: Math.round(totalTimeSpent / 3600), // Convert to hours
      teacherName: course.teacherId.name,
      teacherId: course.teacherId._id
    });

    res.status(201).json(certificate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/certificates
// @desc    Get all certificates for student
// @access  Private/Student
router.get('/', protect, async (req, res) => {
  try {
    const certificates = await Certificate.find({ studentId: req.user._id })
      .populate('courseId', 'title level category')
      .sort({ issuedAt: -1 });

    res.json(certificates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/certificates/:id
// @desc    Get single certificate
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('studentId', 'name email')
      .populate('courseId', 'title level category description')
      .populate('teacherId', 'name');

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    // Check access (student or teacher)
    if (certificate.studentId._id.toString() !== req.user._id.toString() &&
        certificate.teacherId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(certificate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/certificates/verify/:certificateNumber
// @desc    Verify certificate by number
// @access  Public
router.get('/verify/:certificateNumber', async (req, res) => {
  try {
    const certificate = await Certificate.findOne({ 
      certificateNumber: req.params.certificateNumber 
    })
      .populate('studentId', 'name email')
      .populate('courseId', 'title level category')
      .populate('teacherId', 'name');

    if (!certificate) {
      return res.status(404).json({ 
        valid: false,
        message: 'Certificate not found' 
      });
    }

    res.json({
      valid: true,
      certificate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;