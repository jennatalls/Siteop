import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { checkTriggerWords } from './vietnamese';

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
    console.warn('Vercel /api/transcribe not available locally, switching to client fallback:', err);
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
        text: `Bạn là trợ lý ảo ghi nhận nhật ký công trình bằng tiếng Việt. Hãy nghe đoạn âm thanh này và chuyển thành văn bản tiếng Việt chính xác. Không thêm nhận xét.`
      }
    ]);

    let transcriptionText = transResult.response.text().trim();
    transcriptionText = transcriptionText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    // Step B: Extract Construction Data (Part 2 fields included)
    const extractPrompt = `Bạn là chuyên gia xây dựng. Phân tích đoạn nhật ký sau và trích xuất JSON:
"${transcriptionText}"
JSON Schema:
{
  "category": "Ép cọc / Bê tông / Thợ nề / Xây tô / Điện nước / Vật tư / Khác",
  "materials": [{ "item": "Tên vật tư", "quantity": "Số lượng", "unit": "Đơn vị" }],
  "labor": [{ "role": "Vị trí thợ", "count": 1, "hours": "8h", "note": "Công việc" }],
  "confidence_score": 0.95,
  "summary_bullet": "Tóm tắt 1 câu ngắn gọn về nhật ký",
  "is_flagged": false
}`;

    const extractResult = await model.generateContent(extractPrompt);
    const extractRaw = extractResult.response.text();
    let extractedData = {
      category: 'Công trình',
      materials: [],
      labor: [],
      confidence_score: 0.9,
      summary_bullet: transcriptionText.substring(0, 80),
      is_flagged: false
    };

    try {
      const match = extractRaw.match(/\{[\s\S]*\}/);
      if (match) extractedData = JSON.parse(match[0]);
    } catch (e) {
      console.warn('Failed parsing extracted JSON:', e);
    }

    // Deterministic trigger word regex check (Part 2)
    const triggerCheck = checkTriggerWords(transcriptionText);
    let finalIsFlagged = false;
    let finalFlagReason: string | null = null;

    if (triggerCheck.isFlagged) {
      finalIsFlagged = true;
      finalFlagReason = triggerCheck.matchedReason;
    } else if (extractedData.is_flagged) {
      finalIsFlagged = true;
      finalFlagReason = 'gemini_judgment';
    }

    // Save transcription & extracted data to diary_entries
    await supabase
      .from('diary_entries')
      .update({
        transcription: transcriptionText,
        extracted_data: extractedData
      })
      .eq('id', entryId);

    // Save row to entry_flags table (Part 2)
    const summaryBulletText = extractedData.summary_bullet || transcriptionText.substring(0, 100);

    await supabase.from('entry_flags').insert({
      entry_id: entryId,
      summary_bullet: summaryBulletText,
      is_flagged: finalIsFlagged,
      flag_reason: finalFlagReason
    });

    return { text: transcriptionText, extracted_data: extractedData };
  } catch (err: any) {
    console.error('Direct Gemini processing error:', err);
    return {};
  }
}
