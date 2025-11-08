import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a course title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a course description'],
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  level: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'A1'
  },
  category: {
    type: String,
    enum: ['General German', 'Business German', 'Grammar', 'Conversation', 'Exam Preparation', 'Other'],
    default: 'General German'
  },
  tags: [{
    type: String,
    trim: true
  }],
  modules: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module'
  }],
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enrolledStudents: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0
    }
  }],
  thumbnail: {
    type: String,
    default: null
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  estimatedDuration: {
    type: Number, // in hours
    default: 0
  },
  difficulty: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner'
  }
}, {
  timestamps: true
});

// Index for faster queries
courseSchema.index({ teacherId: 1, isPublished: 1 });
courseSchema.index({ level: 1, category: 1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;