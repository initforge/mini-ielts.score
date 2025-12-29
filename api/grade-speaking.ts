import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateContent, generateContentWithMedia, transcribeAudio, transcribeMultipleAudio, GeminiError } from './lib/gemini';
import { SpeakingAnswer } from './lib/types';

// Cấu hình timeout cho Vercel serverless function
// Free tier: max 10s, Pro: max 60s, Enterprise: max 300s
// Note: Nếu chạy trên VPS, timeout được điều khiển bởi nginx config
export const config = {
  maxDuration: 300, // 300 giây (5 phút) để đủ cho batch transcription + grading
};

// Part weight mapping (ảnh hưởng trong 200 điểm)
const PART_WEIGHTS: Record<number, number> = {
  1: 20, // Part 1: Q1-2 (2 câu) ~ 20 điểm
  2: 20, // Part 2: Q3-4 (2 câu) ~ 20 điểm
  3: 40, // Part 3: Q5-7 (3 câu) ~ 40 điểm
  4: 60, // Part 4: Q8-10 (3 câu) ~ 60 điểm
  5: 30, // Part 5: Q11 (1 câu) ~ 30 điểm
  6: 30, // Part 6: Q11 (1 câu) ~ 30 điểm (deprecated, không dùng nữa)
};

// Batch transcribe config
const BATCH_SIZE = 6; // Số câu audio gửi trong 1 request (Gemini hỗ trợ tối đa ~10 file/request)
const BATCH_DELAY_MS = 60_000; // Đợi 60s giữa các batch để reset quota (5 req/phút → cần 60s để reset)
const RATE_LIMIT_RETRY_DELAY_MS = 5_000; // đợi thêm trước khi retry khi gặp 429
const RATE_LIMIT_MAX_RETRIES = 2; // số lần thử lại tối đa cho một batch

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      if (!hasResponse) {
        console.log(`[grade-speaking] Answer ${answer.questionId} skipped: no transcript or audioBase64`);
        return false;
      }

      const questionText = questions?.[answer.questionId] || answer.questionText;
      const hasQuestionText =
        typeof questionText === "string" && questionText.trim().length > 0;

      if (!hasQuestionText) {
        console.log(`[grade-speaking] Answer ${answer.questionId} skipped: no question text`);
        return false;
      }

      // Log chi tiết audioBase64 để debug
      if (answer.audioBase64) {
        const audioSizeKB = Math.round(answer.audioBase64.length * 3 / 4 / 1024);
        const firstChars = answer.audioBase64.substring(0, 50);
        const lastChars = answer.audioBase64.substring(answer.audioBase64.length - 50);
        console.log(`[grade-speaking] Answer ${answer.questionId} valid: hasAudio=true, audioSize=${audioSizeKB}KB, first50chars="${firstChars}...", last50chars="...${lastChars}"`);
      } else {
        console.log(`[grade-speaking] Answer ${answer.questionId} valid: hasAudio=false, hasTranscript=${!!answer.transcript}`);
      }
      return true;
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

    // Batch transcribe: chia thành các batch và gửi nhiều audio cùng lúc
    const transcribedAnswers: SpeakingAnswer[] = [];
    
    // Tách các câu cần transcribe (có audioBase64 nhưng chưa có transcript)
    const answersToTranscribe = validAnswersInput.filter(
      (answer) => !answer.transcript && answer.audioBase64
    );
    const answersWithTranscript = validAnswersInput.filter(
      (answer) => answer.transcript && answer.transcript.trim().length > 0
    );

    // Thêm các câu đã có transcript vào kết quả
    answersWithTranscript.forEach((answer) => {
      transcribedAnswers.push(answer);
      console.log(`[grade-speaking] Using existing transcript for question ${answer.questionId}`);
    });

    // Function để thực hiện grading (tách ra để có thể gọi song song với batch cuối)
    const performGrading = async (finalTranscribedAnswers: typeof transcribedAnswers) => {
    // Group answers by part
      const answersByPart: Record<number, typeof finalTranscribedAnswers> = {};
      finalTranscribedAnswers.forEach((answer) => {
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
- Part 2 (Picture, Q3-4): ~20 points (2 questions)  
- Part 3 (Q&A, Q5-7): ~40 points (3 questions)
- Part 4 (Info response, Q8-10): ~60 points (3 questions)
- Part 5 (Opinion, Q11): ~30 points (1 question)

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

      // Construct prompt - chỉ gửi những câu có transcript
      const prompt = `Evaluate the following TOEIC Speaking responses.

Student Responses by Part:
${Object.entries(answersByPart).map(([part, partAnswers]) => {
  // Chỉ lấy những câu có transcript (đã được transcribe thành công)
  const answersWithTranscript = partAnswers.filter(a => a.transcript && a.transcript.trim().length > 0);
  if (answersWithTranscript.length === 0) return `Part ${part}: No valid responses.`;
  
  return `
Part ${part}:
${answersWithTranscript.map((answer, idx) => {
    const questionText = questions?.[answer.questionId] || answer.questionText;
    return `Question ${answer.questionId}:
Question: ${questionText}
Transcript: ${answer.transcript}`;
  }).join("\n\n")}
`;
}).filter(partText => !partText.includes("No valid responses")).join("\n\n")}

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-200, sum of all part scores>,
  "partScores": [
    {
      "part": <number 1-6>,
      "questionScores": [
        {
          "questionId": "<question id>",
          "questionNumber": <number>,
          "score": <number, see scoring scale below>,
          "transcript": "<transcript text>",
          "feedback": "<brief feedback for this question>"
        },
        ...
      ],
      "partScore": <number, sum of question scores in this part>
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

SCORING SCALE (CRITICAL - Use these exact ranges):
- Part 1 (Q1-2): Each question scored 0-10. Part total = sum of question scores (max 20).
- Part 2 (Q3-4): Each question scored 0-10. Part total = sum of question scores (max 20).
- Part 3 (Q5-7): Each question scored 0-13. Part total = sum of question scores (max 40).
- Part 4 (Q8-10): Each question scored 0-20. Part total = sum of question scores (max 60).
- Part 5 (Q11): Single question scored 0-30. Part total = question score (max 30).
- Part 6: Deprecated, không dùng nữa.

Important:
- ONLY evaluate questions that are provided in "Student Responses by Part" above. Do NOT create scores for questions that are not listed.
- For each part, ONLY include questionScores for questions that have transcripts in the input.
- Score each question using the scale above (NOT 0-200).
- Calculate partScore as the SUM of question scores in that part (only for questions that were actually answered).
- Calculate overallScore as the SUM of all partScores (max 200).
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

      let rawResult: any = {};
      try {
        rawResult = JSON.parse(jsonText) || {};
      } catch (parseError: any) {
        console.error("Failed to parse Gemini JSON response (speaking):", parseError);
        console.error("Response text:", jsonText.substring(0, 500));
        throw new Error("Gemini API trả về response không hợp lệ. Vui lòng thử lại.");
      }

      // AI đã chấm điểm theo đúng format của từng part:
      // - Part 1: mỗi câu 0-10, part = tổng
      // - Part 2: mỗi câu 0-10, part = tổng
      // - Part 3: mỗi câu 0-13, part = tổng
      // - Part 4: mỗi câu 0-20, part = tổng
      // - Part 5: 0-30
      // Chỉ cần lấy điểm từ AI response và cộng tổng, không cần scale

      const normalizedPartScores: any[] = [];
      let overallScoreSum = 0;

      for (const part of Object.keys(PART_WEIGHTS).map((p) => Number(p))) {
        const existingPart =
          rawResult.partScores?.find((p: any) => p.part === part) || {
            part,
            questionScores: [],
            partScore: 0,
          };

        // Normalize question scores: đảm bảo mỗi câu có score hợp lệ
        const normalizedQuestionScores = existingPart.questionScores?.map((qs: any) => {
          let score = typeof qs.score === "number" ? qs.score : 0;
          // Clamp score theo part
          if (part === 1) score = Math.max(0, Math.min(10, score));
          else if (part === 2) score = Math.max(0, Math.min(10, score)); // Part 2: mỗi câu 0-10
          else if (part === 3) score = Math.max(0, Math.min(13, score));
          else if (part === 4) score = Math.max(0, Math.min(20, score));
          else if (part === 5) score = Math.max(0, Math.min(30, score));
          else if (part === 6) score = Math.max(0, Math.min(30, score)); // Deprecated

          return {
            questionId: qs.questionId || "",
            questionNumber: qs.questionNumber || 0,
            score,
            transcript: qs.transcript || "",
            feedback: qs.feedback || "",
          };
        }) || [];

        // Tính partScore từ tổng question scores
        const partScore = normalizedQuestionScores.reduce((sum: number, qs: any) => sum + (qs.score || 0), 0);

        normalizedPartScores.push({
          part,
          questionScores: normalizedQuestionScores,
          partScore,
        });

        overallScoreSum += partScore;
      }

      // Clamp overall score
      const overallScore = Math.max(0, Math.min(200, overallScoreSum));

      return {
        overallScore,
        partScores: normalizedPartScores,
        criteria: rawResult.criteria || {},
        strengths: rawResult.strengths || [],
        weaknesses: rawResult.weaknesses || [],
      };
    };

    // Nếu có câu cần transcribe → chia batch và gọi Gemini
    let gradePromise: Promise<any> | null = null;
    if (answersToTranscribe.length > 0) {
      // Chia thành batch (mỗi batch tối đa BATCH_SIZE câu)
      const batches: Array<typeof answersToTranscribe> = [];
      for (let i = 0; i < answersToTranscribe.length; i += BATCH_SIZE) {
        batches.push(answersToTranscribe.slice(i, i + BATCH_SIZE));
      }

      console.log(`[grade-speaking] Transcribing ${answersToTranscribe.length} questions in ${batches.length} batch(es)`);

      // Xử lý từng batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const isLastBatch = batchIndex === batches.length - 1;
        console.log(`[grade-speaking] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} questions)`);

        // Nếu là batch cuối → chuẩn bị grade request (sẽ gọi sau khi batch xong)
        if (isLastBatch) {
          console.log(`[grade-speaking] Will start grade request after last batch completes...`);
        }

        // Chuẩn bị data cho batch transcribe
        const audioBatch = batch.map((answer) => ({
          questionId: answer.questionId,
          audioBase64: answer.audioBase64!,
          mimeType: "audio/webm",
        }));

        let transcriptMap: Record<string, string> = {};
        let attempt = 0;

        // Retry loop để handle RATE_LIMIT (429)
        let batchTranscriptionError: any = null;
        while (attempt <= RATE_LIMIT_MAX_RETRIES) {
          try {
            transcriptMap = await transcribeMultipleAudio(audioBatch, apiKey);
            
            // Log kết quả từng câu trong batch
            batch.forEach((answer) => {
              const transcript = transcriptMap[answer.questionId] || "";
              const wordCount = transcript.split(/\s+/).filter((w) => w.length > 0).length;
              const audioSizeKB = Math.round((answer.audioBase64?.length || 0) * 3 / 4 / 1024);
              
              console.log(`[grade-speaking] ✅ Transcription successful for question ${answer.questionId}`);
              console.log(
                `[grade-speaking] Transcript: "${transcript.substring(0, 200)}${
                  transcript.length > 200 ? "..." : ""
                }" (${transcript.length} chars, ${wordCount} words)`,
              );

              // Warning nếu transcript quá ngắn
              if (wordCount < 5 && audioSizeKB > 10) {
                console.warn(
                  `[grade-speaking] ⚠️ WARNING: Very short transcript (${wordCount} words) for ${audioSizeKB}KB audio. Possible transcription issue.`,
                );
              }
            });

            batchTranscriptionError = null; // Clear error on success
            break; // Success, exit retry loop
          } catch (error: any) {
            attempt++;
            batchTranscriptionError = error;
            if (error instanceof GeminiError && error.code === "RATE_LIMIT" && attempt <= RATE_LIMIT_MAX_RETRIES) {
              console.warn(
                `[grade-speaking] ⚠️ Rate limit hit for batch ${batchIndex + 1}, retrying (attempt ${attempt}/${RATE_LIMIT_MAX_RETRIES})...`,
              );
              await sleep(RATE_LIMIT_RETRY_DELAY_MS);
              continue;
            }
            // Không phải RATE_LIMIT hoặc đã hết retry → break để xử lý bên ngoài
            console.error(`[grade-speaking] ❌ Batch transcription failed for batch ${batchIndex + 1}:`, error);
            break;
          }
        }

        // Nếu batch fail sau khi retry hết → có thể là daily limit
        // Logic: Sau khi retry MAX_RETRIES lần mà vẫn 429 → coi như daily limit
        // (vì per-minute limit thường chỉ cần đợi vài giây là được)
        if (batchTranscriptionError) {
          const isDailyLimit = batchTranscriptionError instanceof GeminiError && 
                               batchTranscriptionError.code === "RATE_LIMIT" && 
                               attempt > RATE_LIMIT_MAX_RETRIES;
          
          if (isDailyLimit) {
            // Trả về partial result với transcript đã có + failed questionIds
            const partialTranscripts = transcribedAnswers
              .filter((a) => a.transcript && a.transcript.trim().length > 0)
              .map((a) => ({
                questionId: a.questionId,
                transcript: a.transcript!,
              }));
            
            const failedQuestionIds = batch.map((a) => a.questionId);
            
            console.log(`[grade-speaking] ⚠️ Daily quota exceeded. Returning partial transcripts for ${partialTranscripts.length} questions.`);
            console.log(`[grade-speaking] Failed questionIds: ${failedQuestionIds.join(", ")}`);

            return response.status(200).json({
              incomplete: true,
              code: "QUOTA_EXCEEDED",
              message: "Đã vượt quá giới hạn quota ngày của API key này. Vui lòng nhập API key khác để tiếp tục chấm các câu còn lại.",
              partialTranscripts,
              failedQuestionIds,
              completedQuestionIds: partialTranscripts.map((p) => p.questionId),
            });
          } else {
            // Lỗi khác (không phải daily limit) → throw để handler xử lý
            throw batchTranscriptionError;
          }
        }

        // Thêm transcript vào answers
        batch.forEach((answer) => {
          const transcript = transcriptMap[answer.questionId] || "";
          transcribedAnswers.push({
            ...answer,
            transcript,
          });
        });

        // Nếu là batch cuối → bắt đầu grade request ngay (song song, không đợi)
        if (isLastBatch) {
          console.log(`[grade-speaking] Starting grade request in parallel (all transcripts now available)...`);
          gradePromise = performGrading([...transcribedAnswers]).catch((error) => {
            // Lưu error để xử lý sau
            return { error };
          });
        }

        // Đợi giữa các batch để reset quota (trừ batch cuối)
        if (!isLastBatch) {
          console.log(`[grade-speaking] Waiting ${BATCH_DELAY_MS / 1000}s before next batch to reset quota...`);
          await sleep(BATCH_DELAY_MS);
        }
      }

      // Sau khi tất cả batch xong → đợi grade result (nếu có)
      if (gradePromise) {
        console.log(`[grade-speaking] Waiting for grade result...`);
        const gradeResult = await gradePromise;
        
        // Nếu grade fail do 429 → trả về partial result với transcripts đã có
        if (gradeResult?.error) {
          const error = gradeResult.error;
          if (error instanceof GeminiError && error.code === "RATE_LIMIT") {
            const partialTranscripts = transcribedAnswers
              .filter((a) => a.transcript && a.transcript.trim().length > 0)
              .map((a) => ({
                questionId: a.questionId,
                transcript: a.transcript!,
              }));
            
            console.log(`[grade-speaking] ⚠️ Daily quota exceeded during grading. All ${partialTranscripts.length} transcripts completed.`);
            
            return response.status(200).json({
              incomplete: true,
              code: "QUOTA_EXCEEDED",
              message: "Đã transcribe xong tất cả audio nhưng chưa chấm được do đã vượt quá giới hạn quota ngày. Vui lòng nhập API key khác để tiếp tục chấm điểm (không cần transcribe lại).",
              partialTranscripts,
              transcriptsCompleted: true, // Đánh dấu đã transcribe xong
              failedQuestionIds: [],
              completedQuestionIds: partialTranscripts.map((p) => p.questionId),
            });
          } else {
            // Lỗi khác → throw
            throw error;
          }
        }
        
        // Grade thành công → trả về kết quả
        return response.status(200).json(gradeResult);
      }
    }

    // Nếu không có câu cần transcribe (tất cả đã có transcript) → chỉ cần grade
    if (transcribedAnswers.length > 0) {
      console.log(`[grade-speaking] All transcripts already available, proceeding to grade...`);
      const gradeResult = await performGrading(transcribedAnswers);
      return response.status(200).json(gradeResult);
    }

    // Fallback: không nên đến đây (tất cả đã được xử lý ở trên)
    // Nếu đến đây → có lỗi logic, trả về error
    return response.status(500).json({
      error: "Internal error: No valid processing path executed",
      code: "INTERNAL_ERROR"
    });
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
