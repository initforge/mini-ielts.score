import { SpeakingQuestion, WritingQuestion } from "./types";

// Speaking Questions (11 questions across 6 parts)
export const speakingQuestions: SpeakingQuestion[] = [
  // Part 1: Read a text aloud (2 questions)
  {
    id: "s1",
    part: 1,
    questionNumber: 1,
    questionText: "Read the following text aloud:",
    responseTime: 45,
    instructions: "You will have 45 seconds to read the text aloud. Pronounce each word clearly.",
  },
  {
    id: "s2",
    part: 1,
    questionNumber: 2,
    questionText: "Read the following text aloud:",
    responseTime: 45,
    instructions: "You will have 45 seconds to read the text aloud. Pay attention to intonation.",
  },
  
  // Part 2: Describe a picture (1 question)
  {
    id: "s3",
    part: 2,
    questionNumber: 3,
    questionText: "Describe the picture in as much detail as possible.",
    imageUrl: "/images/speaking-pic1.jpg",
    responseTime: 45,
    instructions: "Describe what you see in the picture. Include details about people, objects, and activities.",
  },
  
  // Part 3: Respond to questions (3 questions)
  {
    id: "s4",
    part: 3,
    questionNumber: 4,
    questionText: "What is your favorite way to relax after a long day?",
    responseTime: 15,
    instructions: "Answer the question clearly and provide specific details.",
  },
  {
    id: "s5",
    part: 3,
    questionNumber: 5,
    questionText: "How do you usually commute to work or school?",
    responseTime: 15,
    instructions: "Answer the question clearly and provide specific details.",
  },
  {
    id: "s6",
    part: 3,
    questionNumber: 6,
    questionText: "What kind of music do you enjoy listening to?",
    responseTime: 15,
    instructions: "Answer the question clearly and provide specific details.",
  },
  
  // Part 4: Respond to questions using information provided (3 questions)
  {
    id: "s7",
    part: 4,
    questionNumber: 7,
    questionText: "According to the schedule, what time does the meeting start?",
    responseTime: 15,
    instructions: "Use the information provided to answer the question.",
  },
  {
    id: "s8",
    part: 4,
    questionNumber: 8,
    questionText: "Where will the conference be held?",
    responseTime: 15,
    instructions: "Use the information provided to answer the question.",
  },
  {
    id: "s9",
    part: 4,
    questionNumber: 9,
    questionText: "Who should attendees contact for more information?",
    responseTime: 15,
    instructions: "Use the information provided to answer the question.",
  },
  
  // Part 5: Propose a solution (1 question)
  {
    id: "s10",
    part: 5,
    questionNumber: 10,
    questionText: "A colleague is having trouble meeting project deadlines. Propose a solution to help them manage their time better.",
    preparationTime: 30,
    responseTime: 60,
    instructions: "You will have 30 seconds to prepare, then 60 seconds to propose your solution.",
  },
  
  // Part 6: Express an opinion (1 question)
  {
    id: "s11",
    part: 6,
    questionNumber: 11,
    questionText: "Do you think remote work is more effective than working in an office? Express your opinion with reasons.",
    preparationTime: 15,
    responseTime: 60,
    instructions: "You will have 15 seconds to prepare, then 60 seconds to express your opinion.",
  },
];

// Writing Questions (8 questions across 3 parts)
export const writingQuestions: WritingQuestion[] = [
  // Part 1: Write a sentence based on a picture (5 questions)
  {
    id: "w1",
    part: 1,
    questionNumber: 1,
    questionText: "Write one sentence about the picture.",
    imageUrl: "/images/writing-pic1.jpg",
    minWords: 5,
    instructions: "Write a complete sentence describing what you see in the picture.",
  },
  {
    id: "w2",
    part: 1,
    questionNumber: 2,
    questionText: "Write one sentence about the picture.",
    imageUrl: "/images/writing-pic2.jpg",
    minWords: 5,
    instructions: "Write a complete sentence describing what you see in the picture.",
  },
  {
    id: "w3",
    part: 1,
    questionNumber: 3,
    questionText: "Write one sentence about the picture.",
    imageUrl: "/images/writing-pic3.jpg",
    minWords: 5,
    instructions: "Write a complete sentence describing what you see in the picture.",
  },
  {
    id: "w4",
    part: 1,
    questionNumber: 4,
    questionText: "Write one sentence about the picture.",
    imageUrl: "/images/writing-pic4.jpg",
    minWords: 5,
    instructions: "Write a complete sentence describing what you see in the picture.",
  },
  {
    id: "w5",
    part: 1,
    questionNumber: 5,
    questionText: "Write one sentence about the picture.",
    imageUrl: "/images/writing-pic5.jpg",
    minWords: 5,
    instructions: "Write a complete sentence describing what you see in the picture.",
  },
  
  // Part 2: Respond to a written request (1 question)
  {
    id: "w6",
    part: 2,
    questionNumber: 6,
    questionText: "Read the email below. Write a response to the email. Your response should be at least 50 words.",
    minWords: 50,
    instructions: "Write an appropriate email response. Include a greeting, address all points in the original email, and close appropriately.",
  },
  
  // Part 3: Write an opinion essay (2 questions)
  {
    id: "w7",
    part: 3,
    questionNumber: 7,
    questionText: "Do you agree or disagree with the following statement? 'Technology has made our lives better.' Write an essay expressing your opinion. Your response should be at least 150 words.",
    minWords: 150,
    instructions: "Write a well-organized essay with an introduction, body paragraphs, and a conclusion. Support your opinion with examples.",
  },
  {
    id: "w8",
    part: 3,
    questionNumber: 8,
    questionText: "Some people believe that students should be required to wear school uniforms. Others think that students should be free to choose their own clothes. What is your opinion? Write an essay. Your response should be at least 150 words.",
    minWords: 150,
    instructions: "Write a well-organized essay with an introduction, body paragraphs, and a conclusion. Support your opinion with examples.",
  },
];

// Sample text for Part 1 Speaking questions
export const speakingTexts: Record<string, string> = {
  s1: "The quarterly sales report shows a significant increase in revenue compared to the previous quarter. Our marketing team has successfully launched three new campaigns targeting different customer segments. The customer satisfaction survey indicates a 15% improvement in overall ratings.",
  s2: "The annual conference will be held at the Grand Convention Center from March 15th to March 17th. Registration opens on January 10th, and early bird discounts are available until February 1st. All attendees are required to complete the online registration form and submit payment by March 1st.",
};

// Sample email for Part 2 Writing question
export const writingEmailPrompt = `Subject: Request for Meeting

Dear Team,

I hope this email finds you well. I would like to schedule a meeting to discuss the upcoming project timeline and resource allocation. 

Could you please let me know your availability for next week? I'm flexible with the time, but I would prefer either Monday morning or Wednesday afternoon.

Also, please come prepared with your current workload and any concerns you might have about the project deadlines.

Looking forward to your response.

Best regards,
Sarah Johnson
Project Manager`;
