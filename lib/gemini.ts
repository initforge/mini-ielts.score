import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm"): Promise<string> {
  try {
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

export async function generateContent(prompt: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating content:", error);
    throw new Error("Failed to generate content");
  }
}
