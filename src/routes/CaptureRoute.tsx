import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Camera, Trash2, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
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

  // Internal Auto-Save Core Engine
  const saveEntryToSupabase = async (voiceBlobParam?: Blob | null, photoBlobParam?: Blob | null) => {
    const targetAudio = voiceBlobParam !== undefined ? voiceBlobParam : audioBlob;
    const targetPhoto = photoBlobParam !== undefined ? photoBlobParam : photoBlob;

    if (!targetAudio && !targetPhoto) return;

    setIsSubmitting(true);

    try {
      const voiceBase64 = targetAudio ? await blobToBase64(targetAudio) : undefined;
      const photoBase64 = targetPhoto ? await blobToBase64(targetPhoto) : undefined;

      if (!isOnline) {
        addToOfflineQueue({
          voiceBlobBase64: voiceBase64,
          photoBlobBase64: photoBase64,
          audioMimeType: targetAudio?.type,
          photoMimeType: targetPhoto?.type
        });

        setToast({
          message: '⚡ Tự động lưu offline vào thiết bị (sẽ đồng bộ khi có mạng)',
          type: 'success',
          open: true
        });
      } else {
        let voiceUrl: string | null = null;
        let photoUrl: string | null = null;

        if (targetAudio) {
          voiceUrl = await uploadMediaToSupabase(targetAudio, 'voice-memos', `voice_${Date.now()}.mp4`);
        }

        if (targetPhoto) {
          photoUrl = await uploadMediaToSupabase(targetPhoto, 'photos', `photo_${Date.now()}.jpg`);
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
          console.warn('Supabase insert error, using offline fallback:', error);
          addToOfflineQueue({
            voiceBlobBase64: voiceBase64,
            photoBlobBase64: photoBase64,
            audioMimeType: targetAudio?.type,
            photoMimeType: targetPhoto?.type
          });
          setToast({
            message: '⚡ Đã lưu offline thành công',
            type: 'info',
            open: true
          });
        } else {
          setToast({
            message: '⚡ Tự động lưu nhật ký thành công!',
            type: 'success',
            open: true
          });

          // Trigger background AI transcription & extraction (Vercel API + Local fallback)
          if (newEntry && voiceBase64) {
            processAudioWithGemini(newEntry.id, voiceBase64, targetAudio?.type);
          }
        }
      }

      onEntrySaved();
    } catch (err: any) {
      console.error('Auto save error:', err);
      setToast({
        message: 'Lỗi tự động lưu: ' + (err.message || 'Thử lại'),
        type: 'error',
        open: true
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start Voice Recording
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

      mediaRecorder.onstop = async () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(finalBlob);
        const url = URL.createObjectURL(finalBlob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());

        // AUTO-SAVE IMMEDIATELY UPON RECORDING STOP!
        await saveEntryToSupabase(finalBlob, photoBlob);
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

  // Stop Recording & Trigger Auto-Save
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Photo Select & Auto-Save
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);

      // AUTO-SAVE IMMEDIATELY UPON PHOTO SELECTION!
      await saveEntryToSupabase(audioBlob, file);
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
        <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center justify-center gap-1.5">
          <span>Ghi Nhận Nhật Ký</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            ⚡ Tự Động Lưu
          </span>
        </h2>
        <p className="text-xs text-slate-400">Chạm thu âm hoặc chụp ảnh — Tự động lưu tức thì</p>
      </div>

      {/* Voice Recorder Card */}
      <div className="glass-card rounded-3xl p-6 text-center space-y-5 border border-slate-700/60 shadow-xl relative overflow-hidden">
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
              disabled={isSubmitting}
              className="group relative w-24 h-24 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 p-1 flex items-center justify-center shadow-2xl shadow-sky-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
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
                <span className="text-[10px] font-bold text-rose-400 tracking-wider">DỪNG & LƯU</span>
              </div>
            </button>
          )}
        </div>

        {/* Status Indicator */}
        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 text-xs text-sky-400 font-semibold animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Đang tự động lưu nhật ký...</span>
          </div>
        )}

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
              <p className="text-xs font-semibold text-slate-200">Ghi âm vừa tự động lưu</p>
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
          <span className="text-[10px] text-emerald-400 font-semibold">Tự động lưu sau khi chọn</span>
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
            disabled={isSubmitting}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400/50 bg-slate-900/40 hover:bg-slate-900/80 flex flex-col items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
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
    </div>
  );
};
