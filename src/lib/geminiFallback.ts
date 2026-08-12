import { supabase } from './supabase';

/**
 * Triggers transcription & extraction via the Vercel serverless /api routes ONLY.
 * This NEVER calls Gemini directly from the browser -- the Gemini API key must
 * stay server-side. If either serverless call fails, the failure is written back
 * to the entry (status = 'error') so it is visible in /diary and /digest instead
 * of silently disappearing.
 */
export async function processAudioWithGemini(
    entryId: string,
    audioBase64: string,
    rawMimeType: string = 'audio/mp4'
  ): Promise<{ text?: string; extracted_data?: any; error?: string }> {
    const mimeType = (rawMimeType || 'audio/mp4').split(';')[0].trim();

  const cleanBase64 = audioBase64.includes(';base64,')
      ? audioBase64.split(';base64,')[1]
        : audioBase64;

  try {
        const transcribeRes = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64: cleanBase64, mimeType, entryId })
        });

      if (!transcribeRes.ok) {
              const errBody = await transcribeRes.text().catch(() => '');
              throw new Error(`/api/transcribe returned ${transcribeRes.status}: ${errBody}`);
      }

      const transcribeData = await transcribeRes.json();
        const transcriptionText = transcribeData.text;

      if (!transcriptionText) {
              throw new Error('/api/transcribe returned no text');
      }

      const extractRes = await fetch('/api/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcription: transcriptionText, entryId })
      });

      if (!extractRes.ok) {
              const errBody = await extractRes.text().catch(() => '');
              throw new Error(`/api/extract returned ${extractRes.status}: ${errBody}`);
      }

      const extractedData = await extractRes.json();

      return { text: transcriptionText, extracted_data: extractedData };
  } catch (err: any) {
        console.error('processAudioWithGemini failed:', err);

      // Surface the failure on the entry itself instead of leaving it silently blank.
      await supabase
          .from('diary_entries')
          .update({ status: 'error' })
          .eq('id', entryId);

      return { error: err.message || 'Unknown error calling /api/transcribe or /api/extract' };
  }
}
