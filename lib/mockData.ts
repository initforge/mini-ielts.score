import { SpeakingQuestion, WritingQuestion } from "./types";

// Speaking Questions (11 questions across 5 parts)
export const speakingQuestions: SpeakingQuestion[] = [
  // Part 1: Read a text aloud (2 questions)
  {
    id: "s1",
    part: 1,
    questionNumber: 1,
    questionText: "Read the following text aloud:",
    preparationTime: 45,
    responseTime: 45,
    instructions: "You will have 45 seconds to prepare, then 45 seconds to read the text aloud. Pronounce each word clearly.",
  },
  {
    id: "s2",
    part: 1,
    questionNumber: 2,
    questionText: "Read the following text aloud:",
    preparationTime: 45,
    responseTime: 45,
    instructions: "You will have 45 seconds to prepare, then 45 seconds to read the text aloud. Pay attention to intonation.",
  },
  
  // Part 2: Describe a picture (2 questions)
  {
    id: "s3",
    part: 2,
    questionNumber: 3,
    questionText: "Describe the picture in as much detail as possible.",
    preparationTime: 30,
    responseTime: 30,
    instructions: "You will have 30 seconds to prepare, then 30 seconds to describe the picture.",
  },
  {
    id: "s4",
    part: 2,
    questionNumber: 4,
    questionText: "Describe the picture in as much detail as possible.",
    preparationTime: 30,
    responseTime: 30,
    instructions: "You will have 30 seconds to prepare, then 30 seconds to describe the picture.",
  },
  
  // Part 3: Respond to questions (3 questions)
  {
    id: "s5",
    part: 3,
    questionNumber: 5,
    questionText: "What do you usually do after work?",
    preparationTime: 3,
    responseTime: 15,
    instructions: "You will have 3 seconds to prepare after hearing the question, then 15 seconds to respond.",
  },
  {
    id: "s6",
    part: 3,
    questionNumber: 6,
    questionText: "Describe a hobby you enjoy.",
    preparationTime: 3,
    responseTime: 15,
    instructions: "You will have 3 seconds to prepare after hearing the question, then 15 seconds to respond.",
  },
  {
    id: "s7",
    part: 3,
    questionNumber: 7,
    questionText: "Do you prefer studying alone or with a group?",
    preparationTime: 3,
    responseTime: 15,
    instructions: "You will have 3 seconds to prepare after hearing the question, then 15 seconds to respond.",
  },
  
  // Part 4: Respond to questions using information provided (3 questions)
  {
    id: "s8",
    part: 4,
    questionNumber: 8,
    questionText: "What time does the first train leave?",
    preparationTime: 3,
    responseTime: 30,
    instructions: "You will have 3 seconds to prepare, then 30 seconds to respond using the information provided.",
  },
  {
    id: "s9",
    part: 4,
    questionNumber: 9,
    questionText: "Which option is cheaper for a group of 4?",
    preparationTime: 3,
    responseTime: 30,
    instructions: "You will have 3 seconds to prepare, then 30 seconds to respond using the information provided.",
  },
  {
    id: "s10",
    part: 4,
    questionNumber: 10,
    questionText: "Your friend wants to join a workshop. Which one do you recommend and why?",
    preparationTime: 15,
    responseTime: 30,
    instructions: "You will have 15 seconds to prepare, then 30 seconds to respond using the information provided.",
  },
  
  // Part 5: Express an opinion (1 question)
  {
    id: "s11",
    part: 5,
    questionNumber: 11,
    questionText: "Do you agree that children should start learning English early?",
    preparationTime: 15,
    responseTime: 60,
    instructions: "You will have 15 seconds to prepare, then 60 seconds to express your opinion.",
  },
];

// Writing Questions (8 questions across 3 parts)
export const writingQuestions: WritingQuestion[] = [
  // Part 1: Write a sentence based on a picture (5 questions) - Total 5 minutes
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
  
  // Part 2: Respond to a written request (2 questions)
  {
    id: "w6",
    part: 2,
    questionNumber: 6,
    questionText: "Read the email below. Write a response to the email. Your response should be at least 50 words.",
    minWords: 50,
    instructions: "Write an appropriate email response. Include a greeting, address all points in the original email, and close appropriately.",
    timeLimit: 10 * 60, // 10 minutes
  },
  {
    id: "w7",
    part: 2,
    questionNumber: 7,
    questionText: "Read the email below. Write a response to the email. Your response should be at least 50 words.",
    minWords: 50,
    instructions: "Write an appropriate email response. Include a greeting, address all points in the original email, and close appropriately.",
    timeLimit: 10 * 60, // 10 minutes
  },
  
  // Part 3: Write an opinion essay (1 question)
  {
    id: "w8",
    part: 3,
    questionNumber: 8,
    questionText: "Write an opinion essay based on the question provided.",
    minWords: 150,
    instructions: "Write a well-organized essay with an introduction, body paragraphs, and a conclusion. Support your opinion with examples.",
    timeLimit: 30 * 60, // 30 minutes
  },
];

// Sample text for Part 1 Speaking questions
export const speakingTexts: Record<string, string> = {
  s1: "The quarterly sales report shows a significant increase in revenue compared to the previous quarter. Our marketing team has successfully launched three new campaigns targeting different customer segments. The customer satisfaction survey indicates a 15% improvement in overall ratings.",
  s2: "The annual conference will be held at the Grand Convention Center from March 15th to March 17th. Registration opens on January 10th, and early bird discounts are available until February 1st. All attendees are required to complete the online registration form and submit payment by March 1st.",
};

// Sample email for Part 2 Writing questions
export const writingEmailPrompts: Record<number, string> = {
  6: `Subject: Request for Meeting

Dear Team,

I hope this email finds you well. I would like to schedule a meeting to discuss the upcoming project timeline and resource allocation. 

Could you please let me know your availability for next week? I'm flexible with the time, but I would prefer either Monday morning or Wednesday afternoon.

Also, please come prepared with your current workload and any concerns you might have about the project deadlines.

Looking forward to your response.

Best regards,
Sarah Johnson
Project Manager`,
  7: `Subject: Inquiry About Product Availability

Dear Customer Service Team,

I am writing to inquire about the availability of your new product line that was recently launched. I am particularly interested in the specifications and pricing for bulk orders.

Could you please provide me with detailed information about:
1. Product specifications and features
2. Pricing for orders of 100 units or more
3. Estimated delivery time
4. Payment terms and conditions

I would appreciate it if you could send me a detailed quotation at your earliest convenience.

Thank you for your time and consideration.

Best regards,
John Smith
Procurement Manager`,
};

// Backward compatibility
export const writingEmailPrompt = writingEmailPrompts[6];
