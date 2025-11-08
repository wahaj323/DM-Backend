import express from "express";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import Lesson from "../models/Lesson.js";
import Quiz from '../models/Quiz.js';
import { protect, authorizeTeacher } from "../middleware/auth.js";

const router = express.Router();

// @route   GET /api/students
// @desc    Get all students (teacher only)
// @access  Private/Teacher
router.get("/", protect, authorizeTeacher, async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = { role: "student" };

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === "asc" ? 1 : -1;

    const students = await User.find(query)
      .select("-password")
      .sort({ [sortBy]: sortOrder })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await User.countDocuments(query);

    res.json({
      students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   GET /api/students/:id
// @desc    Get single student details (teacher only)
// @access  Private/Teacher
router.get("/:id", protect, authorizeTeacher, async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select("-password");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (student.role !== "student") {
      return res.status(400).json({ message: "User is not a student" });
    }

    // Get student's recent activity
    const recentActivity = await Activity.find({ userId: student._id })
      .sort({ timestamp: -1 })
      .limit(10);

    res.json({
      student,
      recentActivity,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/students/:id/toggle-active
// @desc    Activate/deactivate student account (teacher only)
// @access  Private/Teacher
router.put(
  "/:id/toggle-active",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      if (student.role !== "student") {
        return res.status(400).json({ message: "User is not a student" });
      }

      student.isActive = !student.isActive;
      await student.save();

      res.json({
        message: `Student ${
          student.isActive ? "activated" : "deactivated"
        } successfully`,
        isActive: student.isActive,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/students/:id/enroll
// @desc    Enroll student in a course (teacher only)
// @access  Private/Teacher
router.post("/:id/enroll", protect, authorizeTeacher, async (req, res) => {
  try {
    const { courseId, cohortId } = req.body;

    if (!courseId) {
      return res.status(400).json({ message: "Course ID is required" });
    }

    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Check if already enrolled
    const alreadyEnrolled = student.enrolledCourses.some(
      (course) => course.courseId.toString() === courseId
    );

    if (alreadyEnrolled) {
      return res
        .status(400)
        .json({ message: "Student already enrolled in this course" });
    }

    student.enrolledCourses.push({
      courseId,
      cohortId: cohortId || "default",
      enrolledAt: new Date(),
    });

    await student.save();

    // Log activity
    await Activity.create({
      userId: student._id,
      type: "course_enrolled",
      description: "Enrolled in a new course",
      metadata: { courseId },
    });

    res.json({
      message: "Student enrolled successfully",
      enrolledCourses: student.enrolledCourses,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   DELETE /api/students/:id/unenroll/:courseId
// @desc    Unenroll student from a course (teacher only)
// @access  Private/Teacher
router.delete(
  "/:id/unenroll/:courseId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      student.enrolledCourses = student.enrolledCourses.filter(
        (course) => course.courseId.toString() !== req.params.courseId
      );

      await student.save();

      res.json({
        message: "Student unenrolled successfully",
        enrolledCourses: student.enrolledCourses,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   GET /api/students/:id/progress
// @desc    Get student progress summary (teacher only)
// @access  Private/Teacher
router.get("/:id/progress", protect, authorizeTeacher, async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const progress = {
      enrolledCourses: student.enrolledCourses.length,
      unlockedLessons: student.unlockedLessons.length,
      vocabularyCount: student.personalDictionary.length,
      completedLessons: await Activity.countDocuments({
        userId: student._id,
        type: "lesson_completed",
      }),
      quizzesPassed: await Activity.countDocuments({
        userId: student._id,
        type: "quiz_passed",
      }),
      totalActivities: await Activity.countDocuments({ userId: student._id }),
    };

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   POST /api/students/:id/unlock-lesson/:lessonId
// @desc    Unlock a lesson for a student
// @access  Private/Teacher
router.post(
  "/:id/unlock-lesson/:lessonId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id);
      const lesson = await Lesson.findById(req.params.lessonId);

      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }

      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      // Check if already unlocked
      const alreadyUnlocked = student.unlockedLessons.some(
        (l) => l.toString() === req.params.lessonId
      );

      if (alreadyUnlocked) {
        return res
          .status(400)
          .json({ message: "Lesson already unlocked for this student" });
      }

      // Unlock lesson
      student.unlockedLessons.push(req.params.lessonId);
      await student.save();

      res.json({
        message: "Lesson unlocked successfully",
        unlockedLessons: student.unlockedLessons,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   DELETE /api/students/:id/unlock-lesson/:lessonId
// @desc    Lock a lesson for a student (remove unlock)
// @access  Private/Teacher
router.delete(
  "/:id/unlock-lesson/:lessonId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id);

      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }

      // Remove lesson from unlocked list
      student.unlockedLessons = student.unlockedLessons.filter(
        (l) => l.toString() !== req.params.lessonId
      );
      await student.save();

      res.json({
        message: "Lesson locked successfully",
        unlockedLessons: student.unlockedLessons,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/students/:id/unlock-module/:moduleId
// @desc    Unlock all lessons in a module for a student
// @access  Private/Teacher
router.post(
  "/:id/unlock-module/:moduleId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.id);
      const Module = (await import("../models/Module.js")).default;
      const module = await Module.findById(req.params.moduleId).populate(
        "lessons"
      );

      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }

      if (!module) {
        return res.status(404).json({ message: "Module not found" });
      }

      // Unlock all lessons in module
      const lessonIds = module.lessons.map((l) => l._id.toString());

      lessonIds.forEach((lessonId) => {
        if (!student.unlockedLessons.some((l) => l.toString() === lessonId)) {
          student.unlockedLessons.push(lessonId);
        }
      });

      await student.save();

      res.json({
        message: `Unlocked ${lessonIds.length} lessons in module`,
        unlockedLessons: student.unlockedLessons,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/students/:studentId/unlock-quiz/:quizId
// @desc    Unlock a quiz for a student
// @access  Private/Teacher
router.post(
  "/:studentId/unlock-quiz/:quizId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.studentId);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      if (student.role !== "student") {
        return res.status(400).json({ message: "User is not a student" });
      }

      // Check if quiz exists
      const quiz = await Quiz.findById(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      // Check if already unlocked
      if (!student.unlockedQuizzes.includes(req.params.quizId)) {
        student.unlockedQuizzes.push(req.params.quizId);
        await student.save();

        // Log activity
        await Activity.create({
          userId: req.user._id,
          type: "quiz_created",
          description: `Unlocked quiz "${quiz.title}" for ${student.name}`,
          metadata: {
            studentId: student._id,
            quizId: quiz._id,
          },
        });
      }

      res.json({
        message: "Quiz unlocked successfully",
        unlockedQuizzes: student.unlockedQuizzes,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/students/:studentId/lock-quiz/:quizId
// @desc    Lock a quiz for a student
// @access  Private/Teacher
router.post(
  "/:studentId/lock-quiz/:quizId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.studentId);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      student.unlockedQuizzes = student.unlockedQuizzes.filter(
        (id) => id.toString() !== req.params.quizId
      );

      await student.save();

      res.json({
        message: "Quiz locked successfully",
        unlockedQuizzes: student.unlockedQuizzes,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/students/:studentId/unlock-course-quizzes/:courseId
// @desc    Unlock all quizzes in a course for a student
// @access  Private/Teacher
router.post(
  "/:studentId/unlock-course-quizzes/:courseId",
  protect,
  authorizeTeacher,
  async (req, res) => {
    try {
      const student = await User.findById(req.params.studentId);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Get all quizzes for the course
      const quizzes = await Quiz.find({ courseId: req.params.courseId });

      // Unlock all quizzes
      const quizIds = quizzes.map((q) => q._id);
      const newUnlocked = [
        ...new Set([
          ...student.unlockedQuizzes.map((id) => id.toString()),
          ...quizIds.map((id) => id.toString()),
        ]),
      ];

      student.unlockedQuizzes = newUnlocked;
      await student.save();

      res.json({
        message: `Unlocked ${quizzes.length} quizzes successfully`,
        unlockedQuizzes: student.unlockedQuizzes,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
