// TOEIC Speaking Test Questions
export const speakingQuestions = [
  {
    id: "speaking-1",
    part: 1,
    questionNumber: 1,
    questionText: "Read a text aloud",
    instructions: "In this part of the test, you will read aloud the text on the screen. You have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.",
    preparationTime: 45,
    responseTime: 45,
  },
  {
    id: "speaking-2",
    part: 1,
    questionNumber: 2,
    questionText: "Read a text aloud",
    instructions: "In this part of the test, you will read aloud the text on the screen. You have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.",
    preparationTime: 45,
    responseTime: 45,
  },
  {
    id: "speaking-3",
    part: 2,
    questionNumber: 3,
    questionText: "Describe a picture",
    instructions: "In this part of the test, you will describe the picture on your screen in as much detail as you can. You have 45 seconds to prepare. Then you will have 45 seconds to speak about the picture.",
    preparationTime: 45,
    responseTime: 45,
    imageUrl: "/images/sample-image.jpg",
  },
  {
    id: "speaking-4",
    part: 3,
    questionNumber: 4,
    questionText: "Respond to questions",
    instructions: "In this part of the test, you will answer three questions about daily activities or events. You have 3 seconds to prepare for each question. Then you will have 15 seconds to respond to each question.",
    responseTime: 15,
  },
  {
    id: "speaking-5",
    part: 4,
    questionNumber: 5,
    questionText: "Respond to questions using information provided",
    instructions: "In this part of the test, you will answer three questions based on the information provided. You have 3 seconds to prepare for each question. Then you will have 15 seconds to respond to each question.",
    responseTime: 15,
  },
  {
    id: "speaking-6",
    part: 5,
    questionNumber: 6,
    questionText: "Express an opinion",
    instructions: "In this part of the test, you will give your opinion about a specific topic. Be sure to say as much as you can in the time allowed. You have 45 seconds to prepare. Then you will have 60 seconds to speak.",
    preparationTime: 45,
    responseTime: 60,
  },
];

// TOEIC Writing Test Questions
export const writingQuestions = [
  {
    id: "writing-1",
    part: 1,
    questionNumber: 1,
    questionText: "Write a sentence based on a picture",
    instructions: "In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.",
    minWords: 1,
    imageUrl: "/images/writing-sample-1.jpg",
  },
  {
    id: "writing-2",
    part: 1,
    questionNumber: 2,
    questionText: "Write a sentence based on a picture",
    instructions: "In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.",
    minWords: 1,
    imageUrl: "/images/writing-sample-2.jpg",
  },
  {
    id: "writing-3",
    part: 1,
    questionNumber: 3,
    questionText: "Write a sentence based on a picture",
    instructions: "In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.",
    minWords: 1,
    imageUrl: "/images/writing-sample-3.jpg",
  },
  {
    id: "writing-4",
    part: 1,
    questionNumber: 4,
    questionText: "Write a sentence based on a picture",
    instructions: "In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.",
    minWords: 1,
    imageUrl: "/images/writing-sample-4.jpg",
  },
  {
    id: "writing-5",
    part: 1,
    questionNumber: 5,
    questionText: "Write a sentence based on a picture",
    instructions: "In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.",
    minWords: 1,
    imageUrl: "/images/writing-sample-5.jpg",
  },
  {
    id: "writing-6",
    part: 2,
    questionNumber: 6,
    questionText: "Respond to a written request",
    instructions: "In this part of the test, you will show how well you can write a response to an e-mail. Your response will be scored on the quality and variety of your sentences, vocabulary, and organization.",
    minWords: 25,
  },
  {
    id: "writing-7",
    part: 3,
    questionNumber: 7,
    questionText: "Write an opinion essay",
    instructions: "In this part of the test, you will write an essay in response to a question that asks you to state, explain, and support your opinion on an issue. Typically, an effective essay will contain a minimum of 300 words.",
    minWords: 300,
  },
];

// Sample texts for speaking part 1
export const speakingTexts: Record<string, string> = {
  "speaking-1": "Welcome to the annual technology conference. This year's theme focuses on artificial intelligence and its impact on modern business practices. We are pleased to announce that registration is now open for all participants.",
  "speaking-2": "The company's quarterly report shows significant growth in online sales. Digital marketing strategies have proven effective, resulting in a twenty-five percent increase compared to the previous quarter.",
};

// Sample email prompt for writing part 2
export const writingEmailPrompt = `From: Sarah Johnson <sarah.johnson@company.com>
To: Project Team <team@company.com>
Subject: Upcoming Project Deadline

Hi Team,

I hope this email finds you well. I wanted to reach out regarding our upcoming project deadline on March 15th. 

As we approach the final stages, I think it would be beneficial to schedule a meeting to review our progress and address any remaining challenges. Please let me know your availability for next week.

Looking forward to hearing from you.

Best regards,
Sarah Johnson
Project Manager`;

// Sample rubrics for scoring
export const speakingRubric = {
  pronunciation: {
    name: "Pronunciation",
    levels: {
      3: "Highly intelligible",
      2: "Generally intelligible", 
      1: "Sometimes intelligible",
      0: "Rarely intelligible"
    }
  },
  intonationAndStress: {
    name: "Intonation and Stress",
    levels: {
      3: "Appropriate use of intonation and stress",
      2: "Generally appropriate use",
      1: "Limited appropriate use", 
      0: "Inappropriate use"
    }
  },
  grammar: {
    name: "Grammar",
    levels: {
      3: "Minor errors that do not obscure meaning",
      2: "Noticeable errors that rarely obscure meaning",
      1: "Noticeable errors that sometimes obscure meaning",
      0: "Frequent errors that often obscure meaning"
    }
  },
  vocabulary: {
    name: "Vocabulary",
    levels: {
      3: "Appropriate and varied vocabulary",
      2: "Generally appropriate vocabulary", 
      1: "Limited but appropriate vocabulary",
      0: "Limited and often inappropriate vocabulary"
    }
  },
  cohesion: {
    name: "Cohesion",
    levels: {
      3: "Speech is sustained with clear progression of ideas",
      2: "Speech is sustained with generally clear progression",
      1: "Speech is not always sustained; progression of ideas is not always clear",
      0: "Speech is not sustained; progression of ideas is unclear"
    }
  }
};

export const writingRubric = {
  grammar: {
    name: "Grammar", 
    levels: {
      5: "Minor errors that do not obscure meaning",
      4: "Some errors that rarely obscure meaning",
      3: "Some errors that sometimes obscure meaning", 
      2: "Frequent errors that often obscure meaning",
      1: "Frequent errors that often obscure meaning"
    }
  },
  vocabulary: {
    name: "Vocabulary",
    levels: {
      5: "Sophisticated and varied vocabulary",
      4: "Appropriate and varied vocabulary",
      3: "Generally appropriate vocabulary",
      2: "Limited but appropriate vocabulary", 
      1: "Limited and often inappropriate vocabulary"
    }
  },
  organization: {
    name: "Organization",
    levels: {
      5: "Clear, logical organization with smooth transitions",
      4: "Clear organization with some transitions",
      3: "Generally clear organization",
      2: "Inconsistent organization",
      1: "Little or no organization"
    }
  }
};