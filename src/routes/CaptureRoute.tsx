import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Camera, Trash2, Send, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { addToOfflineQueue, blobToBase64, uploadMediaToSupabase } from '../lib/offlineStore';
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

  // Format recording timer: 00:15
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start Voice Recording (iOS Safari tested Web Audio / MediaRecorder)
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine iOS supported MIME type
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

        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      setToast({
        message: 'Không thể mở Micro. Vui lòng cấp quyền truy cập micro trên Safari.',
        type: 'error',
        open: true
      });
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Clear Audio Recording
  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  // Toggle Audio Playback
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

  // Photo Select / Capture
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);
    }
  };

  // Clear Photo
  const clearPhoto = () => {
    setPhotoBlob(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Handler: Saves online to Supabase or queues to localStorage offline
  const handleSubmit = async () => {
    if (!audioBlob && !photoBlob) {
      setToast({
        message: 'Vui lòng thu âm hoặc chọn 1 bức ảnh trước khi lưu!',
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
        // Offline -> Queue to localStorage
        addToOfflineQueue({
          voiceBlobBase64: voiceBase64,
          photoBlobBase64: photoBase64,
          audioMimeType: audioBlob?.type,
          photoMimeType: photoBlob?.type
        });

        setToast({
          message: 'Đã lưu offline vào thiết bị! Sẽ tự động đồng bộ khi có mạng.',
          type: 'success',
          open: true
        });
      } else {
        // Online -> Upload to Supabase Storage & Insert Table
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
          console.warn('Supabase insert error, saving offline fallback:', error);
          addToOfflineQueue({
            voiceBlobBase64: voiceBase64,
            photoBlobBase64: photoBase64,
            audioMimeType: audioBlob?.type,
            photoMimeType: photoBlob?.type
          });
          setToast({
            message: 'Lưu offline thành công (chờ kết nối CSDL).',
            type: 'info',
            open: true
          });
        } else {
          setToast({
            message: 'Saved! Đã lưu nhật ký thành công.',
            type: 'success',
            open: true
          });

          // Trigger background transcription / extraction if backend API function available
          if (newEntry && voiceBase64) {
            fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: voiceBase64,
                mimeType: audioBlob?.type,
                entryId: newEntry.id
              })
            })
              .then((res) => res.json())
              .then((transResult) => {
                if (transResult.text) {
                  fetch('/api/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transcription: transResult.text,
                      entryId: newEntry.id
                    })
                  });
                }
              })
              .catch((err) => console.warn('Background AI extraction trigger:', err));
          }
        }
      }

      // Clear Form for next entry
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
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Screen Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Ghi Nhận Nhật Ký</h2>
        <p className="text-xs text-slate-400">Thu âm giọng nói hoặc chụp ảnh công trình hôm nay</p>
      </div>

      {/* Voice Recorder Card */}
      <div className="glass-card rounded-3xl p-6 text-center space-y-5 border border-slate-700/60 shadow-xl">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
          <span className="flex items-center gap-1.5">
            <Mic className="w-4 h-4 text-sky-400" /> Ghi Âm Giọng Nói
          </span>
          <span className="font-mono text-sky-400 font-bold text-sm">{formatTime(recordingTime)}</span>
        </div>

        {/* Big Record Button */}
        <div className="flex items-center justify-center py-4">
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="group relative w-24 h-24 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 p-1 flex items-center justify-center shadow-2xl shadow-sky-500/30 hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center group-hover:bg-slate-900 transition">
                <Mic className="w-10 h-10 text-sky-400 group-hover:text-sky-300" />
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="relative w-24 h-24 rounded-full bg-rose-500 p-1 flex items-center justify-center active-pulse active:scale-95 transition-all"
            >
              <div className="w-full h-full rounded-full bg-slate-950 flex flex-col items-center justify-center gap-1">
                <Square className="w-8 h-8 text-rose-500 fill-rose-500" />
                <span className="text-[10px] font-bold text-rose-400 tracking-wider">DỪNG</span>
              </div>
            </button>
          )}
        </div>

        {/* Audio Player Preview */}
        {audioUrl && !isRecording && (
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-between gap-3">
            <button
              onClick={togglePlayAudio}
              className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 flex items-center justify-center shrink-0"
            >
              {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="flex-1 text-left">
              <p className="text-xs font-semibold text-slate-200">Bản ghi đã sẵn sàng</p>
              <p className="text-[10px] text-slate-400">Thời lượng: {formatTime(recordingTime)}</p>
            </div>
            <button
              onClick={clearAudio}
              className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
              title="Xóa bản ghi"
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

      {/* Photo Capture Card */}
      <div className="glass-card rounded-3xl p-5 space-y-4 border border-slate-700/60 shadow-xl">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-amber-400" /> Chụp / Chọn Ảnh Công Trình
          </span>
        </div>

        {photoPreviewUrl ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-700 group">
            <img src={photoPreviewUrl} alt="Ghi nhận công trình" className="w-full h-48 object-cover" />
            <button
              onClick={clearPhoto}
              className="absolute top-3 right-3 p-2 rounded-xl bg-slate-950/80 text-rose-400 hover:bg-rose-500 hover:text-white transition backdrop-blur-md"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400/50 bg-slate-900/40 hover:bg-slate-900/80 flex flex-col items-center justify-center gap-2 transition cursor-pointer"
          >
            <Camera className="w-8 h-8 text-amber-400/80" />
            <span className="text-xs text-slate-300 font-medium">Chạm để chụp hoặc chọn ảnh</span>
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

      {/* Big Submit Button */}
      <button
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
            <span>Lưu Nhật Ký Ngày</span>
          </>
        )}
      </button>
    </div>
  );
};
