import Groq from "groq-sdk";
import { RecognitionMode } from '../types';

// Initialize Groq Client
// Note: Ensure VITE_GROQ_API_KEY is set in your Vercel Environment Variables
const groq = new Groq({ 
  apiKey: (import.meta as any).env.VITE_GROQ_API_KEY || '', 
  dangerouslyAllowBrowser: true 
});

const SYSTEM_INSTRUCTION_BASE = `
You are an expert AI accessibility assistant and translator.
Your goal is to facilitate communication for users with disabilities across ALL languages.

CORE PROTOCOLS:
1. GLOBAL LANGUAGE INPUT: The user may input text, speech, or gestures in ANY language.
2. AUTO-TRANSLATION: You MUST automatically detect the source language based on the user's input and their selected preference.
   - If the input is NOT English, translate it into clear, grammatical English first.
   - If the input IS English, keep it as is.
3. ASL CONVERSION: Convert the final English text into American Sign Language (ASL) Gloss.
   - Use uppercase for gloss (e.g., "HELLO FRIEND").
   - Remove articles (a, an, the) and "to be" verbs (is, are, am).
   - Use Subject-Object-Verb (SOV) or Topic-Comment structure.
   - For proper nouns, fingerprinting is implied, but output the word in gloss (e.g., "NAME-BOB").
`;

/**
 * Analyzes a video frame (image) for gesture recognition.
 */
export const analyzeGesture = async (
  base64Image: string,
  mode: RecognitionMode,
  language: string = "Auto"
): Promise<string> => {
  try {
    const isWordMode = mode === RecognitionMode.WORD;

    const prompt = isWordMode
      ? `
        Analyze this image for a hand sign or gesture.
        Context: The user has held this pose, intending to communicate a word.
        User's Language: "${language}".

        Instructions:
        1. Identify the specific hand sign (ASL, ISL, or general gesture).
        2. If it is a clear sign, translate it to a single English word.
        3. If the image is blurry, ambiguous, or just a person standing still without a clear sign, return "No gesture detected."
        4. Do not describe the person, only output the MEANING of the sign.
        `
      : `
        Analyze this image for body language or sign language sentences.
        Context: The user is performing a gesture sentence.
        User's Language: "${language}".

        Instructions:
        1. Translate the signs/gestures into a natural English sentence.
        2. If the user is just standing/sitting with no clear communicative gesture, return "No gesture detected."
        3. Be robust to lighting and background clutter. Focus on the hands and body pose.
        `;

    const response = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        {
          role: 'system',
          content: SYSTEM_INSTRUCTION_BASE
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ] as any
        }
      ],
      temperature: 0.2,
      max_tokens: isWordMode ? 15 : 60,
    });

    return response.choices[0]?.message?.content || "No gesture detected.";
  } catch (error) {
    console.error("Gesture analysis failed:", error);
    throw error;
  }
};

/**
 * Converts text or image text to ASL-friendly English (Gloss format estimation)
 */
export const processTextForAvatar = async (
  inputText: string,
  base64Image: string | null,
  mode: RecognitionMode,
  language: string = "Auto"
): Promise<{ original: string, gloss: string }> => {
  try {
    let messages: any[] = [
      { role: 'system', content: SYSTEM_INSTRUCTION_BASE }
    ];

    const taskDescription = `
      Task:
      1. Detect the source language of the input text (hint: user selected ${language}).
      2. Translate the input into natural, clear English.
      3. Convert that English into ASL Gloss keywords for an avatar.

      Output JSON format: { "english": "Translated English Text", "gloss": "ASL GLOSS TEXT" }
    `;

    if (base64Image) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: `Extract text from this image. The expected language is "${language}". ${taskDescription}` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ]
      });
    } else {
      messages.push({
        role: 'user',
        content: `Process this input text: "${inputText}". User specified language: "${language}". ${taskDescription}`
      });
    }

    const response = await groq.chat.completions.create({
      model: base64Image ? 'llama-3.2-11b-vision-preview' : 'llama3-8b-8192',
      messages: messages,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    const result = content ? JSON.parse(content) : {};
    
    return {
      original: result.english || "Processing error",
      gloss: result.gloss || ""
    };

  } catch (error) {
    console.error("Text processing failed:", error);
    throw error;
  }
};

/**
 * Processes audio input for speech recognition.
 */
export const processSpeech = async (
  audioBase64: string,
  mimeType: string,
  language: string = "Auto"
): Promise<{ text: string, gloss: string }> => {
  try {
    // 1. Convert Base64 to File for Whisper
    const byteCharacters = atob(audioBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], "audio.wav", { type: mimeType });

    // 2. Transcribe using Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: "whisper-large-v3-turbo",
      language: language === 'Auto' ? undefined : undefined,
      response_format: "json"
    });

    const transcribedText = transcription.text;

    // 3. Convert to Gloss using Llama
    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION_BASE },
        { 
          role: 'user', 
          content: `
            The user said: "${transcribedText}".
            Task:
            1. Translate to clear English if needed.
            2. Convert to ASL Gloss.
            
            Output JSON format: { "transcription": "English Translation", "gloss": "ASL GLOSS" }
          ` 
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    const result = content ? JSON.parse(content) : {};

    return {
      text: result.transcription || transcribedText,
      gloss: result.gloss || ""
    };
  } catch (error) {
    console.error("Speech processing failed:", error);
    throw error;
  }
};
