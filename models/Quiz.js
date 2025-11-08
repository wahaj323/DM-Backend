import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mcq', 'fill_blank', 'matching', 'true_false'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  points: {
    type: Number,
    default: 1
  },
  
  // MCQ specific fields
  options: [String],
  correctAnswer: Number, // index of correct option
  
  // Fill in the blank specific
  blanks: [String], // array of correct answers
  caseSensitive: {
    type: Boolean,
    default: false
  },
  
  // Matching specific
  pairs: [{
    left: String,
    right: String
  }],
  
  // True/False specific
  isTrue: Boolean,
  
  explanation: {
    type: String,
    default: ''
  },
  
  order: {
    type: Number,
    default: 0
  }
});

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // References
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    default: null
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Questions
  questions: [questionSchema],
  
  // Settings
  settings: {
    timeLimit: {
      type: Number, // in minutes
      default: 30
    },
    passingScore: {
      type: Number, // percentage
      default: 70
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    showAnswers: {
      type: Boolean,
      default: true
    },
    showScore: {
      type: Boolean,
      default: true
    },
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    shuffleOptions: {
      type: Boolean,
      default: false
    },
    allowReview: {
      type: Boolean,
      default: true
    }
  },
  
  // Status
  published: {
    type: Boolean,
    default: false
  },
  
  // Calculated fields
  totalPoints: {
    type: Number,
    default: 0
  },
  questionCount: {
    type: Number,
    default: 0
  },
  
  // Stats
  totalAttempts: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate total points before saving
quizSchema.pre('save', function(next) {
  if (this.questions && this.questions.length > 0) {
    this.totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
    this.questionCount = this.questions.length;
  }
  next();
});

// Indexes for faster queries
quizSchema.index({ courseId: 1, published: 1 });
quizSchema.index({ teacherId: 1 });
quizSchema.index({ lessonId: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

export default Quiz;