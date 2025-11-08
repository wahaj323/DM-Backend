import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a lesson title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [300, 'Description cannot be more than 300 characters']
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true
  },
  order: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['lecture', 'practice', 'quiz', 'dialogue', 'story'],
    default: 'lecture'
  },
  // Block-based content structure
  blocks: [{
    id: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['heading', 'paragraph', 'image', 'table', 'dialogue', 'vocabulary', 'grammar', 'note', 'video'],
      required: true
    },
    order: {
      type: Number,
      required: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  }],
  // Vocabulary items will be extracted from blocks
  vocabItems: [{
    word: String,
    gender: String,
    meaning: String,
    exampleDe: String,
    exampleEn: String,
    audioUrl: String,
    tags: [String]
  }],
  estimatedDuration: {
    type: Number, // in minutes
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: true
  },
  // TTS Settings
  ttsSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    voice: {
      type: String,
      default: 'de-DE'
    },
    rate: {
      type: Number,
      default: 0.9,
      min: 0.5,
      max: 2
    },
    pitch: {
      type: Number,
      default: 1,
      min: 0,
      max: 2
    }
  }
}, {
  timestamps: true
});

// Index for ordering
lessonSchema.index({ moduleId: 1, order: 1 });

const Lesson = mongoose.model('Lesson', lessonSchema);

export default Lesson;