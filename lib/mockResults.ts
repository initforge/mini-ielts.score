import { SpeakingGradingResponse, WritingGradingResponse } from "./types";

export const mockSpeakingResults: SpeakingGradingResponse = {
  overallScore: 165,
  criteria: {
    pronunciation: {
      name: "Pronunciation",
      score: 160,
      maxScore: 200,
      explanation: "Your pronunciation is generally clear and understandable. Most words are pronounced correctly, though some vowel sounds could be more precise.",
    },
    intonation: {
      name: "Intonation",
      score: 155,
      maxScore: 200,
      explanation: "You demonstrate good awareness of intonation patterns. Work on varying your pitch more naturally in questions and statements.",
    },
    grammar: {
      name: "Grammar",
      score: 170,
      maxScore: 200,
      explanation: "Strong grammatical accuracy with only minor errors. Your sentence structures are mostly correct and appropriate.",
    },
    vocabulary: {
      name: "Vocabulary",
      score: 175,
      maxScore: 200,
      explanation: "Good range of vocabulary used appropriately. You show ability to use varied expressions effectively.",
    },
    content: {
      name: "Content",
      score: 160,
      maxScore: 200,
      explanation: "Your responses are relevant and address the questions well. Try to provide more specific details and examples.",
    },
    fluency: {
      name: "Fluency",
      score: 150,
      maxScore: 200,
      explanation: "Your speech flows reasonably well, though there are some hesitations. Practice speaking more smoothly without frequent pauses.",
    },
  },
  strengths: [
    "Good grammatical accuracy with minimal errors",
    "Appropriate use of vocabulary in context",
    "Clear pronunciation of most words",
    "Relevant responses that address the questions",
  ],
  weaknesses: [
    "Some hesitation and pauses affect fluency",
    "Vowel sounds could be more precise",
    "Intonation patterns need more natural variation",
    "Could provide more specific details in responses",
  ],
  improvementTips: [
    "Practice speaking continuously for longer periods to improve fluency",
    "Focus on vowel sound accuracy, especially in stressed syllables",
    "Listen to native speakers and mimic their intonation patterns",
    "Prepare more examples and details before responding to questions",
    "Record yourself speaking and listen for areas of improvement",
  ],
  perQuestionFeedback: [
    {
      questionId: "s1",
      transcript: "The quarterly sales report shows a significant increase in revenue compared to the previous quarter.",
      feedback: "Good reading pace and clarity. Pay attention to the pronunciation of 'quarterly' and 'revenue'.",
      score: 170,
    },
    {
      questionId: "s2",
      transcript: "The annual conference will be held at the Grand Convention Center from March 15th to March 17th.",
      feedback: "Clear pronunciation overall. Work on the stress pattern in 'convention'.",
      score: 165,
    },
    {
      questionId: "s3",
      transcript: "In the picture, I can see a man and a woman sitting at a table. They are having a conversation.",
      feedback: "Good description with relevant details. Try to include more specific observations about the setting.",
      score: 160,
    },
    {
      questionId: "s4",
      transcript: "My favorite way to relax is to read a book or watch a movie. I also like to go for a walk.",
      feedback: "Appropriate response with good examples. Could expand with more specific details.",
      score: 155,
    },
    {
      questionId: "s5",
      transcript: "I usually commute to work by bus. It takes about thirty minutes.",
      feedback: "Clear and concise answer. Consider adding more details about your commute experience.",
      score: 150,
    },
    {
      questionId: "s6",
      transcript: "I enjoy listening to pop music and sometimes classical music. It depends on my mood.",
      feedback: "Good variety in your answer. Work on smoother transitions between ideas.",
      score: 155,
    },
    {
      questionId: "s7",
      transcript: "According to the schedule, the meeting starts at 2 PM.",
      feedback: "Correct information extraction. Clear and accurate response.",
      score: 170,
    },
    {
      questionId: "s8",
      transcript: "The conference will be held at the Grand Convention Center.",
      feedback: "Accurate response. Good use of information provided.",
      score: 170,
    },
    {
      questionId: "s9",
      transcript: "Attendees should contact the registration office for more information.",
      feedback: "Appropriate response. Clear and direct.",
      score: 165,
    },
    {
      questionId: "s10",
      transcript: "I think the colleague should create a schedule and prioritize tasks. They could also break down large projects into smaller steps.",
      feedback: "Good problem-solving approach with practical suggestions. Could provide more specific examples.",
      score: 160,
    },
    {
      questionId: "s11",
      transcript: "I think remote work can be more effective because it offers flexibility. However, office work has benefits like better collaboration.",
      feedback: "Balanced opinion with good reasoning. Work on smoother transitions and more detailed examples.",
      score: 165,
    },
  ],
};

export const mockWritingResults: WritingGradingResponse = {
  overallScore: 172,
  part1: {
    scores: [
      { questionId: "w1", score: 175, feedback: "Clear and grammatically correct sentence." },
      { questionId: "w2", score: 170, feedback: "Good description with appropriate vocabulary." },
      { questionId: "w3", score: 180, feedback: "Excellent sentence structure and clarity." },
      { questionId: "w4", score: 165, feedback: "Good attempt, could use more descriptive words." },
      { questionId: "w5", score: 175, feedback: "Well-written sentence with good grammar." },
    ],
    overallScore: 173,
  },
  part2: {
    scores: [
      { questionId: "w6", score: 180, feedback: "Excellent email response with appropriate tone." },
      { questionId: "w7", score: 175, feedback: "Good email response addressing all points." },
    ],
    overallScore: 177,
  },
  part3: {
    score: 170,
    feedback: "Well-structured essay with clear arguments and examples.",
  },
  criteria: {
    grammar: {
      name: "Grammar",
      score: 175,
      maxScore: 200,
      explanation: "Excellent grammatical accuracy with very few errors. Your sentence structures are sophisticated and varied.",
    },
    vocabularyRange: {
      name: "Vocabulary Range",
      score: 170,
      maxScore: 200,
      explanation: "Good variety of vocabulary used appropriately. You demonstrate ability to use advanced words in context.",
    },
    organization: {
      name: "Organization",
      score: 165,
      maxScore: 200,
      explanation: "Well-organized writing with clear structure. Some transitions could be smoother between paragraphs.",
    },
    taskFulfillment: {
      name: "Task Fulfillment",
      score: 180,
      maxScore: 200,
      explanation: "Excellent completion of all tasks. Your responses fully address the requirements and provide relevant details.",
    },
  },
  strengths: [
    "Strong grammatical accuracy with minimal errors",
    "Good variety of vocabulary used appropriately",
    "Well-structured responses that address all requirements",
    "Clear and coherent writing throughout",
  ],
  weaknesses: [
    "Some transitions between ideas could be smoother",
    "Occasional word choice could be more precise",
    "Paragraph organization could be improved in longer essays",
  ],
  improvementTips: [
    "Use more transition words to connect ideas smoothly",
    "Review word choice to ensure precision and appropriateness",
    "Practice organizing longer essays with clear topic sentences",
    "Read more academic texts to improve formal writing style",
  ],
  perPartFeedback: [
    {
      part: 1,
      feedback: "Your picture descriptions are clear and grammatically correct. Good use of present continuous tense. Try to include more descriptive adjectives.",
      score: 175,
    },
    {
      part: 2,
      feedback: "Excellent email response with appropriate tone and structure. You addressed all points in the original email. The closing is professional and courteous.",
      score: 180,
    },
    {
      part: 3,
      feedback: "Well-structured essays with clear introduction, body paragraphs, and conclusion. Your arguments are supported with relevant examples. Work on smoother transitions between paragraphs.",
      score: 170,
    },
  ],
  highlightedAnswers: [
    {
      questionId: "w1",
      text: "A man is reading a book in the library.",
      errors: [],
    },
    {
      questionId: "w2",
      text: "Two people are discussing something at a table in a cafe.",
      errors: [],
    },
    {
      questionId: "w3",
      text: "A woman is typing on her computer in an office.",
      errors: [],
    },
    {
      questionId: "w4",
      text: "Children are playing in the park with their friends.",
      errors: [],
    },
    {
      questionId: "w5",
      text: "A chef is preparing food in the kitchen of a restaurant.",
      errors: [],
    },
    {
      questionId: "w6",
      text: "Dear Sarah,\n\nThank you for your email regarding the meeting schedule. I am available on Monday morning or Wednesday afternoon next week. I will prepare my current workload summary and any concerns about project deadlines.\n\nLooking forward to our discussion.\n\nBest regards,\n[Your name]",
      errors: [
        {
          start: 120,
          end: 130,
          type: "Word Choice",
          explanation: "Consider using 'I look forward to' instead of 'Looking forward to' for more formal tone",
        },
      ],
    },
    {
      questionId: "w7",
      text: "Technology has undoubtedly made our lives better in many ways. First, it has improved communication, allowing us to connect with people around the world instantly. Second, technology has enhanced healthcare, enabling doctors to diagnose and treat diseases more effectively. Finally, technology has made education more accessible through online learning platforms. In conclusion, while technology has some drawbacks, its benefits far outweigh the disadvantages.",
      errors: [],
    },
    {
      questionId: "w8",
      text: "I believe that students should be required to wear school uniforms. Uniforms promote equality among students regardless of their economic background. They also reduce distractions and help students focus on their studies. Additionally, uniforms create a sense of unity and school spirit. However, some argue that uniforms limit self-expression. Despite this, I think the benefits of school uniforms are more important.",
      errors: [
        {
          start: 45,
          end: 55,
          type: "Grammar",
          explanation: "Consider 'regardless of' instead of 'regardless of' - the phrase is correct but could be more concise",
        },
      ],
    },
  ],
};
