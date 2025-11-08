import express from 'express';
import Quiz from '../models/Quiz.js';
import Course from '../models/Course.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/quizzes
// @desc    Create new quiz
// @access  Private/Teacher
router.post('/', protect, authorizeTeacher, async (req, res) => {
  try {
    const { title, description, courseId, moduleId, lessonId, questions, settings } = req.body;

    // Verify course exists and teacher owns it
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const quiz = await Quiz.create({
      title,
      description,
      courseId,
      moduleId,
      lessonId,
      teacherId: req.user._id,
      questions: questions || [],
      settings: settings || {}
    });

    res.status(201).json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/quizzes/course/:courseId
// @desc    Get all quizzes for a course
// @access  Private
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ courseId: req.params.courseId })
      .populate('teacherId', 'name email')
      .sort({ createdAt: -1 });

    // If student, only show published quizzes with attempt data
    if (req.user.role === 'student') {
      const publishedQuizzes = quizzes.filter(q => q.published);
      
      // ✅ Add attempt data for each quiz
      const quizzesWithAttempts = await Promise.all(
        publishedQuizzes.map(async (quiz) => {
          const attempts = await QuizAttempt.find({
            studentId: req.user._id,
            quizId: quiz._id
          });

          const attemptCount = attempts.length;
          const maxAttempts = quiz.settings.maxAttempts;
          const remainingAttempts = maxAttempts === 0 ? 999 : maxAttempts - attemptCount;

          return {
            ...quiz.toObject(),
            attemptCount,
            remainingAttempts,
            canAttempt: remainingAttempts > 0,
            bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null
          };
        })
      );

      return res.json(quizzesWithAttempts);
    }

    // Teachers get all quizzes
    res.json(quizzes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/quizzes/:id
// @desc    Get single quiz by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
      .populate('courseId', 'title')
      .populate('teacherId', 'name email');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Students can only see published quizzes
    if (req.user.role === 'student' && !quiz.published) {
      return res.status(403).json({ message: 'Quiz not available' });
    }

    // If student, check remaining attempts
    if (req.user.role === 'student') {
      const attempts = await QuizAttempt.find({
        studentId: req.user._id,
        quizId: quiz._id
      });

      const attemptCount = attempts.length;
      const maxAttempts = quiz.settings.maxAttempts;
      const remainingAttempts = maxAttempts === 0 ? 999 : maxAttempts - attemptCount;

      return res.json({
        ...quiz.toObject(),
        attemptCount,
        remainingAttempts,
        canAttempt: remainingAttempts > 0,
        bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null
      });
    }

    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/quizzes/:id
// @desc    Update quiz
// @access  Private/Teacher
router.put('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, questions, settings, published } = req.body;

    if (title) quiz.title = title;
    if (description !== undefined) quiz.description = description;
    if (questions) quiz.questions = questions;
    if (settings) quiz.settings = { ...quiz.settings, ...settings };
    if (published !== undefined) quiz.published = published;

    await quiz.save();
    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/quizzes/:id
// @desc    Delete quiz
// @access  Private/Teacher
router.delete('/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete all attempts for this quiz
    await QuizAttempt.deleteMany({ quizId: quiz._id });

    await quiz.deleteOne();
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/quizzes/:id/publish
// @desc    Publish/unpublish quiz
// @access  Private/Teacher
router.post('/:id/publish', protect, authorizeTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    quiz.published = !quiz.published;
    await quiz.save();

    res.json({ 
      message: quiz.published ? 'Quiz published' : 'Quiz unpublished',
      published: quiz.published
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/quizzes/:id/stats
// @desc    Get quiz statistics
// @access  Private/Teacher
router.get('/:id/stats', protect, authorizeTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const attempts = await QuizAttempt.find({ quizId: quiz._id })
      .populate('studentId', 'name email');

    const stats = {
      totalAttempts: attempts.length,
      uniqueStudents: new Set(attempts.map(a => a.studentId._id.toString())).size,
      averageScore: attempts.length > 0
        ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length)
        : 0,
      passRate: attempts.length > 0
        ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100)
        : 0,
      highestScore: attempts.length > 0
        ? Math.max(...attempts.map(a => a.score))
        : 0,
      lowestScore: attempts.length > 0
        ? Math.min(...attempts.map(a => a.score))
        : 0,
      recentAttempts: attempts.slice(0, 10)
    };

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;