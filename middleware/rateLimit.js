import AIConversation from '../models/AIConversation.js';

// In-memory store for rate limiting (use Redis in production)
const requestCounts = new Map();

/**
 * Rate limiting for AI requests
 * Limits: 50 requests per hour per user
 */
export const aiRateLimit = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    // Get user's request history
    const userRequests = requestCounts.get(userId) || [];
    
    // Filter requests from last hour
    const recentRequests = userRequests.filter(timestamp => timestamp > hourAgo);
    
    // Check limit
    const limit = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR) || 50;
    
    if (recentRequests.length >= limit) {
      return res.status(429).json({ 
        message: `Rate limit exceeded. You can make ${limit} AI requests per hour. Please try again later.`,
        retryAfter: Math.ceil((recentRequests[0] + 60 * 60 * 1000 - now) / 1000)
      });
    }

    // Add current request
    recentRequests.push(now);
    requestCounts.set(userId, recentRequests);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      cleanupOldRequests();
    }

    // Add remaining requests to response header
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - recentRequests.length);
    res.setHeader('X-RateLimit-Reset', new Date(recentRequests[0] + 60 * 60 * 1000).toISOString());

    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    next(); // Allow request on error
  }
};

/**
 * Token usage limiting
 * Limits: 50,000 tokens per day per user
 */
export const tokenLimit = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate total tokens used today
    const conversations = await AIConversation.find({
      studentId: userId,
      createdAt: { $gte: today }
    });

    const totalTokensToday = conversations.reduce((sum, conv) => 
      sum + (conv.metadata?.totalTokens || 0), 0
    );

    const dailyLimit = 50000; // 50k tokens per day

    if (totalTokensToday >= dailyLimit) {
      return res.status(429).json({ 
        message: 'Daily token limit reached. Please try again tomorrow.',
        tokensUsed: totalTokensToday,
        limit: dailyLimit
      });
    }

    // Add token info to request
    req.tokenInfo = {
      used: totalTokensToday,
      remaining: dailyLimit - totalTokensToday,
      limit: dailyLimit
    };

    next();
  } catch (error) {
    console.error('Token limit error:', error);
    next(); // Allow request on error
  }
};

/**
 * Clean up old request timestamps
 */
const cleanupOldRequests = () => {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  
  for (const [userId, requests] of requestCounts.entries()) {
    const recent = requests.filter(timestamp => timestamp > hourAgo);
    if (recent.length === 0) {
      requestCounts.delete(userId);
    } else {
      requestCounts.set(userId, recent);
    }
  }
};

// Cleanup every hour
setInterval(cleanupOldRequests, 60 * 60 * 1000);