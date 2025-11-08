import express from 'express';
import AIConversation from '../models/AIConversation.js';
import User from '../models/User.js';
import { protect, authorizeTeacher } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/ai/admin/conversations
// @desc    Get all conversations (Teacher dashboard)
// @access  Private/Teacher
router.get('/conversations', protect, authorizeTeacher, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'all',
      studentId,
      courseId,
      flagged,
      search
    } = req.query;

    const query = {};

    if (status !== 'all') {
      query.status = status;
    }

    if (studentId) {
      query.studentId = studentId;
    }

    if (courseId) {
      query.courseId = courseId;
    }

    if (flagged === 'true') {
      query.flagged = true;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }

    const conversations = await AIConversation.find(query)
      .sort({ lastMessageAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('studentId', 'name email')
      .populate('courseId', 'title')
      .populate('lessonId', 'title')
      .populate('reviewedBy', 'name');

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

// @route   GET /api/ai/admin/stats
// @desc    Get AI usage statistics for all students
// @access  Private/Teacher
router.get('/stats', protect, authorizeTeacher, async (req, res) => {
  try {
    const { timeframe = 'week', courseId } = req.query;

    const now = new Date();
    let startDate = new Date();

    switch (timeframe) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    const query = { createdAt: { $gte: startDate } };
    if (courseId) {
      query.courseId = courseId;
    }

    const conversations = await AIConversation.find(query);

    const stats = {
      totalConversations: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.metadata.totalMessages, 0),
      totalTokens: conversations.reduce((sum, c) => sum + c.metadata.totalTokens, 0),
      activeStudents: new Set(conversations.map(c => c.studentId.toString())).size,
      flaggedConversations: conversations.filter(c => c.flagged).length,
      averageMessagesPerConversation: conversations.length > 0
        ? Math.round(conversations.reduce((sum, c) => sum + c.metadata.totalMessages, 0) / conversations.length)
        : 0,
      averageResponseTime: conversations.length > 0
        ? Math.round(conversations.reduce((sum, c) => sum + c.metadata.averageResponseTime, 0) / conversations.length)
        : 0
    };

    // Daily breakdown
    const dailyBreakdown = {};
    conversations.forEach(conv => {
      const date = conv.createdAt.toISOString().split('T')[0];
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          conversations: 0,
          messages: 0,
          tokens: 0
        };
      }
      dailyBreakdown[date].conversations++;
      dailyBreakdown[date].messages += conv.metadata.totalMessages;
      dailyBreakdown[date].tokens += conv.metadata.totalTokens;
    });

    stats.dailyBreakdown = dailyBreakdown;

    // Top students by usage
    const studentUsage = {};
    conversations.forEach(conv => {
      const studentId = conv.studentId.toString();
      if (!studentUsage[studentId]) {
        studentUsage[studentId] = {
          studentId,
          conversations: 0,
          messages: 0,
          tokens: 0
        };
      }
      studentUsage[studentId].conversations++;
      studentUsage[studentId].messages += conv.metadata.totalMessages;
      studentUsage[studentId].tokens += conv.metadata.totalTokens;
    });

    stats.topStudents = Object.values(studentUsage)
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 10);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/ai/admin/conversations/:id/flag
// @desc    Flag/unflag conversation
// @access  Private/Teacher
router.post('/conversations/:id/flag', protect, authorizeTeacher, async (req, res) => {
  try {
    const { reason } = req.body;
    const conversation = await AIConversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    conversation.flagged = !conversation.flagged;
    conversation.flagReason = conversation.flagged ? reason : null;
    conversation.reviewedBy = req.user._id;

    await conversation.save();

    res.json({
      message: conversation.flagged ? 'Conversation flagged' : 'Flag removed',
      conversation
    });
  } catch (error) {
    console.error('Error flagging conversation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/ai/admin/messages/:conversationId/:messageIndex/correct
// @desc    Correct AI response
// @access  Private/Teacher
router.post('/messages/:conversationId/:messageIndex/correct', protect, authorizeTeacher, async (req, res) => {
  try {
    const { correctedContent, correctionNote } = req.body;
    const { conversationId, messageIndex } = req.params;

    const conversation = await AIConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const index = parseInt(messageIndex);
    if (index < 0 || index >= conversation.messages.length) {
      return res.status(400).json({ message: 'Invalid message index' });
    }

    const message = conversation.messages[index];
    
    if (message.role !== 'assistant') {
      return res.status(400).json({ message: 'Can only correct AI messages' });
    }

    message.corrected = true;
    message.correctedBy = req.user._id;
    message.correctedContent = correctedContent;
    message.correctionNote = correctionNote;

    await conversation.save();

    res.json({
      message: 'Response corrected successfully',
      conversation
    });
  } catch (error) {
    console.error('Error correcting message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/ai/admin/students/:studentId/conversations
// @desc    Get all conversations for a specific student
// @access  Private/Teacher
router.get('/students/:studentId/conversations', protect, authorizeTeacher, async (req, res) => {
  try {
    const conversations = await AIConversation.find({ 
      studentId: req.params.studentId 
    })
      .sort({ lastMessageAt: -1 })
      .populate('courseId', 'title')
      .populate('lessonId', 'title');

    const totalTokens = conversations.reduce((sum, c) => sum + c.metadata.totalTokens, 0);
    const totalMessages = conversations.reduce((sum, c) => sum + c.metadata.totalMessages, 0);

    res.json({
      conversations,
      stats: {
        totalConversations: conversations.length,
        totalMessages,
        totalTokens,
        flaggedCount: conversations.filter(c => c.flagged).length
      }
    });
  } catch (error) {
    console.error('Error fetching student conversations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/ai/admin/conversations/:id
// @desc    Permanently delete conversation
// @access  Private/Teacher
router.delete('/conversations/:id', protect, authorizeTeacher, async (req, res) => {
  try {
    const conversation = await AIConversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await conversation.deleteOne();

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/ai/admin/export
// @desc    Export conversations data
// @access  Private/Teacher
router.get('/export', protect, authorizeTeacher, async (req, res) => {
  try {
    const { courseId, studentId, startDate, endDate } = req.query;

    const query = {};
    if (courseId) query.courseId = courseId;
    if (studentId) query.studentId = studentId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const conversations = await AIConversation.find(query)
      .populate('studentId', 'name email')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 });

    // Format for export
    const exportData = conversations.map(conv => ({
      conversationId: conv._id,
      student: conv.studentId?.name,
      studentEmail: conv.studentId?.email,
      course: conv.courseId?.title || 'N/A',
      title: conv.title,
      messageCount: conv.metadata.totalMessages,
      tokensUsed: conv.metadata.totalTokens,
      flagged: conv.flagged,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt
    }));

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;