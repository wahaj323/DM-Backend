import mongoose from 'mongoose';

const studentDictionarySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vocabItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VocabItem',
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'learning', 'mastered'],
    default: 'new'
  },
  notes: {
    type: String,
    default: ''
  },
  practiceCount: {
    type: Number,
    default: 0
  },
  lastPracticed: {
    type: Date,
    default: null
  },
  correctCount: {
    type: Number,
    default: 0
  },
  incorrectCount: {
    type: Number,
    default: 0
  },
  addedFromLesson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }
}, {
  timestamps: true
});

// Index for faster queries
studentDictionarySchema.index({ studentId: 1, vocabItemId: 1 }, { unique: true });
studentDictionarySchema.index({ studentId: 1, status: 1 });

const StudentDictionary = mongoose.model('StudentDictionary', studentDictionarySchema);

export default StudentDictionary;