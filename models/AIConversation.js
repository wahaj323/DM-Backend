import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  tokensUsed: {
    type: Number,
    default: 0
  },
  corrected: {
    type: Boolean,
    default: false
  },
  correctedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  correctedContent: {
    type: String,
    default: null
  },
  correctionNote: {
    type: String,
    default: null
  }
});

const aiConversationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null
  },
  
  title: {
    type: String,
    default: 'New Conversation'
  },
  
  messages: [messageSchema],
  
  context: {
    currentLesson: String,
    currentTopic: String,
    studentLevel: String,
    learningGoal: String
  },
  
  metadata: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalTokens: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },
  
  status: {
    type: String,
    enum: ['active', 'archived', 'flagged'],
    default: 'active'
  },
  
  flagged: {
    type: Boolean,
    default: false
  },
  flagReason: {
    type: String,
    default: null
  },
  
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
aiConversationSchema.index({ studentId: 1, createdAt: -1 });
aiConversationSchema.index({ status: 1, flagged: 1 });
aiConversationSchema.index({ courseId: 1 });

// Update metadata before saving
aiConversationSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    this.metadata.totalMessages = this.messages.length;
    this.metadata.totalTokens = this.messages.reduce((sum, msg) => sum + (msg.tokensUsed || 0), 0);
    this.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
    
    // Auto-generate title from first message if still "New Conversation"
    if (this.title === 'New Conversation' && this.messages.length >= 2) {
      const firstUserMessage = this.messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        this.title = firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
      }
    }
  }
  next();
});

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

export default AIConversation;