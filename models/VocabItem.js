import mongoose from 'mongoose';

const vocabItemSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    enum: ['', 'der', 'die', 'das', 'die (pl)'],
    default: ''
  },
  meaning: {
    type: String,
    required: true
  },
  exampleDe: {
    type: String,
    default: ''
  },
  exampleEn: {
    type: String,
    default: ''
  },
  audioUrl: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    trim: true
  }],
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  addedBy: {
    type: String,
    enum: ['system', 'manual'],
    default: 'system'
  }
}, {
  timestamps: true
});

// Index for faster searches
vocabItemSchema.index({ word: 1 });
vocabItemSchema.index({ lessonId: 1 });
vocabItemSchema.index({ courseId: 1 });

const VocabItem = mongoose.model('VocabItem', vocabItemSchema);

export default VocabItem;