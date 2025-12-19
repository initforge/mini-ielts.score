import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateContent, generateContentWithMedia, GeminiError } from './lib/gemini';
import { WritingAnswer } from './lib/types';

// Cấu hình timeout cho Vercel serverless function
// Free tier: max 10s, Pro: max 60s
export const config = {
  maxDuration: 60, // 60 giây cho Pro plan, hoặc 10s cho Free tier
};

// Part weight mapping (ảnh hưởng trong 200 điểm)
const PART_WEIGHTS: Record<number, number> = {
  1: 40, // Part 1: Q1-5 (5 câu) ~ 40 điểm
  2: 60, // Part 2: Q6-7 (2 câu) ~ 60 điểm
  3: 100, // Part 3: Q8 (1 câu) ~ 100 điểm
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = request.body;
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
      return response.status(400).json(
        { error: "Gemini API key is required. Please connect your API key in the header." }
      );
    }

    if (!parts) {
      return response.status(400).json(
        { error: "parts object is required" }
      );
    }

    // Lọc các câu trả lời hợp lệ:
    // - Có answer.text không rỗng
    // - Câu hỏi có question text HOẶC image (đáp ứng 1 trong 2 là đủ)
    const allAnswers = [
      ...(parts.part1 || []),
      ...(parts.part2 || []),
      ...(parts.part3 || []),
    ];

    const validAnswers = allAnswers.filter((answer) => {
      const hasText = answer.text && answer.text.trim().length > 0;
      if (!hasText) return false;

      const questionText = questions?.[answer.questionId] || answer.questionText;
      const hasQuestionText =
        typeof questionText === "string" && questionText.trim().length > 0;

      const partImage =
        typeof answer.questionType === "number"
          ? images?.[answer.questionType]
          : undefined;
      const hasImage =
        typeof partImage === "string" && partImage.trim().length > 0;

      return hasQuestionText || hasImage;
    });

    // Nếu không có câu trả lời hợp lệ nào → không gọi Gemini, trả về thông báo
    if (validAnswers.length === 0) {
      return response.status(200).json({
        incomplete: true,
        message:
          "Không có câu trả lời hợp lệ. Vui lòng hoàn thành ít nhất một câu hỏi có đầy đủ câu hỏi và câu trả lời.",
        incompleteQuestionIds: allAnswers.map((a) => a.questionId),
      });
    }

    // Tổ chức lại thành từng part chỉ với các câu hợp lệ
    const validPart1 = validAnswers.filter((a) => a.questionType === 1);
    const validPart2 = validAnswers.filter((a) => a.questionType === 2);
    const validPart3 = validAnswers.filter((a) => a.questionType === 3);

    // Rubric text for context caching
    const rubricText = `TOEIC Writing Evaluation Rubrics:

Part Distribution (Total 200 points):
- Part 1 (Write a sentence based on a picture, Q1-5): ~40 points (5 questions)
- Part 2 (Respond to a written request, Q6-7): ~60 points (2 questions)
- Part 3 (Write an opinion essay, Q8): ~100 points (1 question)

PART 1 – Write a sentence based on a picture (Q1-5):
🎯 Goal: Write 1 grammatically correct sentence based on picture
✅ Evaluation Criteria (Feedback only, NO scores):
- Grammar (MOST IMPORTANT): Basic tenses, sentence structure
- Sentence structure: Complete subject-verb sentences
- Accuracy: Does it match the picture?
👉 Wrong tense / missing subject-verb = heavy penalty

PART 2 – Respond to a written request (Q6-7):
🎯 Goal: Write email/short response meeting requirements
✅ Evaluation Criteria (Feedback only, NO scores):
- Task fulfillment: Does it answer all questions in the prompt?
- Grammar: Correct structures
- Vocabulary: Formal vocabulary appropriate for emails
- Clarity: Clear and understandable
👉 Missing information asked in prompt = major point loss

PART 3 – Write an opinion essay (Q8):
🎯 Goal: Write short essay (~300 words)
✅ Evaluation Criteria (Feedback only, NO scores):
- Organization: Intro-body-conclusion structure
- Development: Reasons + examples provided
- Grammar: Correct structures
- Vocabulary: Appropriate word choice
- Logic: Logical flow of ideas
👉 This part determines high or low Writing score

Scoring:
- Each question gets a score 0-200
- Part scores are calculated from question scores
- Overall score is weighted sum: Part1*40 + Part2*60 + Part3*100, then normalize to 0-200
- Criteria are for feedback only, not scored separately
- Error highlighting: Include character positions (0-based) for all errors in answers`;

    // Chuẩn bị media (ảnh) đầy đủ cho Gemini vision
    const mediaParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

    const pushImage = (imgBase64?: string) => {
      if (!imgBase64) return;
      let mimeType = "image/png";
      let data = imgBase64;

      // Hỗ trợ cả data URL lẫn pure base64
      if (imgBase64.startsWith("data:")) {
        const [meta, raw] = imgBase64.split(",", 2);
        const match = meta.match(/data:(.*?);base64/);
        if (match && match[1]) {
          mimeType = match[1];
        }
        data = raw || "";
      }

      if (data && data.trim().length > 0) {
        mediaParts.push({
          inlineData: {
            data,
            mimeType,
          },
        });
      }
    };

    // Part 1 image (picture for Q1-5)
    pushImage(images?.[1]);
    // Part 2 image (if any)
    pushImage(images?.[2]);

    const prompt = `Evaluate the following TOEIC Writing responses.

Part 1 (Picture Descriptions, Q1-5):
${(validPart1 || []).map((answer, idx) => {
  const questionText = questions?.[answer.questionId] || answer.questionText;
  return `Question ${answer.questionId} (Q${idx + 1}):
Question: ${questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}`;
}).join("\n\n")}

Part 2 (Email Response, Q6-7):
${(parts.part2 || []).map((answer, idx) => {
  const questionText = questions?.[answer.questionId] || answer.questionText;
  return `Question ${answer.questionId} (Q${idx + 6}):
Question: ${questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}`;
}).join("\n\n")}

Part 3 (Essay, Q8):
${(validPart3 || []).map((answer) => {
  const questionText = questions?.[answer.questionId] || answer.questionText;
  return `Question ${answer.questionId}:
Question: ${questionText}
Answer: ${answer.text}
Word Count: ${answer.wordCount}`;
}).join("\n\n")}

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-200, calculated from weighted part scores>,
  "partScores": [
    {
      "part": 1,
      "questionScores": [
        {
          "questionId": "<question id>",
          "questionNumber": <number 1-5>,
          "score": <number 0-200>,
          "feedback": "<brief feedback>",
          "text": "<original answer text>",
          "errors": [
            {
              "start": <character start position, 0-based>,
              "end": <character end position, 0-based>,
              "type": "<error type: Grammar Error, Spelling Error, Word Choice, Punctuation, etc>",
              "explanation": "<brief explanation>"
            },
            ...
          ]
        },
        ...
      ],
      "partScore": <number 0-200>
    },
    {
      "part": 2,
      "questionScores": [
        {
          "questionId": "<question id>",
          "questionNumber": <number 6-7>,
          "score": <number 0-200>,
          "feedback": "<brief feedback>",
          "text": "<original answer text>",
          "errors": [
            {
              "start": <character start position, 0-based>,
              "end": <character end position, 0-based>,
              "type": "<error type>",
              "explanation": "<brief explanation>"
            },
            ...
          ]
        },
        ...
      ],
      "partScore": <number 0-200>
    },
    {
      "part": 3,
      "questionScores": [
    {
      "questionId": "<question id>",
          "questionNumber": 8,
          "score": <number 0-200>,
          "feedback": "<brief feedback>",
      "text": "<original answer text>",
      "errors": [
        {
              "start": <character start position, 0-based>,
              "end": <character end position, 0-based>,
          "type": "<error type>",
          "explanation": "<brief explanation>"
        },
        ...
      ]
        }
      ],
      "partScore": <number 0-200>
    }
  ],
  "criteria": {
    "part1Grammar": {
      "name": "Grammar (Part 1)",
      "explanation": "<2-3 sentence feedback about Part 1 grammar, no score>"
    },
    "part1SentenceStructure": {
      "name": "Sentence Structure (Part 1)",
      "explanation": "<2-3 sentence feedback about Part 1 sentence structure, no score>"
    },
    "part1Accuracy": {
      "name": "Accuracy (Part 1)",
      "explanation": "<2-3 sentence feedback about Part 1 accuracy, no score>"
    },
    "part2TaskFulfillment": {
      "name": "Task Fulfillment (Part 2)",
      "explanation": "<2-3 sentence feedback about Part 2 task fulfillment, no score>"
    },
    "part2Grammar": {
      "name": "Grammar (Part 2)",
      "explanation": "<2-3 sentence feedback about Part 2 grammar, no score>"
    },
    "part2Vocabulary": {
      "name": "Vocabulary (Part 2)",
      "explanation": "<2-3 sentence feedback about Part 2 vocabulary, no score>"
    },
    "part2Clarity": {
      "name": "Clarity (Part 2)",
      "explanation": "<2-3 sentence feedback about Part 2 clarity, no score>"
    },
    "part3Organization": {
      "name": "Organization (Part 3)",
      "explanation": "<2-3 sentence feedback about Part 3 organization, no score>"
    },
    "part3Development": {
      "name": "Development (Part 3)",
      "explanation": "<2-3 sentence feedback about Part 3 development, no score>"
    },
    "part3Grammar": {
      "name": "Grammar (Part 3)",
      "explanation": "<2-3 sentence feedback about Part 3 grammar, no score>"
    },
    "part3Vocabulary": {
      "name": "Vocabulary (Part 3)",
      "explanation": "<2-3 sentence feedback about Part 3 vocabulary, no score>"
    },
    "part3Logic": {
      "name": "Logic (Part 3)",
      "explanation": "<2-3 sentence feedback about Part 3 logic, no score>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"]
}

Important:
- ALL feedback text MUST be in Vietnamese (tự nhiên, rõ ràng, không quá dài dòng), bao gồm:
  - "feedback" cho từng câu hỏi
  - "explanation" trong "criteria"
  - "strengths" và "weaknesses"
  - "errors.explanation" cho từng lỗi
- Không dịch hoặc thay đổi tên key JSON (overallScore, partScores, criteria, strengths, weaknesses, errors, ...). Chỉ nội dung chuỗi (string) bên trong mới dùng tiếng Việt.
- Calculate part scores from question scores
- Calculate overall score using weighted sum: Part1*40 + Part2*60 + Part3*100, then normalize to 0-200
- Criteria explanations are feedback only, NO scores
- Error highlighting: Include ALL errors with precise character positions (0-based indexing) in questionScores
- Strengths and weaknesses should be concise and comprehensive
- Return ONLY the JSON object, no additional text or markdown formatting.`;

    const responseText =
      mediaParts.length > 0
        ? await generateContentWithMedia(mediaParts, prompt, apiKey, rubricText)
        : await generateContent(prompt, apiKey, rubricText);
    
    // Parse JSON response (handle markdown code blocks if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let rawResult: any = {};
    try {
      rawResult = JSON.parse(jsonText) || {};
    } catch (parseError: any) {
      console.error("Failed to parse Gemini JSON response:", parseError);
      console.error("Response text:", jsonText.substring(0, 500));
      return response.status(500).json({
        error: "Gemini API trả về response không hợp lệ. Vui lòng thử lại.",
        code: "INVALID_RESPONSE",
        details: parseError?.message || "JSON parse error"
      });
    }

    // Chuẩn hoá điểm theo PART_WEIGHTS cho Writing
    // - Mỗi câu vẫn được AI chấm 0-200
    // - Mỗi part lấy trung bình điểm trên số câu chuẩn của part (câu thiếu tính như 0) trên thang 0-200
    // - Sau đó scale về thang tối đa của part (PART_WEIGHTS[part])
    // - Overall score = tổng(partScore_scaled của tất cả part) → tối đa 200
    const EXPECTED_QUESTIONS_PER_PART: Record<number, number> = {
      1: 5,
      2: 2,
      3: 1,
    };

    const normalizedPartScores: any[] = [];
    let overallScoreSum = 0;

    for (const part of Object.keys(PART_WEIGHTS).map((p) => Number(p))) {
      const expectedCount = EXPECTED_QUESTIONS_PER_PART[part] ?? 0;
      const existingPart =
        rawResult.partScores?.find((p: any) => p.part === part) || {
          part,
          questionScores: [],
          partScore: 0,
        };

      const questionScores: any[] = existingPart.questionScores || [];
      const sumScores = questionScores.reduce(
        (sum, q) => sum + (typeof q.score === "number" ? q.score : 0),
        0
      );

      const denom = expectedCount > 0 ? expectedCount : Math.max(questionScores.length, 1);
      const avgScore = denom > 0 ? sumScores / denom : 0;
      const clampedAvg = Math.max(0, Math.min(200, Math.round(avgScore)));

      const partMax = PART_WEIGHTS[part] || 0;
      const scaledPartScore =
        partMax > 0 ? Math.round((clampedAvg / 200) * partMax) : 0;

      overallScoreSum += scaledPartScore;

      normalizedPartScores.push({
        ...existingPart,
        part,
        partScore: scaledPartScore,
        questionScores,
      });
    }

    const overallScore = Math.max(0, Math.min(200, overallScoreSum));

    const normalizedResult = {
      ...rawResult,
      overallScore,
      partScores: normalizedPartScores,
    };

    return response.status(200).json(normalizedResult);
  } catch (error: any) {
    console.error("Grading error:", error);
    
    // Đảm bảo response chưa được gửi trước khi trả về error
    if (response.headersSent) {
      console.error("Response already sent, cannot send error response");
      return;
    }
    
    // Handle specific Gemini errors
    if (error instanceof GeminiError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    
    // Handle JSON parse errors
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
      return response.status(500).json({
        error: "Lỗi khi xử lý phản hồi từ Gemini API. Vui lòng thử lại.",
        code: "PARSE_ERROR",
        details: error.message
      });
    }
    
    // Handle timeout errors (có thể xảy ra trên Vercel)
    if (error?.code === "ETIMEDOUT" || error?.message?.includes("timeout")) {
      return response.status(504).json({
        error: "Request timeout. Vui lòng thử lại với ít câu hỏi hơn hoặc kiểm tra kết nối.",
        code: "TIMEOUT"
      });
    }
    
    return response.status(500).json({
      error: "Failed to grade writing responses",
      code: "UNKNOWN_ERROR",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined
    });
  }
}
