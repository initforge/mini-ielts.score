import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/gemini";
import { WritingAnswer } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      parts, 
      questions, 
      images,
      apiKey
    }: { 
      parts: { part1: WritingAnswer[]; part2: WritingAnswer[]; part3: WritingAnswer[] };
      questions?: Record<string, string>;
      images?: Record<number, string>;
      apiKey?: string;
    } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is required. Please connect your API key in the header." },
        { status: 400 }
      );
    }

    if (!parts) {
      return NextResponse.json(
        { error: "parts object is required" },
        { status: 400 }
      );
    }

    // Construct comprehensive prompt
    const prompt = `You are an expert TOEIC Writing evaluator. Evaluate the following writing responses according to the official TOEIC Writing rubrics.

TOEIC Writing Rubrics (0-200 scale):
1. Grammar (0-200): Correct use of grammatical structures, sentence formation
2. Vocabulary Range (0-200): Variety and appropriateness of vocabulary
3. Organization (0-200): Logical structure, coherence, and cohesion
4. Task Fulfillment (0-200): Completeness and relevance to the task requirements

For each response, identify and highlight errors with:
- Start and end character positions
- Error type (e.g., "Grammar Error", "Spelling Error", "Word Choice", "Punctuation")
- Brief explanation

Student Responses:

Part 1 (Picture Descriptions):
${images?.[1] ? `Image provided for Part 1 (base64 encoded)\n` : ''}
${parts.part1.map((answer, index) => `
Question ${index + 1}:
Question: ${answer.questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}
`).join("\n")}

Part 2 (Email Response):
${images?.[2] ? `Image provided for Part 2 (base64 encoded)\n` : ''}
${parts.part2.map((answer, index) => `
Question ${index + 1}:
Question: ${answer.questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}
`).join("\n")}

Part 3 (Essays):
${parts.part3.map((answer, index) => `
Question ${index + 1}:
Question: ${answer.questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}
`).join("\n")}

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-200>,
  "part1": {
    "scores": [
      {
        "questionId": "w1",
        "score": <number 0-200>,
        "feedback": "<feedback for question 1>"
      },
      {
        "questionId": "w2",
        "score": <number 0-200>,
        "feedback": "<feedback for question 2>"
      },
      {
        "questionId": "w3",
        "score": <number 0-200>,
        "feedback": "<feedback for question 3>"
      },
      {
        "questionId": "w4",
        "score": <number 0-200>,
        "feedback": "<feedback for question 4>"
      },
      {
        "questionId": "w5",
        "score": <number 0-200>,
        "feedback": "<feedback for question 5>"
      }
    ],
    "overallScore": <number 0-200>
  },
  "part2": {
    "scores": [
      {
        "questionId": "w6",
        "score": <number 0-200>,
        "feedback": "<feedback for question 6>"
      },
      {
        "questionId": "w7",
        "score": <number 0-200>,
        "feedback": "<feedback for question 7>"
      }
    ],
    "overallScore": <number 0-200>
  },
  "part3": {
    "score": <number 0-200>,
    "feedback": "<feedback for question 8 essay>"
  },
  "criteria": {
    "grammar": {
      "name": "Grammar",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "vocabularyRange": {
      "name": "Vocabulary Range",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "organization": {
      "name": "Organization",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "taskFulfillment": {
      "name": "Task Fulfillment",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "improvementTips": ["<tip 1>", "<tip 2>", ...],
  "perPartFeedback": [
    {
      "part": 1,
      "feedback": "<detailed feedback for part 1>",
      "score": <number 0-200>
    },
    {
      "part": 2,
      "feedback": "<detailed feedback for part 2>",
      "score": <number 0-200>
    },
    {
      "part": 3,
      "feedback": "<detailed feedback for part 3>",
      "score": <number 0-200>
    }
  ],
  "highlightedAnswers": [
    {
      "questionId": "<question id>",
      "text": "<original answer text>",
      "errors": [
        {
          "start": <character start position>,
          "end": <character end position>,
          "type": "<error type>",
          "explanation": "<brief explanation>"
        },
        ...
      ]
    },
    ...
  ]
}

For highlightedAnswers, include ALL answers from all parts. For each answer, identify all errors with precise character positions (0-based indexing).

Return ONLY the JSON object, no additional text or markdown formatting.`;

    const responseText = await generateContent(prompt, apiKey);
    
    // Parse JSON response (handle markdown code blocks if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const result = JSON.parse(jsonText);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Grading error:", error);
    return NextResponse.json(
      { error: "Failed to grade writing responses" },
      { status: 500 }
    );
  }
}
