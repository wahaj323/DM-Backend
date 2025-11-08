import mongoose from 'mongoose';

const certificateSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  certificateNumber: {
    type: String,
    required: true,
    unique: true
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  completionDate: {
    type: Date,
    required: true
  },
  grade: {
    type: String,
    default: 'Pass'
  },
  score: {
    type: Number,
    default: null
  },
  totalLessons: {
    type: Number,
    required: true
  },
  totalTimeSpent: {
    type: Number, // in hours
    default: 0
  },
  teacherName: {
    type: String,
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
certificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
certificateSchema.index({ certificateNumber: 1 });

const Certificate = mongoose.model('Certificate', certificateSchema);

export default Certificate;