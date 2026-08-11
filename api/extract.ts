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
    const { transcription, entryId } = req.body || {};

    if (!transcription) {
      return res.status(400).json({ error: 'Missing transcription input' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Bạn là chuyên gia quản lý công trình xây dựng tại Việt Nam.
Hãy phân tích đoạn ghi chép nhật ký công trình sau đây và trích xuất dữ liệu cấu trúc bằng tiếng Việt:

VĂN BẢN:
"${transcription}"

YÊU CẦU TRẢ VỀ JSON THUẦN TÚY (không kèm markdown format khác) THEO SCHEMA:
{
  "category": "Tên hạng mục chính (ví dụ: Ép cọc / Bê tông / Thợ nề / Xây tô / Điện nước / Vật tư nhập / Nhân công / Khác)",
  "materials": [
    { "item": "Tên vật tư", "quantity": "Số lượng", "unit": "Đơn vị tính", "note": "Ghi chú" }
  ],
  "labor": [
    { "role": "Vị trí / Nhóm thợ", "count": 4, "hours": "Thời gian", "note": "Nội dung công việc" }
  ],
  "confidence_score": 0.92,
  "summary_vi": "Tóm tắt ngắn gọn 1 câu về tiến độ nhật ký"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    let extractedData = {
      category: 'Khác',
      materials: [],
      labor: [],
      confidence_score: 0.85,
      summary_vi: transcription.substring(0, 100)
    };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Fallback parsing response text for extraction:', e);
    }

    if (entryId && supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      await supabase
        .from('diary_entries')
        .update({
          extracted_data: extractedData
        })
        .eq('id', entryId);
    }

    return res.status(200).json(extractedData);
  } catch (error: any) {
    console.error('Extract API error:', error);
    return res.status(500).json({ error: error.message || 'Extraction failed' });
  }
}
