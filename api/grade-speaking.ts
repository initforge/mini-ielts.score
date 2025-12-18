import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateContent, generateContentWithMedia, transcribeAudio, GeminiError } from './lib/gemini';
import { SpeakingAnswer } from './lib/types';

// Part weight mapping (ảnh hưởng trong 200 điểm)
const PART_WEIGHTS: Record<number, number> = {
  1: 20, // Part 1: Q1-2 (2 câu) ~ 20 điểm
  2: 20, // Part 2: Q3 (1 câu) ~ 20 điểm
  3: 40, // Part 3: Q4-6 (3 câu) ~ 40 điểm
  4: 60, // Part 4: Q7-9 (3 câu) ~ 60 điểm
  5: 30, // Part 5: Q10 (1 câu) ~ 30 điểm
  6: 30, // Part 6: Q11 (1 câu) ~ 30 điểm
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
    const { answers, questions, images, apiKey }: { 
      answers: SpeakingAnswer[]; 
      questions?: Record<string, string>;
      images?: Record<string, string>;
      apiKey?: string;
    } = body;

    if (!apiKey) {
      return response.status(400).json(
        { error: "Gemini API key is required. Please connect your API key in the header." }
      );
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return response.status(400).json(
        { error: "answers array is required" }
      );
    }

    // Lọc các câu trả lời hợp lệ:
    // - Có transcript hoặc audioBase64
    // - Câu hỏi có question text (đủ để chấm)
    const validAnswersInput = answers.filter((answer) => {
      const hasResponse =
        (answer.transcript && answer.transcript.trim().length > 0) ||
        (answer.audioBase64 && answer.audioBase64.trim().length > 0);
      if (!hasResponse) return false;

      const questionText = questions?.[answer.questionId] || answer.questionText;
      const hasQuestionText =
        typeof questionText === "string" && questionText.trim().length > 0;

      return hasQuestionText;
    });

    // Nếu không có câu trả lời hợp lệ nào → không gọi Gemini, trả về thông báo
    if (validAnswersInput.length === 0) {
      return response.status(200).json({
        incomplete: true,
        message:
          "Không có câu trả lời hợp lệ. Vui lòng hoàn thành ít nhất một câu hỏi có đầy đủ câu hỏi và câu trả lời.",
        incompleteQuestionIds: answers.map((a) => a.questionId),
      });
    }

    // Transcribe all audio recordings cho các câu hợp lệ
    const transcribedAnswers = await Promise.all(
      validAnswersInput.map(async (answer) => {
        let transcript = answer.transcript;
        
        if (!transcript && answer.audioBase64) {
          transcript = await transcribeAudio(answer.audioBase64, "audio/webm", apiKey);
        }

        return {
          ...answer,
          transcript: transcript || "",
        };
      })
    );

    // Group answers by part
    const answersByPart: Record<number, typeof transcribedAnswers> = {};
    transcribedAnswers.forEach((answer) => {
      const part = answer.questionType;
      if (!answersByPart[part]) {
        answersByPart[part] = [];
      }
      answersByPart[part].push(answer);
    });

    // Chuẩn bị media (ảnh) cho các part có picture / info
    const mediaParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

    const pushImage = (key?: string) => {
      if (!key) return;
      const imgBase64 = images?.[key];
      if (!imgBase64) return;

      let mimeType = "image/png";
      let data = imgBase64;

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

    // Part 2 – Picture (Q3): mỗi câu có ảnh riêng theo questionId
    pushImage("s3");
    // Part 4 – Info response (Q7-9) dùng shared image "part4"
    pushImage("part4");

    // Rubric text for context caching
    const rubricText = `TOEIC Speaking Evaluation Rubrics:

Part Distribution (Total 200 points):
- Part 1 (Read aloud, Q1-2): ~20 points (2 questions)
- Part 2 (Picture, Q3): ~20 points (1 question)  
- Part 3 (Q&A, Q5-7): ~40 points (3 questions)
- Part 4 (Info response, Q8-10): ~60 points (3 questions)
- Part 5 (Opinion, Q11): ~60 points (1 question)

Evaluation Criteria (Feedback only, NO scores):
1. Pronunciation (Phát âm): Is pronunciation clear and understandable? Stress, linking, intonation. Don't need to sound native, just understandable. Grammar errors are less severe than unclear pronunciation.
2. Intonation & Stress (Ngữ điệu – nhấn trọng âm): Do questions go up? Do statements go down? Avoid monotone "robot reading".
3. Grammar (Ngữ pháp): Basic tenses (present, past). Complete subject-verb sentences. Small errors OK if understandable.
4. Vocabulary (Từ vựng): Appropriate word choice for context. Don't need advanced words. Know how to paraphrase when stuck.
5. Coherence & Organization (Mạch lạc): Does answer have intro-body-conclusion? Main ideas and supporting details? Answers the question focus?
6. Completeness of Response (Độ đầy đủ): Is answer complete? Has examples/reasons/details?

Scoring:
- Each question gets a score 0-200
- Part scores are calculated from question scores
- Overall score is weighted sum of part scores
- Criteria are for feedback only, not scored separately`;

    // Construct prompt
    const prompt = `Evaluate the following TOEIC Speaking responses.

Student Responses by Part:
${Object.entries(answersByPart).map(([part, partAnswers]) => `
Part ${part}:
${partAnswers.map((answer, idx) => {
  const questionText = questions?.[answer.questionId] || answer.questionText;
  return `Question ${answer.questionId}:
Question: ${questionText}
Transcript: ${answer.transcript || "No transcript available"}`;
}).join("\n\n")}
`).join("\n\n")}

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-200, calculated from weighted part scores>,
  "partScores": [
    {
      "part": <number 1-6>,
      "questionScores": [
        {
          "questionId": "<question id>",
          "questionNumber": <number>,
          "score": <number 0-200>,
          "transcript": "<transcript text>",
          "feedback": "<brief feedback for this question>"
        },
        ...
      ],
      "partScore": <number 0-200, average or weighted of question scores>
    },
    ...
  ],
  "criteria": {
    "pronunciation": {
      "name": "Pronunciation (Phát âm)",
      "explanation": "<2-3 sentence feedback about pronunciation, no score>"
    },
    "intonation": {
      "name": "Intonation & Stress (Ngữ điệu – nhấn trọng âm)",
      "explanation": "<2-3 sentence feedback about intonation, no score>"
    },
    "grammar": {
      "name": "Grammar (Ngữ pháp)",
      "explanation": "<2-3 sentence feedback about grammar, no score>"
    },
    "vocabulary": {
      "name": "Vocabulary (Từ vựng)",
      "explanation": "<2-3 sentence feedback about vocabulary, no score>"
    },
    "coherence": {
      "name": "Coherence & Organization (Mạch lạc)",
      "explanation": "<2-3 sentence feedback about coherence, no score>"
    },
    "completeness": {
      "name": "Completeness of Response (Độ đầy đủ)",
      "explanation": "<2-3 sentence feedback about completeness, no score>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
      "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"]
}

Important:
- Calculate part scores from question scores
- Calculate overall score using weighted sum: Part1*20 + Part2*20 + Part3*40 + Part4*60 + Part5*30 + Part6*30, then normalize to 0-200
- ALL feedback text MUST be in Vietnamese (natural, dễ hiểu, không quá dài dòng), bao gồm:
  - "feedback" cho từng câu hỏi
  - "explanation" trong "criteria"
  - "strengths" và "weaknesses"
- Không dịch hoặc thay đổi tên key JSON (overallScore, partScores, criteria, strengths, weaknesses, ...). Chỉ nội dung chuỗi (string) bên trong mới dùng tiếng Việt.
- Criteria explanations are feedback only, NO scores
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

    const rawResult = JSON.parse(jsonText) || {};

    // Chuẩn hoá điểm theo phân bố PART_WEIGHTS
    // - Mỗi câu vẫn được AI chấm 0-200
    // - Mỗi part lấy trung bình điểm trên SỐ CÂU CHUẨN của part (câu thiếu tính như 0) trên thang 0-200
    // - Sau đó scale về thang tối đa của part (PART_WEIGHTS[part])
    // - Overall score = tổng(partScore_scaled của tất cả part) → tối đa 200
    const EXPECTED_QUESTIONS_PER_PART: Record<number, number> = {
      1: 2, // Q1-2
      2: 1, // Q3
      3: 3, // Q4-6
      4: 3, // Q7-9
      5: 1, // Q10
      6: 1, // Q11
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

      // Điểm tối đa của part (theo bảng 20/20/40/60/30/30)
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
  } catch (error) {
    console.error("Grading error:", error);
    
    // Handle specific Gemini errors
    if (error instanceof GeminiError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    
    return response.status(500).json(
      { error: "Failed to grade speaking responses" }
    );
  }
}
