import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionIndex: {
    type: Number,
    required: true
  },
  questionId: {
    type: String,
    required: true
  },
  questionType: {
    type: String,
    enum: ['mcq', 'fill_blank', 'matching', 'true_false'],
    required: true
  },
  answer: {
    type: mongoose.Schema.Types.Mixed, // Can be number, string, array, etc.
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  pointsAwarded: {
    type: Number,
    default: 0
  }
});

const quizAttemptSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  
  // Answers
  answers: [answerSchema],
  
  // Scoring
  score: {
    type: Number, // percentage (0-100)
    required: true
  },
  totalPoints: {
    type: Number,
    required: true
  },
  earnedPoints: {
    type: Number,
    required: true
  },
  
  // Timing
  startedAt: {
    type: Date,
    required: true
  },
  submittedAt: {
    type: Date,
    required: true
  },
  timeSpent: {
    type: Number, // in seconds
    required: true
  },
  
  // Status
  passed: {
    type: Boolean,
    required: true
  },
  attemptNumber: {
    type: Number,
    required: true
  },
  
  // Teacher feedback
  feedback: {
    type: String,
    default: ''
  },
  teacherReviewed: {
    type: Boolean,
    default: false
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  
  // Metadata
  completed: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes
quizAttemptSchema.index({ studentId: 1, quizId: 1 });
quizAttemptSchema.index({ studentId: 1, courseId: 1 });
quizAttemptSchema.index({ quizId: 1, passed: 1 });

// Virtual for grade
quizAttemptSchema.virtual('grade').get(function() {
  if (this.score >= 90) return 'A';
  if (this.score >= 80) return 'B';
  if (this.score >= 70) return 'C';
  if (this.score >= 60) return 'D';
  return 'F';
});

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

export default QuizAttempt;