import { NextRequest, NextResponse } from "next/server";
import { generateContent, transcribeAudio } from "@/lib/gemini";
import { SpeakingAnswer } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { answers, apiKey }: { answers: SpeakingAnswer[]; apiKey?: string } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is required. Please connect your API key in the header." },
        { status: 400 }
      );
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { error: "answers array is required" },
        { status: 400 }
      );
    }

    // Transcribe all audio recordings
    const transcribedAnswers = await Promise.all(
      answers.map(async (answer) => {
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

    // Construct comprehensive prompt
    const prompt = `You are an expert TOEIC Speaking evaluator. Evaluate the following speaking responses according to the official TOEIC Speaking rubrics.

TOEIC Speaking Rubrics (0-200 scale):
1. Pronunciation (0-200): Clarity, accuracy, and naturalness of pronunciation
2. Intonation (0-200): Appropriate stress, rhythm, and intonation patterns
3. Grammar (0-200): Correct use of grammatical structures
4. Vocabulary (0-200): Range and accuracy of vocabulary used
5. Content (0-200): Relevance and completeness of the response
6. Fluency (0-200): Smoothness and natural flow of speech

For each response, provide:
- Overall score (0-200)
- Individual scores for each criterion (0-200)
- Brief explanation for each criterion (2-3 sentences)
- List of strengths (3-5 items)
- List of weaknesses (3-5 items)
- Improvement tips (3-5 actionable suggestions)
- Per-question feedback with transcript

Student Responses:
${transcribedAnswers.map((answer, index) => `
Question ${index + 1} (Part ${answer.questionType}):
Question: ${answer.questionText}
Transcript: ${answer.transcript || "No transcript available"}
`).join("\n")}

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-200>,
  "criteria": {
    "pronunciation": {
      "name": "Pronunciation",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "intonation": {
      "name": "Intonation",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "grammar": {
      "name": "Grammar",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "vocabulary": {
      "name": "Vocabulary",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "content": {
      "name": "Content",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    },
    "fluency": {
      "name": "Fluency",
      "score": <number 0-200>,
      "maxScore": 200,
      "explanation": "<2-3 sentence explanation>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "improvementTips": ["<tip 1>", "<tip 2>", ...],
  "perQuestionFeedback": [
    {
      "questionId": "<question id>",
      "transcript": "<transcript text>",
      "feedback": "<detailed feedback>",
      "score": <number 0-200>
    },
    ...
  ]
}

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
      { error: "Failed to grade speaking responses" },
      { status: 500 }
    );
  }
}
