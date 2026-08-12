import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Pause, Camera, Trash2, Send, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { addToOfflineQueue, blobToBase64, uploadMediaToSupabase } from '../lib/offlineStore';
import { processAudioWithGemini } from '../lib/geminiFallback';
import { Toast } from '../components/Toast';

interface CaptureRouteProps {
  isOnline: boolean;
  onEntrySaved: () => void;
}

export const CaptureRoute: React.FC<CaptureRouteProps> = ({ isOnline, onEntrySaved }) => {
  // Voice Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Photo state
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Status & Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Start Voice Recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = 'audio/aac';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(finalBlob);
        const url = URL.createObjectURL(finalBlob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      setToast({
        message: 'Vui lòng cấp quyền truy cập Micro trên Safari/Chrome.',
        type: 'error',
        open: true
      });
    }
  };

  // Stop Recording (No auto-save)
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // 2. Handle Photo Select (No auto-save)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const clearPhoto = () => {
    setPhotoBlob(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePlayAudio = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  // 3. Manual Submit Entry (Saves voice + optional photo together in Step 3)
  const handleSubmit = async () => {
    if (!audioBlob && !photoBlob) {
      setToast({
        message: 'Vui lòng thu âm giọng nói hoặc chọn 1 bức ảnh trước khi lưu!',
        type: 'info',
        open: true
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const voiceBase64 = audioBlob ? await blobToBase64(audioBlob) : undefined;
      const photoBase64 = photoBlob ? await blobToBase64(photoBlob) : undefined;

      if (!isOnline) {
        addToOfflineQueue({
          voiceBlobBase64: voiceBase64,
          photoBlobBase64: photoBase64,
          audioMimeType: audioBlob?.type,
          photoMimeType: photoBlob?.type
        });

        setToast({
          message: 'Đã lưu offline vào thiết bị (sẽ tự đồng bộ khi có mạng)',
          type: 'success',
          open: true
        });
      } else {
        let voiceUrl: string | null = null;
        let photoUrl: string | null = null;

        if (audioBlob) {
          voiceUrl = await uploadMediaToSupabase(audioBlob, 'voice-memos', `voice_${Date.now()}.mp4`);
        }

        if (photoBlob) {
          photoUrl = await uploadMediaToSupabase(photoBlob, 'photos', `photo_${Date.now()}.jpg`);
        }

        const { data: userData } = await supabase.auth.getUser();

        const { data: newEntry, error } = await supabase
          .from('diary_entries')
          .insert({
            created_by: userData?.user?.id || null,
            voice_url: voiceUrl,
            photo_url: photoUrl,
            status: 'draft',
            submitted_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.warn('Supabase insert warning, saving offline:', error);
          addToOfflineQueue({
            voiceBlobBase64: voiceBase64,
            photoBlobBase64: photoBase64,
            audioMimeType: audioBlob?.type,
            photoMimeType: photoBlob?.type
          });
          setToast({
            message: 'Đã lưu offline thành công',
            type: 'info',
            open: true
          });
        } else {
          setToast({
            message: 'Saved! Đã lưu nhật ký thành công.',
            type: 'success',
            open: true
          });

          // Trigger AI transcription & extraction
          if (newEntry && voiceBase64) {
            processAudioWithGemini(newEntry.id, voiceBase64, audioBlob?.type);
          }
        }
      }

      // Reset Form for next entry
      clearAudio();
      clearPhoto();
      onEntrySaved();
    } catch (err: any) {
      console.error('Submit error:', err);
      setToast({
        message: 'Lỗi khi lưu: ' + (err.message || 'Thử lại'),
        type: 'error',
        open: true
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Screen Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Ghi Nhận Nhật Ký Ngày</h2>
        <p className="text-xs text-slate-400">Thực hiện theo 3 bước bên dưới trong 1 thẻ duy nhất</p>
      </div>

      {/* ONE SINGLE UNIFIED CARD CONTAINER FOR ALL 3 STEPS */}
      <div className="glass-card rounded-3xl p-6 border border-slate-700/80 shadow-2xl space-y-6">

        {/* STEP 1: VOICE RECORDING */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">
            <span className="flex items-center gap-2 text-sky-400">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center text-[11px] font-bold">
                1
              </span>
              Thu Âm Giọng Nói
            </span>
            <span className="font-mono text-sky-400 font-bold text-xs bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              {formatTime(recordingTime)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-2">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isSubmitting}
                className="group relative w-22 h-22 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 p-1 flex items-center justify-center shadow-xl shadow-sky-500/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center group-hover:bg-slate-900 transition">
                  <Mic className="w-9 h-9 text-sky-400 group-hover:text-sky-300" />
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="relative w-22 h-22 rounded-full bg-rose-500 p-1 flex items-center justify-center active-pulse active:scale-95 transition-all"
              >
                <div className="w-full h-full rounded-full bg-slate-950 flex flex-col items-center justify-center gap-1">
                  <Square className="w-7 h-7 text-rose-500 fill-rose-500" />
                  <span className="text-[10px] font-bold text-rose-400 tracking-wider">DỪNG THU</span>
                </div>
              </button>
            )}
          </div>

          {/* Audio Player Preview */}
          {audioUrl && !isRecording && (
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-between gap-3">
              <button
                onClick={togglePlayAudio}
                className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 flex items-center justify-center shrink-0"
              >
                {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1 text-left">
                <p className="text-xs font-semibold text-slate-200">Bản ghi sẵn sàng</p>
                <p className="text-[10px] text-slate-400">Thời lượng: {formatTime(recordingTime)}</p>
              </div>
              <button
                onClick={clearAudio}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                title="Xóa ghi âm"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <audio
                ref={audioPlayerRef}
                src={audioUrl}
                onEnded={() => setIsPlayingAudio(false)}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* STEP 2: PHOTO CAPTURE / UPLOAD (OPTIONAL) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">
            <span className="flex items-center gap-2 text-amber-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[11px] font-bold">
                2
              </span>
              Chụp / Đính Kèm Ảnh (Tùy chọn)
            </span>
          </div>

          {photoPreviewUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-700 group">
              <img src={photoPreviewUrl} alt="Ảnh đính kèm" className="w-full h-40 object-cover" />
              <button
                onClick={clearPhoto}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-slate-950/80 text-rose-400 hover:bg-rose-500 hover:text-white transition backdrop-blur-md"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="w-full h-24 rounded-2xl border border-dashed border-slate-700 hover:border-amber-400/50 bg-slate-900/40 hover:bg-slate-900/80 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-6 h-6 text-amber-400/80" />
              <span className="text-xs text-slate-400 font-medium">Chạm để chọn hoặc chụp ảnh</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />
        </div>

        {/* STEP 3: MANUAL SAVE ENTRY BUTTON */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-1">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold">
              3
            </span>
            Lưu Nhật Ký Ngày
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || (!audioBlob && !photoBlob)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 hover:from-sky-300 hover:to-indigo-400 text-slate-950 font-bold text-base shadow-xl shadow-sky-500/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Đang Lưu Nhật Ký...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Bước 3: Lưu Nhật Ký Ngày</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
