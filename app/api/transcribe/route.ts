import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioBase64, mimeType = "audio/webm", apiKey } = body;

    if (!audioBase64) {
      return NextResponse.json(
        { error: "audioBase64 is required" },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is required. Please connect your API key in the header." },
        { status: 400 }
      );
    }

    const transcript = await transcribeAudio(audioBase64, mimeType, apiKey);

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
