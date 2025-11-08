import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['course_enrolled', 'lesson_completed','lesson_started', 'quiz_passed', 'dictionary_added', 'login', 'profile_updated','quiz_attempted',
    'quiz_passed', 'quiz_failed','ai_chat' ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    score: Number,
    additionalInfo: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
activitySchema.index({ userId: 1, timestamp: -1 });

const Activity = mongoose.model('Activity', activitySchema);

export default Activity;