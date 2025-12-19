import { GoogleGenerativeAI } from "@google/generative-ai";

// Danh sách model ưu tiên (có fallback theo thứ tự)
// Ưu tiên model mới nhất: 3.0 → 2.5 → 2.0 → 1.5 → 1.0
const DEFAULT_TEXT_MODEL_CHAIN = "gemini-3.0-pro,gemini-2.5-flash,gemini-2.0-flash-exp,gemini-1.5-flash,gemini-1.5-pro,gemini-1.5-flash-8b,gemini-1.0-pro";

function buildModelChain(envChain?: string | null, envSingle?: string | null, fallbackChain: string = DEFAULT_TEXT_MODEL_CHAIN): string[] {
  const parts: string[] = [];
  if (envChain && envChain.trim().length > 0) {
    parts.push(...envChain.split(","));
  }
  if (envSingle && envSingle.trim().length > 0) {
    parts.push(envSingle);
  }
  // Luôn nối thêm fallback chain mặc định
  parts.push(...fallbackChain.split(","));

  // Chuẩn hóa & loại bỏ trùng lặp
  const seen = new Set<string>();
  return parts
    .map((m) => m.trim())
    .filter((m) => {
      if (!m) return false;
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });
}

const TEXT_MODEL_CANDIDATES: string[] = buildModelChain(
  process.env.GEMINI_MODEL_CHAIN,
  process.env.GEMINI_MODEL,
  DEFAULT_TEXT_MODEL_CHAIN
);

const AUDIO_MODEL_CANDIDATES: string[] = buildModelChain(
  process.env.GEMINI_TRANSCRIBE_MODEL_CHAIN,
  process.env.GEMINI_TRANSCRIBE_MODEL,
  TEXT_MODEL_CANDIDATES.join(",")
);

// Model mặc định (dùng cho message/error, thực tế sẽ thử theo list trên)
const DEFAULT_MODEL = TEXT_MODEL_CANDIDATES[0] || "gemini-1.5-flash";
const DEFAULT_TRANSCRIBE_MODEL =
  AUDIO_MODEL_CANDIDATES[0] || DEFAULT_MODEL;

// Lazy initialization - only check API key when functions are called
function getGenAI(apiKey?: string) {
  // Try provided API key first, then environment variable
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Please connect your Gemini API key in the header.");
  }
  return new GoogleGenerativeAI(key);
}

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm", apiKey?: string): Promise<string> {
  try {
    const genAI = getGenAI(apiKey);

    // Log audio quality metrics
    const audioSizeKB = Math.round(audioBase64.length * 3 / 4 / 1024); // Approximate size (base64 is ~33% larger)
    console.log(`[Gemini] Transcribing audio: size=${audioSizeKB}KB, mimeType=${mimeType}`);

    // Normalize mimeType - remove codec info if present (Gemini may not support it)
    let normalizedMimeType = mimeType;
    if (mimeType.includes(';codecs=')) {
      normalizedMimeType = mimeType.split(';')[0];
      console.log(`[Gemini] Normalized mimeType from ${mimeType} to ${normalizedMimeType}`);
    }

    let lastError: any = null;

    for (const modelName of AUDIO_MODEL_CANDIDATES) {
      try {
        console.log("[Gemini] Transcribe trying model:", modelName);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          {
            inlineData: {
              data: audioBase64,
              mimeType: normalizedMimeType,
            },
          },
          {
            text: "Transcribe this audio recording. Return only the transcript text without any additional commentary.",
          },
        ]);
        const response = await result.response;
        let transcript = response.text().trim();
        const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
        console.log(`[Gemini] ✅ Transcription successful with model: ${modelName}`);
        console.log(`[Gemini] Transcript: "${transcript}" (${transcript.length} chars, ${wordCount} words)`);
        
        // Detect silence-only transcripts
        const silencePatterns = [
          /^\[silence\]/i,
          /^\[background.*sounds?\]/i,
          /^silence/i,
          /^no speech/i,
          /^no audio/i,
          /^background noise/i,
        ];
        
        const isSilenceOnly = silencePatterns.some(pattern => pattern.test(transcript)) && wordCount < 10;
        
        // Validate transcript quality: nếu quá ngắn (chỉ có fillers như "Hmm", "Um") thì có thể transcription failed
        // Audio 8 giây nói tiếng Anh bình thường sẽ có ít nhất 10-15 từ
        const minExpectedWords = Math.max(5, Math.floor(audioSizeKB * 1.5)); // Adjusted: ~1.5 words per KB (more realistic)
        if (wordCount < minExpectedWords && audioSizeKB > 10) {
          console.warn(`[Gemini] ⚠️ WARNING: Transcript seems too short: ${wordCount} words for ${audioSizeKB}KB audio. Expected at least ${minExpectedWords} words.`);
          console.warn(`[Gemini] ⚠️ This might indicate transcription quality issues. Audio may be corrupted or format not well supported.`);
        }
        
        // Nếu transcript chỉ có silence/background noise → có vấn đề nghiêm trọng
        if (isSilenceOnly && audioSizeKB > 20) {
          console.error(`[Gemini] ❌ ERROR: Transcript indicates silence/background noise only ("${transcript}") but audio is ${audioSizeKB}KB.`);
          console.error(`[Gemini] ❌ Possible causes: 1) Audio format (${normalizedMimeType}) not well supported, 2) Audio corrupted during encoding, 3) Microphone not capturing speech properly.`);
          // Không throw error, nhưng log để debug
        }
        
        // Nếu transcript chỉ có fillers (Hmm, Um, Uh, Er) và audio > 5KB → có thể có vấn đề
        const fillerOnlyPattern = /^(Hmm|Um|Uh|Er|Ah|Oh)[\s.,!?]*$/i;
        if (fillerOnlyPattern.test(transcript) && audioSizeKB > 5) {
          console.error(`[Gemini] ❌ ERROR: Transcript contains only fillers ("${transcript}") but audio is ${audioSizeKB}KB. Transcription likely failed or audio corrupted.`);
        }
        
        return transcript;
      } catch (err: any) {
        lastError = err;
        console.error("[Gemini] ❌ Transcription model failed:", modelName, "status:", err?.status, "message:", err?.message);
        // 404 → model không tồn tại / không hỗ trợ → thử model tiếp theo
        // 503 → model overloaded → thử model tiếp theo
        if (err?.status === 404 || err?.status === 503) {
          continue;
        }
        // Lỗi khác → ném luôn
        throw err;
      }
    }

    // Nếu tất cả model đều 404
    if (lastError && lastError.status === 404) {
      throw new GeminiError(
        "Không tìm được model Gemini khả dụng để transcribe audio. Vui lòng kiểm tra lại API key hoặc enable thêm model trong Google AI Studio.",
        "MODEL_NOT_FOUND",
        404
      );
    }

    throw new Error("Failed to transcribe audio");
  } catch (error: any) {
    console.error("Error transcribing audio:", error);

    if (error instanceof GeminiError) {
      throw error;
    }

    if (error?.status === 404) {
      throw new GeminiError(
        "Model không khả dụng để transcribe audio. Vui lòng đổi sang model khác hoặc kiểm tra API key.",
        "MODEL_NOT_FOUND",
        404
      );
    }

    throw new GeminiError(
      "Lỗi khi transcribe audio bằng Gemini. Vui lòng thử lại sau.",
      "UNKNOWN",
      500
    );
  }
}

/**
 * Custom error class for Gemini API errors
 */
export class GeminiError extends Error {
  code: string;
  status: number;
  
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Generate content - simple version without caching (caching requires enterprise tier)
 */
export async function generateContent(
  prompt: string,
  apiKey?: string,
  rubricText?: string
): Promise<string> {
  try {
    const genAI = getGenAI(apiKey);

    // Combine rubric with prompt if provided
    const fullPrompt = rubricText ? `${rubricText}\n\n${prompt}` : prompt;

    let lastError: any = null;

    for (const modelName of TEXT_MODEL_CANDIDATES) {
      try {
        console.log("[Gemini] generateContent trying model:", modelName);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        console.log("[Gemini] ✅ generateContent success with model:", modelName);
        return response.text();
      } catch (err: any) {
        lastError = err;
        console.error("[Gemini] ❌ generateContent model failed:", modelName, "status:", err?.status, "message:", err?.message);
        // 404 → model không tồn tại / không hỗ trợ → thử model tiếp theo
        // 503 → model overloaded → thử model tiếp theo
        if (err?.status === 404 || err?.status === 503) {
          continue;
        }
        // Lỗi khác → ném luôn
        throw err;
      }
    }

    if (lastError && lastError.status === 404) {
      throw new GeminiError(
        "Không tìm được model Gemini khả dụng. Vui lòng kiểm tra lại API key hoặc enable model trong Google AI Studio.",
        "MODEL_NOT_FOUND",
        404
      );
    }

    throw new GeminiError(
      "Lỗi không xác định khi gọi Gemini API.",
      "UNKNOWN",
      500
    );
  } catch (error: any) {
    console.error("Error generating content:", error);
    
    // Parse Gemini API error details
    if (error?.status === 400 && error?.errorDetails) {
      const errorInfo = error.errorDetails.find((e: any) => e['@type']?.includes('ErrorInfo'));
      if (errorInfo?.reason === 'API_KEY_INVALID') {
        throw new GeminiError(
          'API key không hợp lệ. Vui lòng kiểm tra lại API key của bạn.',
          'API_KEY_INVALID',
          400
        );
      }
    }
    
    if (error?.status === 429) {
      throw new GeminiError(
        'Đã vượt quá giới hạn request. Vui lòng thử lại sau hoặc sử dụng API key khác.',
        'RATE_LIMIT',
        429
      );
    }
    
    if (error?.status === 404) {
      throw new GeminiError(
        'Model không khả dụng. Vui lòng đổi sang model khác (ví dụ: gemini-1.5-flash) hoặc kiểm tra API key.',
        'MODEL_NOT_FOUND',
        404
      );
    }
    
    if (error?.status === 403) {
      throw new GeminiError(
        'API key không có quyền truy cập. Vui lòng kiểm tra quyền của API key.',
        'PERMISSION_DENIED',
        403
      );
    }
    
    throw new GeminiError(
      'Lỗi khi gọi Gemini API. Vui lòng thử lại sau.',
      'UNKNOWN',
      500
    );
  }
}

/**
 * Generate content với media (image/audio) kèm theo.
 * contentsMedia: mảng inlineData (ảnh, audio, ...) sẽ được đặt TRƯỚC phần text prompt.
 */
export async function generateContentWithMedia(
  contentsMedia: Array<{ inlineData: { data: string; mimeType: string } }>,
  prompt: string,
  apiKey?: string,
  rubricText?: string
): Promise<string> {
  try {
    const genAI = getGenAI(apiKey);
    const fullPrompt = rubricText ? `${rubricText}\n\n${prompt}` : prompt;

    const baseParts = contentsMedia || [];
    let lastError: any = null;

    for (const modelName of TEXT_MODEL_CANDIDATES) {
      try {
        console.log("[Gemini] generateContentWithMedia trying model:", modelName);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          ...baseParts,
          { text: fullPrompt },
        ]);
        const response = await result.response;
        console.log("[Gemini] ✅ generateContentWithMedia success with model:", modelName);
        return response.text();
      } catch (err: any) {
        lastError = err;
        console.error(
          "[Gemini] ❌ generateContentWithMedia model failed:",
          modelName,
          "status:", err?.status,
          "message:", err?.message
        );
        // 404 → model không tồn tại / không hỗ trợ → thử model tiếp theo
        // 503 → model overloaded → thử model tiếp theo
        if (err?.status === 404 || err?.status === 503) {
          continue;
        }
        throw err;
      }
    }

    if (lastError && lastError.status === 404) {
      throw new GeminiError(
        "Không tìm được model Gemini khả dụng cho media. Vui lòng kiểm tra lại API key hoặc enable model trong Google AI Studio.",
        "MODEL_NOT_FOUND",
        404
      );
    }

    throw new GeminiError(
      "Lỗi không xác định khi gọi Gemini API với media.",
      "UNKNOWN",
      500
    );
  } catch (error: any) {
    console.error("Error generating content with media:", error);

    if (error instanceof GeminiError) {
      throw error;
    }

    if (error?.status === 429) {
      throw new GeminiError(
        "Đã vượt quá giới hạn request. Vui lòng thử lại sau hoặc sử dụng API key khác.",
        "RATE_LIMIT",
        429
      );
    }

    if (error?.status === 404) {
      throw new GeminiError(
        "Model không khả dụng. Vui lòng đổi sang model khác (ví dụ: gemini-2.5-flash) hoặc kiểm tra API key.",
        "MODEL_NOT_FOUND",
        404
      );
    }

    if (error?.status === 403) {
      throw new GeminiError(
        "API key không có quyền truy cập. Vui lòng kiểm tra quyền của API key.",
        "PERMISSION_DENIED",
        403
      );
    }

    throw new GeminiError(
      "Lỗi khi gọi Gemini API với media. Vui lòng thử lại sau.",
      "UNKNOWN",
      500
    );
  }
}
