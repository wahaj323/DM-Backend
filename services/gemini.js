import { GoogleGenAI } from "@google/genai";

// The client automatically gets the API key from environment variable `GEMINI_API_KEY`
const ai = new GoogleGenAI({});

// System prompt for German learning assistant
const SYSTEM_PROMPT = `
You are the AI Facility Manager and German language learning assistant for **DeutschMeister**, an online German learning platform.

🎯 **Your Mission:**
Help DeutschMeister students learn **German at the A1 level only** — focusing on basic grammar, vocabulary, pronunciation, and sentence structure.

🏫 **Your Role:**
1. Teach and explain **A1-level German grammar** (e.g., articles, verbs, gender, plurals, simple tenses, sentence order, etc.)
2. Provide **English-to-German and German-to-English translations** with simple, everyday examples.
3. **Correct A1-level German sentences** and briefly explain the mistakes in easy English.
4. Give **practice exercises, examples, and mini quizzes** suitable for A1 students.
5. Explain **German culture** (only beginner-level topics like greetings, customs, food, and festivals).
6. **Encourage learners** and make learning enjoyable and motivating.

🧭 **Important Guidelines:**
- Always stay **strictly within A1-level** content.  
  ❌ Do **not** teach A2, B1, or higher-level topics (e.g., complex tenses, relative clauses, subjunctive mood, etc.)
- **Always respond in English** unless the user writes in German first.  
  - If the user writes in German, reply in English with translation and correction.
- Keep explanations **short, clear, and beginner-friendly.**
- Avoid academic or linguistic jargon.
- Be friendly, supportive, and motivational.
- If the question is **not related to German learning**, politely redirect the student back to the A1 learning journey.

🧩 **Response Format:**
- Use **bold** for important terms (e.g., **Der**, **die**, **das**)
- Use bullet points or steps for clarity
- Give both **German** and **English** examples
- Keep sentences simple and easy to understand

Example:
**German:** Ich bin Student.  
**English:** I am a student.  
Explanation: **Ich bin** = I am; **Student** = student (masculine noun)

Remember — your entire teaching scope is **A1 only**, and your tone should be like a kind, encouraging tutor helping beginners build confidence in learning German.
`;


/**
 * Generate AI response using Gemini 2.5 Flash
 */
export const generateResponse = async (messages, context = {}) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                SYSTEM_PROMPT +
                (context.currentLesson ? `\nCurrent Lesson: ${context.currentLesson}` : "") +
                (context.studentLevel ? `\nStudent Level: ${context.studentLevel}` : "") +
                (context.currentTopic ? `\nCurrent Topic: ${context.currentTopic}` : "") +
                "\nConversation:\n" +
                messages
                  .map(
                    (msg) =>
                      `${msg.role === "assistant" ? "Assistant" : "User"}: ${msg.content}`
                  )
                  .join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000,
        temperature: 0.7,
      },
    });

    const text = response.text;
    const tokensUsed = Math.ceil(text.length / 4);

    return {
      content: text,
      tokensUsed,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Gemini API Error:", error);

    if (error.message?.includes("quota") || error.message?.includes("rate limit")) {
      throw new Error("AI service is temporarily unavailable. Please try again in a few minutes.");
    }
    if (error.message?.includes("API key")) {
      throw new Error("AI service configuration error. Please contact support.");
    }

    throw new Error("Failed to generate AI response. Please try again.");
  }
};

/**
 * Grammar explanation generator
 */
export const explainGrammar = async (germanSentence, context = {}) => {
  const prompt = `Please analyze this German sentence and explain its grammar:

"${germanSentence}"

Provide:
1. English translation
2. Grammar breakdown (subject, verb, object, etc.)
3. Key grammar rules used
4. Common mistakes to avoid
5. Similar example sentences

Student Level: ${context.studentLevel || "Beginner"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      content: response.text,
      tokensUsed: Math.ceil(response.text.length / 4),
    };
  } catch (error) {
    console.error("Grammar explanation error:", error);
    throw new Error("Failed to generate grammar explanation");
  }
};

/**
 * Translation with context
 */
export const translateWithContext = async (text, fromLang, toLang, context = {}) => {
  const prompt = `Translate the following ${fromLang} text to ${toLang}:

"${text}"

${context.contextNote ? `Context: ${context.contextNote}` : ""}

Provide:
1. Main translation
2. Alternative translations (if any)
3. Usage notes (formal/informal, regional variations)
4. Example sentences using the translation

Student Level: ${context.studentLevel || "Beginner"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      content: response.text,
      tokensUsed: Math.ceil(response.text.length / 4),
    };
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to generate translation");
  }
};

/**
 * German text correction
 */
export const correctGermanText = async (text, context = {}) => {
  const prompt = `Please check and correct this German text:

"${text}"

Provide:
1. Corrected version (if needed)
2. List of mistakes found (grammar, spelling, word choice)
3. Explanation for each correction
4. Tips to avoid similar mistakes

Student Level: ${context.studentLevel || "Beginner"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      content: response.text,
      tokensUsed: Math.ceil(response.text.length / 4),
    };
  } catch (error) {
    console.error("Correction error:", error);
    throw new Error("Failed to correct text");
  }
};

/**
 * Generate German exercises
 */
export const generateExercise = async (topic, level, type = "fill-blank") => {
  const prompt = `Create a German language practice exercise:

Topic: ${topic}
Level: ${level}
Exercise Type: ${type}

Generate 5 questions with:
1. The question/prompt
2. The correct answer
3. Brief explanation
4. Difficulty indicator

Make it educational and engaging!`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      content: response.text,
      tokensUsed: Math.ceil(response.text.length / 4),
    };
  } catch (error) {
    console.error("Exercise generation error:", error);
    throw new Error("Failed to generate exercise");
  }
};
