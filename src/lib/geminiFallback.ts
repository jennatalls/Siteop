import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';

/**
 * Triggers transcription & extraction using Vercel /api route if available,
 * or falls back to direct client-side Gemini AI if running on localhost / dev mode.
 */
export async function processAudioWithGemini(
  entryId: string,
  audioBase64: string,
  mimeType: string = 'audio/mp4',
  customApiKey?: string
): Promise<{ text?: string; extracted_data?: any }> {
  const cleanBase64 = audioBase64.includes(';base64,')
    ? audioBase64.split(';base64,')[1]
    : audioBase64;

  // 1. Try Vercel Serverless API Route first
  try {
    const apiRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: cleanBase64, mimeType, entryId })
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.text) {
        // Trigger extraction API
        fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcription: data.text, entryId })
        }).catch((e) => console.warn('Extract API call error:', e));

        return { text: data.text };
      }
    }
  } catch (err) {
    console.warn('Vercel /api/transcribe not available locally, switching to fallback:', err);
  }

  // 2. Client-side Fallback (for localhost or direct API key execution)
  const apiKey = customApiKey || import.meta.env.VITE_GEMINI_API_KEY || (process as any)?.env?.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('No GEMINI_API_KEY provided for client-side fallback. On Vercel, server-side API will handle this.');
    return {};
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Step A: Transcribe Audio
    const transResult = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: cleanBase64
        }
      },
      {
        text: `Bạn là trợ lý ghi nhận nhật ký công trình tiếng Việt. Hãy nghe đoạn âm thanh này và chuyển thành văn bản tiếng Việt chính xác.`
      }
    ]);

    const transcriptionText = transResult.response.text().trim();

    // Step B: Extract Construction Data
    const extractPrompt = `Bạn là chuyên gia xây dựng. Phân tích đoạn nhật ký sau và trích xuất JSON:
"${transcriptionText}"
JSON Schema:
{
  "category": "Ép cọc / Bê tông / Thợ nề / Xây tô / Điện nước / Vật tư / Khác",
  "materials": [{ "item": "Tên vật tư", "quantity": "Số lượng", "unit": "Đơn vị" }],
  "labor": [{ "role": "Vị trí thợ", "count": 1, "hours": "8h", "note": "Công việc" }],
  "confidence_score": 0.95
}`;

    const extractResult = await model.generateContent(extractPrompt);
    const extractRaw = extractResult.response.text();
    let extractedData = {
      category: 'Công trình',
      materials: [],
      labor: [],
      confidence_score: 0.9
    };

    try {
      const match = extractRaw.match(/\{[\s\S]*\}/);
      if (match) extractedData = JSON.parse(match[0]);
    } catch (e) {
      console.warn('Failed parsing extracted JSON:', e);
    }

    // Save transcription & extracted data directly to Supabase table
    await supabase
      .from('diary_entries')
      .update({
        transcription: transcriptionText,
        extracted_data: extractedData
      })
      .eq('id', entryId);

    return { text: transcriptionText, extracted_data: extractedData };
  } catch (err: any) {
    console.error('Direct Gemini processing error:', err);
    return {};
  }
}
