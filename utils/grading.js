// Auto-grading utility functions

/**
 * Grade a single MCQ answer
 */
export const gradeMCQ = (studentAnswer, correctAnswer) => {
  return parseInt(studentAnswer) === parseInt(correctAnswer);
};

/**
 * Grade fill in the blank answer
 */
export const gradeFillBlank = (studentAnswers, correctAnswers, caseSensitive = false) => {
  if (!Array.isArray(studentAnswers) || !Array.isArray(correctAnswers)) {
    return false;
  }
  
  if (studentAnswers.length !== correctAnswers.length) {
    return false;
  }
  
  for (let i = 0; i < studentAnswers.length; i++) {
    const studentAns = caseSensitive 
      ? studentAnswers[i].trim() 
      : studentAnswers[i].trim().toLowerCase();
    
    const correctAns = caseSensitive 
      ? correctAnswers[i].trim() 
      : correctAnswers[i].trim().toLowerCase();
    
    if (studentAns !== correctAns) {
      return false;
    }
  }
  
  return true;
};

/**
 * Grade matching question
 * studentAnswer: array of objects [{leftIndex: 0, rightIndex: 1}, ...]
 * correctPairs: array of objects [{left: "X", right: "Y"}, ...]
 */
export const gradeMatching = (studentAnswer, correctPairs) => {
  if (!Array.isArray(studentAnswer) || !Array.isArray(correctPairs)) {
    return false;
  }
  
  if (studentAnswer.length !== correctPairs.length) {
    return false;
  }
  
  // Check if all pairs match
  let correctCount = 0;
  
  for (const pair of studentAnswer) {
    const leftValue = correctPairs[pair.leftIndex]?.left;
    const rightValue = correctPairs[pair.rightIndex]?.right;
    
    // Find if this is a correct pairing
    const isCorrect = correctPairs.some(cp => 
      cp.left === leftValue && cp.right === rightValue
    );
    
    if (isCorrect) correctCount++;
  }
  
  return correctCount === correctPairs.length;
};

/**
 * Grade true/false question
 */
export const gradeTrueFalse = (studentAnswer, correctAnswer) => {
  return Boolean(studentAnswer) === Boolean(correctAnswer);
};

/**
 * Grade an entire quiz attempt
 */
export const gradeQuiz = (quiz, studentAnswers) => {
  const results = {
    answers: [],
    earnedPoints: 0,
    totalPoints: quiz.totalPoints,
    score: 0,
    passed: false
  };
  
  for (let i = 0; i < quiz.questions.length; i++) {
    const question = quiz.questions[i];
    const studentAnswer = studentAnswers[i];
    
    let isCorrect = false;
    
    switch (question.type) {
      case 'mcq':
        isCorrect = gradeMCQ(studentAnswer.answer, question.correctAnswer);
        break;
        
      case 'fill_blank':
        isCorrect = gradeFillBlank(
          studentAnswer.answer, 
          question.blanks, 
          question.caseSensitive
        );
        break;
        
      case 'matching':
        isCorrect = gradeMatching(studentAnswer.answer, question.pairs);
        break;
        
      case 'true_false':
        isCorrect = gradeTrueFalse(studentAnswer.answer, question.isTrue);
        break;
        
      default:
        isCorrect = false;
    }
    
    const pointsAwarded = isCorrect ? question.points : 0;
    results.earnedPoints += pointsAwarded;
    
    results.answers.push({
      questionIndex: i,
      questionId: question._id.toString(),
      questionType: question.type,
      answer: studentAnswer.answer,
      isCorrect,
      pointsAwarded
    });
  }
  
  // Calculate percentage score
  results.score = results.totalPoints > 0 
    ? Math.round((results.earnedPoints / results.totalPoints) * 100)
    : 0;
  
  // Check if passed
  results.passed = results.score >= quiz.settings.passingScore;
  
  return results;
};

/**
 * Shuffle array (for shuffling questions/options)
 */
export const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Calculate statistics for a quiz
 */
export const calculateQuizStats = (attempts) => {
  if (!attempts || attempts.length === 0) {
    return {
      totalAttempts: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      passRate: 0
    };
  }
  
  const scores = attempts.map(a => a.score);
  const passed = attempts.filter(a => a.passed).length;
  
  return {
    totalAttempts: attempts.length,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    passRate: Math.round((passed / attempts.length) * 100)
  };
};