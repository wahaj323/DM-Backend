import express from 'express';
import QuizAttempt from '../models/QuizAttempt.js';
import Quiz from '../models/Quiz.js';
import Activity from '../models/Activity.js';
import { protect } from '../middleware/auth.js';
import { gradeQuiz } from '../utils/grading.js';

const router = express.Router();

// @route   POST /api/attempts/submit/:quizId
// @desc    Submit quiz attempt
// @access  Private/Student
router.post('/submit/:quizId', protect, async (req, res) => {
  try {
    const { answers, startedAt, submittedAt } = req.body;

    const quiz = await Quiz.findById(req.params.quizId).populate('courseId');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (!quiz.published) {
      return res.status(403).json({ message: 'Quiz is not published' });
    }

    // Check if student has attempts left
    const previousAttempts = await QuizAttempt.find({
      studentId: req.user._id,
      quizId: quiz._id
    });

    if (previousAttempts.length >= quiz.settings.maxAttempts) {
      return res.status(403).json({ message: 'Maximum attempts reached' });
    }

    // Grade the quiz
    const gradingResults = gradeQuiz(quiz, answers);

    // Calculate time spent
    const timeSpent = Math.floor(
      (new Date(submittedAt) - new Date(startedAt)) / 1000
    );

    // Create attempt record
    const attempt = await QuizAttempt.create({
      studentId: req.user._id,
      quizId: quiz._id,
      courseId: quiz.courseId._id,
      answers: gradingResults.answers,
      score: gradingResults.score,
      totalPoints: gradingResults.totalPoints,
      earnedPoints: gradingResults.earnedPoints,
      startedAt: new Date(startedAt),
      submittedAt: new Date(submittedAt),
      timeSpent,
      passed: gradingResults.passed,
      attemptNumber: previousAttempts.length + 1
    });

    // Update quiz statistics
    const allAttempts = await QuizAttempt.find({ quizId: quiz._id });
    quiz.totalAttempts = allAttempts.length;
    quiz.averageScore = Math.round(
      allAttempts.reduce((sum, a) => sum + a.score, 0) / allAttempts.length
    );
    await quiz.save();

    // Log activity
    await Activity.create({
      userId: req.user._id,
      type: gradingResults.passed ? 'quiz_passed' : 'quiz_attempted',
      description: `${gradingResults.passed ? 'Passed' : 'Attempted'} quiz: ${quiz.title} (Score: ${gradingResults.score}%)`,
      metadata: {
        quizId: quiz._id,
        courseId: quiz.courseId._id,
        score: gradingResults.score,
        passed: gradingResults.passed
      }
    });

    res.status(201).json({
      attempt,
      showAnswers: quiz.settings.showAnswers,
      allowReview: quiz.settings.allowReview
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attempts/quiz/:quizId
// @desc    Get student's attempts for a quiz
// @access  Private/Student
router.get('/quiz/:quizId', protect, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({
      studentId: req.user._id,
      quizId: req.params.quizId
    }).sort({ createdAt: -1 });

    res.json(attempts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attempts/:id
// @desc    Get single attempt details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const attempt = await QuizAttempt.findById(req.params.id)
      .populate('quizId')
      .populate('studentId', 'name email');

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    // Check access
    if (attempt.studentId._id.toString() !== req.user._id.toString() &&
        attempt.quizId.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(attempt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attempts/student/history
// @desc    Get student's quiz attempt history
// @access  Private/Student
router.get('/student/history', protect, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({ studentId: req.user._id })
      .populate('quizId', 'title')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 });

    res.json(attempts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attempts/course/:courseId
// @desc    Get all attempts for a course (Teacher)
// @access  Private/Teacher
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attempts = await QuizAttempt.find({ courseId: req.params.courseId })
      .populate('studentId', 'name email')
      .populate('quizId', 'title')
      .sort({ createdAt: -1 });

    res.json(attempts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/attempts/:id/feedback
// @desc    Add teacher feedback to attempt
// @access  Private/Teacher
router.put('/:id/feedback', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { feedback } = req.body;

    const attempt = await QuizAttempt.findById(req.params.id);

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    attempt.feedback = feedback;
    attempt.teacherReviewed = true;
    attempt.reviewedAt = new Date();

    await attempt.save();

    res.json(attempt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attempts/student/:studentId/stats
// @desc    Get student quiz statistics
// @access  Private/Teacher
router.get('/student/:studentId/stats', protect, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const attempts = await QuizAttempt.find({ 
      studentId: req.params.studentId 
    });

    const stats = {
      totalAttempts: attempts.length,
      averageScore: attempts.length > 0
        ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length)
        : 0,
      passedQuizzes: attempts.filter(a => a.passed).length,
      failedQuizzes: attempts.filter(a => !a.passed).length,
      passRate: attempts.length > 0
        ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100)
        : 0,
      highestScore: attempts.length > 0
        ? Math.max(...attempts.map(a => a.score))
        : 0,
      recentAttempts: attempts.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      ).slice(0, 5)
    };

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;