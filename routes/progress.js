import express from 'express';
import Progress from '../models/Progress.js';
import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';
import Activity from '../models/Activity.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/progress/course/:courseId
// @desc    Get student's progress for a course
// @access  Private/Student
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId)
      .populate({
        path: 'modules',
        populate: {
          path: 'lessons'
        }
      });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get all progress records for this course
    const progressRecords = await Progress.find({
      studentId: req.user._id,
      courseId: req.params.courseId
    });

    // Calculate statistics
    const totalLessons = course.modules.reduce((acc, module) => 
      acc + (module.lessons?.length || 0), 0
    );

    const completedLessons = progressRecords.filter(p => p.status === 'completed').length;
    const inProgressLessons = progressRecords.filter(p => p.status === 'in_progress').length;
    const totalTimeSpent = progressRecords.reduce((acc, p) => acc + p.timeSpent, 0);

    const progressPercentage = totalLessons > 0 
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    // Get next lesson to study
    let nextLesson = null;
    for (const module of course.modules) {
      if (module.lessons && module.lessons.length > 0) {
        for (const lesson of module.lessons) {
          const progress = progressRecords.find(p => 
            p.lessonId.toString() === lesson._id.toString()
          );
          
          if (!progress || progress.status !== 'completed') {
            // Check if lesson is unlocked
            const isUnlocked = req.user.unlockedLessons.some(
              l => l.toString() === lesson._id.toString()
            );
            
            if (isUnlocked) {
              nextLesson = {
                lessonId: lesson._id,
                lessonTitle: lesson.title,
                moduleTitle: module.title
              };
              break;
            }
          }
        }
        if (nextLesson) break;
      }
    }

    res.json({
      courseId: course._id,
      courseTitle: course.title,
      totalLessons,
      completedLessons,
      inProgressLessons,
      progressPercentage,
      totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to minutes
      nextLesson,
      progressRecords
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/progress/lesson/:lessonId
// @desc    Get progress for a specific lesson
// @access  Private/Student
router.get('/lesson/:lessonId', protect, async (req, res) => {
  try {
    const progress = await Progress.findOne({
      studentId: req.user._id,
      lessonId: req.params.lessonId
    });

    if (!progress) {
      return res.json({
        status: 'not_started',
        timeSpent: 0,
        attempts: 0
      });
    }

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/progress/start/:lessonId
// @desc    Mark lesson as started/in-progress
// @access  Private/Student
router.post('/start/:lessonId', protect, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    // Check if lesson is unlocked
    const isUnlocked = req.user.unlockedLessons.some(
      l => l.toString() === req.params.lessonId
    );

    if (!isUnlocked) {
      return res.status(403).json({ message: 'Lesson is locked' });
    }

    // Find or create progress record
    let progress = await Progress.findOne({
      studentId: req.user._id,
      lessonId: req.params.lessonId
    });

    if (progress) {
      progress.status = 'in_progress';
      progress.lastAccessedAt = new Date();
      progress.attempts += 1;
    } else {
      progress = await Progress.create({
        studentId: req.user._id,
        courseId: course._id,
        moduleId: module._id,
        lessonId: lesson._id,
        status: 'in_progress',
        attempts: 1
      });
    }

    await progress.save();

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/progress/complete/:lessonId
// @desc    Mark lesson as completed
// @access  Private/Student
router.post('/complete/:lessonId', protect, async (req, res) => {
  try {
    const { timeSpent, score } = req.body;

    const lesson = await Lesson.findById(req.params.lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    // Find or create progress record
    let progress = await Progress.findOne({
      studentId: req.user._id,
      lessonId: req.params.lessonId
    });

    if (progress) {
      progress.status = 'completed';
      progress.completedAt = new Date();
      progress.timeSpent += timeSpent || 0;
      if (score !== undefined) progress.score = score;
    } else {
      progress = await Progress.create({
        studentId: req.user._id,
        courseId: course._id,
        moduleId: module._id,
        lessonId: lesson._id,
        status: 'completed',
        completedAt: new Date(),
        timeSpent: timeSpent || 0,
        score: score || null
      });
    }

    await progress.save();

    // Log activity
    await Activity.create({
      userId: req.user._id,
      type: 'lesson_completed',
      description: `Completed lesson: ${lesson.title}`,
      metadata: {
        courseId: course._id,
        lessonId: lesson._id,
        moduleId: module._id,
        timeSpent,
        score
      }
    });

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/progress/time/:lessonId
// @desc    Update time spent on lesson
// @access  Private/Student
router.put('/time/:lessonId', protect, async (req, res) => {
  try {
    const { timeSpent } = req.body;

    let progress = await Progress.findOne({
      studentId: req.user._id,
      lessonId: req.params.lessonId
    });

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    progress.timeSpent += timeSpent || 0;
    progress.lastAccessedAt = new Date();
    await progress.save();

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/progress/bookmark/:lessonId
// @desc    Toggle bookmark for lesson
// @access  Private/Student
router.post('/bookmark/:lessonId', protect, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const module = await Module.findById(lesson.moduleId);
    const course = await Course.findById(module.courseId);

    let progress = await Progress.findOne({
      studentId: req.user._id,
      lessonId: req.params.lessonId
    });

    if (!progress) {
      progress = await Progress.create({
        studentId: req.user._id,
        courseId: course._id,
        moduleId: module._id,
        lessonId: lesson._id,
        bookmarked: true
      });
    } else {
      progress.bookmarked = !progress.bookmarked;
      await progress.save();
    }

    res.json({ bookmarked: progress.bookmarked });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/progress/dashboard
// @desc    Get overall progress dashboard
// @access  Private/Student
router.get('/dashboard', protect, async (req, res) => {
  try {
    // Get all courses student is enrolled in
    const enrolledCourseIds = req.user.enrolledCourses.map(e => e.courseId);

    // Get all progress records
    const allProgress = await Progress.find({
      studentId: req.user._id
    }).populate('courseId', 'title')
      .populate('lessonId', 'title');

    // Get course-wise progress
    const courseProgress = [];
    
    for (const courseId of enrolledCourseIds) {
      const course = await Course.findById(courseId).populate('modules');
      if (!course) continue;

      const totalLessons = course.modules.reduce((acc, module) => 
        acc + (module.lessons?.length || 0), 0
      );

      const courseProgressRecords = allProgress.filter(p => 
        p.courseId._id.toString() === courseId.toString()
      );

      const completedLessons = courseProgressRecords.filter(p => 
        p.status === 'completed'
      ).length;

      const progressPercentage = totalLessons > 0 
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

      courseProgress.push({
        courseId: course._id,
        courseTitle: course.title,
        totalLessons,
        completedLessons,
        progressPercentage,
        lastAccessed: courseProgressRecords.length > 0 
          ? courseProgressRecords.sort((a, b) => 
              new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt)
            )[0].lastAccessedAt
          : null
      });
    }

    // Overall statistics
    const totalLessonsAcrossAllCourses = courseProgress.reduce((acc, c) => 
      acc + c.totalLessons, 0
    );
    const totalCompletedLessons = courseProgress.reduce((acc, c) => 
      acc + c.completedLessons, 0
    );
    const overallProgress = totalLessonsAcrossAllCourses > 0
      ? Math.round((totalCompletedLessons / totalLessonsAcrossAllCourses) * 100)
      : 0;

    const totalTimeSpent = allProgress.reduce((acc, p) => 
      acc + p.timeSpent, 0
    );

    // Recent lessons
    const recentLessons = allProgress
      .sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt))
      .slice(0, 5);

    // Bookmarked lessons
    const bookmarkedLessons = allProgress.filter(p => p.bookmarked);

    res.json({
      overallProgress,
      totalLessonsAcrossAllCourses,
      totalCompletedLessons,
      totalTimeSpent: Math.round(totalTimeSpent / 3600), // Convert to hours
      courseProgress,
      recentLessons,
      bookmarkedLessons
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;