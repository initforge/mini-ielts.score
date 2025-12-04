import { GoogleGenerativeAI } from "@google/generative-ai";

// Lazy initialization - only check API key when functions are called
function getGenAI(apiKey?: string) {
  // Try provided API key first, then environment variable
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Please connect your Gemini API key in the header.");
}
  return new GoogleGenerativeAI(key);
}

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm"): Promise<string> {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, "base64");
    
    // Use Gemini's audio transcription capability
    const result = await model.generateContent([
      {
        inlineData: {
          data: audioBuffer.toString("base64"),
          mimeType: mimeType,
        },
      },
      {
        text: "Transcribe this audio recording. Return only the transcript text without any additional commentary.",
      },
    ]);
    
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw new Error("Failed to transcribe audio");
  }
}

export async function generateContent(prompt: string, apiKey?: string): Promise<string> {
  try {
    const genAI = getGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating content:", error);
    throw new Error("Failed to generate content");
  }
}
