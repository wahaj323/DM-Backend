import express from 'express';
import AIConversation from '../models/AIConversation.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Activity from '../models/Activity.js';
import { protect } from '../middleware/auth.js';
import { aiRateLimit, tokenLimit } from '../middleware/rateLimit.js';
import { 
  generateResponse, 
  explainGrammar, 
  translateWithContext,
  correctGermanText,
  generateExercise 
} from '../services/gemini.js';

const router = express.Router();

// @route   POST /api/ai/chat
// @desc    Send message to AI assistant
// @access  Private/Student
router.post('/chat', protect, aiRateLimit, tokenLimit, async (req, res) => {
  try {
    const { message, conversationId, courseId, lessonId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    let conversation;

    // Get or create conversation
    if (conversationId) {
      conversation = await AIConversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      if (conversation.studentId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else {
      // Create new conversation
      conversation = new AIConversation({
        studentId: req.user._id,
        courseId: courseId || null,
        lessonId: lessonId || null,
        context: {
          studentLevel: req.user.germanLevel || 'A1'
        }
      });
    }

    // Build context
    let context = { ...conversation.context };
    
    if (courseId && !context.currentLesson) {
      const course = await Course.findById(courseId);
      if (course) {
        context.currentLesson = course.title;
      }
    }

    if (lessonId && !context.currentTopic) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        context.currentTopic = lesson.title;
      }
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    });

    // Generate AI response
    const startTime = Date.now();
    const aiResponse = await generateResponse(conversation.messages, context);
    const responseTime = Date.now() - startTime;

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse.content,
      timestamp: aiResponse.timestamp,
      tokensUsed: aiResponse.tokensUsed
    });

    // Update metadata
    if (conversation.metadata.averageResponseTime === 0) {
      conversation.metadata.averageResponseTime = responseTime;
    } else {
      conversation.metadata.averageResponseTime = 
        (conversation.metadata.averageResponseTime + responseTime) / 2;
    }

    conversation.context = context;
    await conversation.save();

    // Log activity
    if (!conversationId) {
      await Activity.create({
        userId: req.user._id,
        type: 'lesson_started',
        description: 'Started AI assistant conversation',
        metadata: {
          conversationId: conversation._id,
          firstMessage: message.substring(0, 50)
        }
      });
    }

    res.json({
      conversation,
      tokenInfo: req.tokenInfo
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to generate AI response' 
    });
  }
});

// @route   GET /api/ai/conversations
// @desc    Get user's conversations
// @access  Private/Student
router.get('/conversations', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'active' } = req.query;

    const query = { studentId: req.user._id };
    if (status !== 'all') {
      query.status = status;
    }

    const conversations = await AIConversation.find(query)
      .sort({ lastMessageAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('courseId', 'title')
      .populate('lessonId', 'title');

    const total = await AIConversation.countDocuments(query);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/ai/conversations/:id
// @desc    Get single conversation
// @access  Private
router.get('/conversations/:id', protect, async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.id)
      .populate('courseId', 'title')
      .populate('lessonId', 'title')
      .populate('studentId', 'name email');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Students can only view their own conversations
    // Teachers can view all conversations
    if (req.user.role === 'student' && 
        conversation.studentId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/ai/conversations/:id
// @desc    Delete/Archive conversation
// @access  Private/Student
router.delete('/conversations/:id', protect, async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Archive instead of delete
    conversation.status = 'archived';
    await conversation.save();

    res.json({ message: 'Conversation archived' });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/ai/grammar-check
// @desc    Check German grammar
// @access  Private/Student
router.post('/grammar-check', protect, aiRateLimit, tokenLimit, async (req, res) => {
  try {
    const { text, conversationId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const context = {
      studentLevel: req.user.germanLevel || 'A1'
    };

    const result = await explainGrammar(text, context);

    // Save to conversation if provided
    if (conversationId) {
      const conversation = await AIConversation.findById(conversationId);
      if (conversation && conversation.studentId.toString() === req.user._id.toString()) {
        conversation.messages.push(
          {
            role: 'user',
            content: `Grammar check: ${text}`,
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: result.content,
            timestamp: new Date(),
            tokensUsed: result.tokensUsed
          }
        );
        await conversation.save();
      }
    }

    res.json({
      result: result.content,
      tokensUsed: result.tokensUsed,
      tokenInfo: req.tokenInfo
    });
  } catch (error) {
    console.error('Grammar check error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/ai/translate
// @desc    Translate text
// @access  Private/Student
router.post('/translate', protect, aiRateLimit, tokenLimit, async (req, res) => {
  try {
    const { text, fromLang, toLang, contextNote, conversationId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const context = {
      studentLevel: req.user.germanLevel || 'A1',
      contextNote
    };

    const result = await translateWithContext(text, fromLang, toLang, context);

    // Save to conversation if provided
    if (conversationId) {
      const conversation = await AIConversation.findById(conversationId);
      if (conversation && conversation.studentId.toString() === req.user._id.toString()) {
        conversation.messages.push(
          {
            role: 'user',
            content: `Translate (${fromLang} → ${toLang}): ${text}`,
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: result.content,
            timestamp: new Date(),
            tokensUsed: result.tokensUsed
          }
        );
        await conversation.save();
      }
    }

    res.json({
      result: result.content,
      tokensUsed: result.tokensUsed,
      tokenInfo: req.tokenInfo
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/ai/correct
// @desc    Correct German text
// @access  Private/Student
router.post('/correct', protect, aiRateLimit, tokenLimit, async (req, res) => {
  try {
    const { text, conversationId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const context = {
      studentLevel: req.user.germanLevel || 'A1'
    };

    const result = await correctGermanText(text, context);

    // Save to conversation if provided
    if (conversationId) {
      const conversation = await AIConversation.findById(conversationId);
      if (conversation && conversation.studentId.toString() === req.user._id.toString()) {
        conversation.messages.push(
          {
            role: 'user',
            content: `Correct my German: ${text}`,
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: result.content,
            timestamp: new Date(),
            tokensUsed: result.tokensUsed
          }
        );
        await conversation.save();
      }
    }

    res.json({
      result: result.content,
      tokensUsed: result.tokensUsed,
      tokenInfo: req.tokenInfo
    });
  } catch (error) {
    console.error('Correction error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/ai/generate-exercise
// @desc    Generate practice exercise
// @access  Private/Student
router.post('/generate-exercise', protect, aiRateLimit, tokenLimit, async (req, res) => {
  try {
    const { topic, type = 'fill-blank' } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ message: 'Topic is required' });
    }

    const level = req.user.germanLevel || 'A1';
    const result = await generateExercise(topic, level, type);

    res.json({
      exercise: result.content,
      tokensUsed: result.tokensUsed,
      tokenInfo: req.tokenInfo
    });
  } catch (error) {
    console.error('Exercise generation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/ai/usage
// @desc    Get AI usage statistics
// @access  Private/Student
router.get('/usage', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const conversations = await AIConversation.find({
      studentId: req.user._id,
      createdAt: { $gte: today }
    });

    const totalTokensToday = conversations.reduce((sum, conv) => 
      sum + (conv.metadata?.totalTokens || 0), 0
    );

    const totalMessagesToday = conversations.reduce((sum, conv) => 
      sum + (conv.metadata?.totalMessages || 0), 0
    );

    const dailyLimit = 50000;
    const hourlyLimit = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR) || 50;

    res.json({
      tokensUsed: totalTokensToday,
      tokensRemaining: dailyLimit - totalTokensToday,
      tokensLimit: dailyLimit,
      messagesCount: totalMessagesToday,
      hourlyLimit,
      conversations: conversations.length
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;