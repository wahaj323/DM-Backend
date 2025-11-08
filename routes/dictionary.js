import express from 'express';
import VocabItem from '../models/VocabItem.js';
import StudentDictionary from '../models/StudentDictionary.js';
import Lesson from '../models/Lesson.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/dictionary
// @desc    Get student's personal dictionary
// @access  Private/Student
router.get('/', protect, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;

    const query = { studentId: req.user._id };

    // Filter by status
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    let dictionaryItems = await StudentDictionary.find(query)
      .populate('vocabItemId')
      .populate('addedFromLesson', 'title')
      .sort({ [sortBy]: sortOrder })
      .limit(parseInt(limit))
      .skip(skip);

    // Filter by search if provided
    if (search) {
      dictionaryItems = dictionaryItems.filter(item => {
        const vocab = item.vocabItemId;
        return vocab && (
          vocab.word.toLowerCase().includes(search.toLowerCase()) ||
          vocab.meaning.toLowerCase().includes(search.toLowerCase())
        );
      });
    }

    const total = await StudentDictionary.countDocuments(query);

    res.json({
      items: dictionaryItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dictionary/stats
// @desc    Get dictionary statistics
// @access  Private/Student
router.get('/stats', protect, async (req, res) => {
  try {
    const totalWords = await StudentDictionary.countDocuments({ studentId: req.user._id });
    const newWords = await StudentDictionary.countDocuments({ studentId: req.user._id, status: 'new' });
    const learning = await StudentDictionary.countDocuments({ studentId: req.user._id, status: 'learning' });
    const mastered = await StudentDictionary.countDocuments({ studentId: req.user._id, status: 'mastered' });

    const totalPracticed = await StudentDictionary.aggregate([
      { $match: { studentId: req.user._id } },
      { $group: { _id: null, total: { $sum: '$practiceCount' } } }
    ]);

    res.json({
      totalWords,
      newWords,
      learning,
      mastered,
      totalPracticed: totalPracticed[0]?.total || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dictionary/add
// @desc    Manually add word to dictionary
// @access  Private/Student
router.post('/add', protect, async (req, res) => {
  try {
    const { word, gender, meaning, exampleDe, exampleEn, tags } = req.body;

    if (!word || !meaning) {
      return res.status(400).json({ message: 'Word and meaning are required' });
    }

    // Create vocab item
    const vocabItem = await VocabItem.create({
      word,
      gender: gender || '',
      meaning,
      exampleDe: exampleDe || '',
      exampleEn: exampleEn || '',
      tags: tags || [],
      addedBy: 'manual'
    });

    // Add to student's dictionary
    const dictionaryEntry = await StudentDictionary.create({
      studentId: req.user._id,
      vocabItemId: vocabItem._id,
      status: 'new'
    });

    const populatedEntry = await StudentDictionary.findById(dictionaryEntry._id)
      .populate('vocabItemId');

    res.status(201).json(populatedEntry);
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This word is already in your dictionary' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/dictionary/:id
// @desc    Update dictionary entry
// @access  Private/Student
router.put('/:id', protect, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const entry = await StudentDictionary.findOne({
      _id: req.params.id,
      studentId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ message: 'Dictionary entry not found' });
    }

    if (status) entry.status = status;
    if (notes !== undefined) entry.notes = notes;

    await entry.save();

    const populatedEntry = await StudentDictionary.findById(entry._id)
      .populate('vocabItemId')
      .populate('addedFromLesson', 'title');

    res.json(populatedEntry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/dictionary/:id
// @desc    Remove word from dictionary
// @access  Private/Student
router.delete('/:id', protect, async (req, res) => {
  try {
    const entry = await StudentDictionary.findOne({
      _id: req.params.id,
      studentId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ message: 'Dictionary entry not found' });
    }

    await StudentDictionary.findByIdAndDelete(req.params.id);

    res.json({ message: 'Word removed from dictionary' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dictionary/:id/practice
// @desc    Record practice session
// @access  Private/Student
router.post('/:id/practice', protect, async (req, res) => {
  try {
    const { correct } = req.body;

    const entry = await StudentDictionary.findOne({
      _id: req.params.id,
      studentId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ message: 'Dictionary entry not found' });
    }

    entry.practiceCount += 1;
    entry.lastPracticed = new Date();

    if (correct) {
      entry.correctCount += 1;
      
      // Update status based on performance
      if (entry.correctCount >= 5 && entry.status === 'new') {
        entry.status = 'learning';
      } else if (entry.correctCount >= 10 && entry.status === 'learning') {
        entry.status = 'mastered';
      }
    } else {
      entry.incorrectCount += 1;
    }

    await entry.save();

    const populatedEntry = await StudentDictionary.findById(entry._id)
      .populate('vocabItemId');

    res.json(populatedEntry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dictionary/add-from-lesson/:lessonId
// @desc    Add all vocabulary from a lesson (when student completes it)
// @access  Private/Student
router.post('/add-from-lesson/:lessonId', protect, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    // Extract vocabulary from lesson blocks
    const vocabularyBlocks = lesson.blocks.filter(block => block.type === 'vocabulary');
    
    let addedCount = 0;
    
    for (const block of vocabularyBlocks) {
      if (block.data.words) {
        for (const word of block.data.words) {
          if (word.word && word.meaning) {
            // Check if vocab item exists
            let vocabItem = await VocabItem.findOne({ 
              word: word.word,
              meaning: word.meaning 
            });

            // Create if doesn't exist
            if (!vocabItem) {
              vocabItem = await VocabItem.create({
                word: word.word,
                gender: word.gender || '',
                meaning: word.meaning,
                exampleDe: word.exampleDe || '',
                exampleEn: word.exampleEn || '',
                lessonId: lesson._id,
                addedBy: 'system'
              });
            }

            // Add to student's dictionary if not already there
            const exists = await StudentDictionary.findOne({
              studentId: req.user._id,
              vocabItemId: vocabItem._id
            });

            if (!exists) {
              await StudentDictionary.create({
                studentId: req.user._id,
                vocabItemId: vocabItem._id,
                status: 'new',
                addedFromLesson: lesson._id
              });
              addedCount++;
            }
          }
        }
      }
    }

    res.json({ 
      message: `Added ${addedCount} new words to your dictionary`,
      addedCount 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;