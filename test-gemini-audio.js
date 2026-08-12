import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZmRueGd4Ynh4YnlvZm1leXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzU4NzcsImV4cCI6MjEwMjAxMTg3N30.7lxF0p8thwogFvfya2eMxWMBBmIUQvt9HofjdpEKSIo';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testGeminiAudio() {
  const { data } = await supabase.from('diary_entries').select('*').eq('id', '12e1df35-59fa-44dc-ac2b-cfb3820729d4').single();
  
  if (!data || !data.voice_url) {
    console.error('No voice_url found');
    return;
  }

  const voiceDataUrl = data.voice_url;
  const parts = voiceDataUrl.split(';base64,');
  const mimeType = parts[0].replace('data:', '').split(';')[0]; // e.g. 'audio/mp4'
  const rawBase64 = parts[1];

  console.log(`MIME type: ${mimeType}, base64 length: ${rawBase64.length}`);

  // Test calling Gemini API if GEMINI_API_KEY environment variable is provided or passed
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set in shell.');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    console.log('Sending audio to Gemini 1.5 Flash...');
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: rawBase64
        }
      },
      {
        text: `Bạn là trợ lý ảo ghi nhận nhật ký công trình tiếng Việt. Hãy nghe đoạn âm thanh này và chuyển thành văn bản tiếng Việt chính xác.`
      }
    ]);

    const transcriptText = result.response.text().trim();
    console.log('--- GEMINI TRANSCRIPTION SUCCESS ---');
    console.log(transcriptText);

    // Update Supabase
    const { error: updateErr } = await supabase
      .from('diary_entries')
      .update({ transcription: transcriptText })
      .eq('id', '12e1df35-59fa-44dc-ac2b-cfb3820729d4');

    if (updateErr) {
      console.error('Failed to update Supabase:', updateErr);
    } else {
      console.log('Successfully updated Supabase diary_entries.transcription!');
    }
  } catch (err) {
    console.error('Gemini API Error:', err);
  }
}

testGeminiAudio();
