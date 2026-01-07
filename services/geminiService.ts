import Groq from "groq-sdk";
import { RecognitionMode } from "../types";

/* ============================================================================
   GROQ CLIENT
============================================================================ */
const groq = new Groq({
  apiKey: (import.meta as any).env.VITE_GROQ_API_KEY || "",
  dangerouslyAllowBrowser: true,
});

/* ============================================================================
   SYSTEM INSTRUCTION
============================================================================ */
const SYSTEM_INSTRUCTION_BASE = `
You are an AI accessibility assistant.

Rules:
- Detect input language automatically.
- Translate to clear English if required.
- Convert English to ASL Gloss.
- Gloss must be UPPERCASE.
- Remove articles and "to be" verbs.
- Return ONLY what is asked. No explanations.
- Do NOT provide synonyms. Use the exact Gloss word.
`;

/* ============================================================================
   SAFE JSON PARSER (NO CRASH GUARANTEE)
============================================================================ */
function safeParseJSON(content?: string): any {
  if (!content) return {};
  try {
    // Attempt to find JSON object within text (handles markdown code blocks and chatter)
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(content.substring(firstBrace, lastBrace + 1));
    }
    return JSON.parse(content);
  } catch (e) {
    console.error("JSON parse failed. Raw:", content);
    return {};
  }
}

/* ============================================================================
   GESTURE (IMAGE → ENGLISH)
============================================================================ */
export const analyzeGesture = async (
  base64Image: string,
  mode: RecognitionMode = RecognitionMode.SENTENCE,
  language: string = "Auto"
): Promise<string> => {
  try {
    const isWordMode =
      mode === RecognitionMode.WORD || (mode as any) === "WORD";

    const prompt = isWordMode
      ? `
Identify the hand and body sign.
Return ONLY one English word.
If unclear, return "No gesture detected".
`
      : `
Identify the sign language sentence.
Return a clear English sentence.
If unclear, return "No gesture detected".
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.2-11b-vision-preview",
      temperature: 0.2,
      max_tokens: isWordMode ? 15 : 60,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION_BASE },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ] as any,
        },
      ],
    });

    return response.choices[0]?.message?.content || "No gesture detected";
  } catch (err) {
    console.error("Gesture failed:", err);
    return "No gesture detected";
  }
};

/* ============================================================================
   TEXT / IMAGE → ASL GLOSS
============================================================================ */
export const processTextForAvatar = async (
  inputText: string,
  base64Image: string | null,
  mode: RecognitionMode = RecognitionMode.SENTENCE,
  language: string = "Auto"
): Promise<{ original: string; gloss: string }> => {
  try {
    if (!base64Image) {
      return {
        original: inputText || "",
        gloss: (inputText || "").toUpperCase(),
      };
    }

    const isWordMode =
      mode === RecognitionMode.WORD || (mode as any) === "WORD";

    const task = `
Task:
1. Identify the input language (User hint: ${language}).
2. Translate the input to clear English ${isWordMode ? "(Single Word)" : "(Sentence)"}.
3. Convert the English translation to ASL Gloss (UPPERCASE).
   - STRICT: Do not output synonyms. Input "Please" -> Gloss "PLEASE".
   ${isWordMode ? "- STRICT: Output exactly one word for gloss." : ""}

Output JSON Schema:
{
  "english": "string",
  "gloss": "string"
}

Ensure the keys are exactly "english" and "gloss".
`;

    const messages: any[] = [{ role: "system", content: SYSTEM_INSTRUCTION_BASE }];

    if (base64Image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: task },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Input: "${inputText}". ${task}`,
      });
    }

    const response = await groq.chat.completions.create({
      model: base64Image
        ? "llama-3.2-11b-vision-preview"
        : "llama-3.1-8b-instant", // ✅ ACTIVE MODEL
      messages,
      response_format: { type: "json_object" },
    });

    const result = safeParseJSON(response.choices[0]?.message?.content);

    return {
      original: result.english || inputText || "",
      gloss: result.gloss || "",
    };
  } catch (err) {
    console.error("Text processing failed:", err);
    return { original: "", gloss: "" };
  }
};

// Language Code Mapping for Whisper (Name -> ISO-639-1)
const WHISPER_LANG_CODES: Record<string, string> = {
  "English": "en",
  "Hindi": "hi",
  "Bengali": "bn",
  "Tamil": "ta",
  "Telugu": "te",
  "Marathi": "mr",
  "Gujarati": "gu",
  "Kannada": "kn",
  "Malayalam": "ml",
  "Punjabi": "pa",
  "Urdu": "ur",
  "Spanish": "es",
  "French": "fr",
  "Mandarin": "zh",
  "Arabic": "ar",
  "German": "de",
  "Japanese": "ja"
};

/* ============================================================================
   SPEECH → ASL GLOSS
============================================================================ */
export const processSpeech = async (
  audioBase64: string,
  mimeType: string,
  language: string = "Auto"
): Promise<{ text: string; gloss: string }> => {
  try {
    // 1. Clean Base64 (Remove data URL prefix if present)
    const base64Data = audioBase64.includes("base64,") 
      ? audioBase64.split("base64,")[1] 
      : audioBase64;

    // Base64 → File
    const chars = atob(base64Data.trim());
    const bytes = new Uint8Array(chars.length);
    for (let i = 0; i < chars.length; i++) {
      bytes[i] = chars.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });
    
    // Fix: Ensure correct file extension for Whisper based on MIME type
    let ext = "wav";
    if (mimeType.includes("webm")) ext = "webm";
    else if (mimeType.includes("mp4")) ext = "mp4";
    else if (mimeType.includes("ogg")) ext = "ogg";
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    // 2. Map Language Name to ISO Code for Whisper
    const isoLang = WHISPER_LANG_CODES[language] || undefined;

    // Whisper STT
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo", // Use non-turbo for better accuracy
      response_format: "json",
      language: isoLang, // Explicit language improves accuracy
      temperature: 0.0, // Deterministic output
      prompt: language !== "Auto" ? `The audio is in ${language}.` : "Clear speech."
    });

    const spokenText = transcription.text || "";

    if (!spokenText.trim()) {
      return { text: "", gloss: "" };
    }

    // Convert to Gloss
    const task = `
Task:
1. Translate the input audio to clear English (if not already).
2. Convert the English translation to ASL Gloss (UPPERCASE).
   - STRICT: Do not output synonyms. Input "Please" -> Gloss "PLEASE".

Output JSON Schema:
{
  "transcription": "string",
  "gloss": "string"
}

Ensure the keys are exactly "transcription" and "gloss".
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // ✅ ACTIVE MODEL
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION_BASE },
        {
          role: "user",
          content: `Input: "${spokenText}". ${task}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = safeParseJSON(response.choices[0]?.message?.content);
    
    // Fallback: If gloss is missing, use the spoken text (Uppercased)
    // This ensures the Avatar always triggers if speech was detected.
    const finalText = result.transcription || spokenText;
    let finalGloss = result.gloss;

    if (!finalGloss && finalText) {
      finalGloss = finalText.toUpperCase().replace(/[.,?]/g, "");
    }

    return {
      text: finalText,
      gloss: finalGloss || "",
    };
  } catch (err) {
    console.error("Speech failed:", err);
    return { text: "", gloss: "" };
  }
};
