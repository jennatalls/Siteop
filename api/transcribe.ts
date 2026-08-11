import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY server environment variable not configured' });
  }

  try {
    const { audioBase64, mimeType = 'audio/mp4', entryId } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 input' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const cleanBase64 = audioBase64.includes(';base64,')
      ? audioBase64.split(';base64,')[1]
      : audioBase64;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64
        }
      },
      {
        text: `Bạn là trợ lý ảo ghi nhận nhật ký công trình xây dựng bằng tiếng Việt. 
Hãy nghe đoạn âm thanh này và chuyển thành văn bản (transcription) chính xác từng từ tiếng Việt. 
Nếu có từ ngữ kỹ thuật xây dựng (xi măng, thợ nề, bê tông, cốp pha, giàn giáo, gạch, dầm, đà,...), hãy ghi chính xác.
Trả về định dạng JSON thuần túy như sau:
{
  "text": "Nội dung văn bản ghi âm tiếng Việt đầy đủ...",
  "confidence_score": 0.95
}`
      }
    ]);

    const responseText = result.response.text();
    let parsedData = { text: responseText, confidence_score: 0.9 };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Fallback parsing response text for transcription');
    }

    // Optionally update entry directly in Supabase if entryId provided
    if (entryId && supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      await supabase
        .from('diary_entries')
        .update({
          transcription: parsedData.text
        })
        .eq('id', entryId);
    }

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('Transcribe API error:', error);
    return res.status(500).json({ error: error.message || 'Transcription failed' });
  }
}
