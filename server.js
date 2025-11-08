import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import studentRoutes from './routes/students.js';
import courseRoutes from './routes/courses.js';
import moduleRoutes from './routes/modules.js';
import lessonRoutes from './routes/lessons.js';
import dictionaryRoutes from './routes/dictionary.js';
import progressRoutes from './routes/progress.js';
import certificateRoutes from './routes/certificates.js';
import quizRoutes from './routes/quizzes.js';
import attemptRoutes from './routes/attempts.js';
import aiRoutes from './routes/ai.js';
import aiAdminRoutes from './routes/aiAdmin.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://192.168.100.32:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Routes - ORDER MATTERS! More specific routes first
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/dictionary', dictionaryRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai/admin', aiAdminRoutes);


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'DeutschMeister API is running' });
});

// Public Test Route (for checking server status)
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Server is running successfully!',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});


// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.url} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
});