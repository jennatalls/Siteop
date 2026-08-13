import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Tag,
  CheckCircle,
  Clock,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Download,
  X,
  Volume2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { DiaryEntry, EntryStatus } from '../lib/types';
import { supabase } from '../lib/supabase';
import { matchVietnameseSearch } from '../lib/vietnamese';
import { Toast } from '../components/Toast';
import { processAudioWithGemini } from '../lib/geminiFallback';
import { blobToBase64 } from '../lib/offlineStore';

interface DiaryRouteProps {
  entries: DiaryEntry[];
  onRefresh: () => void;
  onNavigateToSync: () => void;
}

export const DiaryRoute: React.FC<DiaryRouteProps> = ({ entries, onRefresh, onNavigateToSync }) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected Entry for Detail Drawer/Modal
  const [activeEntry, setActiveEntry] = useState<DiaryEntry | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Tracks which entry (by id) currently has a retry-transcription request in flight
  const [retryingEntryId, setRetryingEntryId] = useState<string | null>(null);

  // Categories list extracted dynamically from entries
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    entries.forEach((e) => {
      if (e.extracted_data?.category) {
        categories.add(e.extracted_data.category);
      }
    });
    return Array.from(categories);
  }, [entries]);

  // Filtered entries memoized
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // 1. Keyword search (diacritic insensitive)
      const textToMatch = `${entry.transcription || ''} ${entry.extracted_data?.category || ''} ${
        entry.extracted_data?.summary_vi || ''
      }`;

      if (searchQuery && !matchVietnameseSearch(textToMatch, searchQuery)) {
        return false;
      }

      // 2. Category filter
      if (selectedCategory !== 'all') {
        if (entry.extracted_data?.category !== selectedCategory) {
          return false;
        }
      }

      // 3. Status filter
      if (selectedStatus !== 'all') {
        if (entry.status !== selectedStatus) {
          return false;
        }
      }

      // 4. Date Range filter
      if (startDate) {
        const entryDate = new Date(entry.created_at).toISOString().split('T')[0];
        if (entryDate < startDate) return false;
      }

      if (endDate) {
        const entryDate = new Date(entry.created_at).toISOString().split('T')[0];
        if (entryDate > endDate) return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedCategory, selectedStatus, startDate, endDate]);

  // Toggle Entry Status (draft <-> filed)
  const toggleEntryStatus = async (entry: DiaryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: EntryStatus = entry.status === 'draft' ? 'filed' : 'draft';

    try {
      const { error } = await supabase
        .from('diary_entries')
        .update({ status: newStatus })
        .eq('id', entry.id);

      if (error) throw error;

      setToast({
        message: `Đã đổi trạng thái sang "${newStatus === 'filed' ? 'Đã lưu kho' : 'Bản nháp'}"`,
        type: 'success',
        open: true
      });

      if (activeEntry?.id === entry.id) {
        setActiveEntry((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      onRefresh();
    } catch (err: any) {
      setToast({
        message: 'Lỗi cập nhật trạng thái: ' + err.message,
        type: 'error',
        open: true
      });
    }
  };

  // Retry transcription for an entry that has a recording but no transcript
  // (either explicitly failed, or silently failed before error-status handling
  // existed). Re-runs the exact same /api/transcribe -> /api/extract pipeline
  // CaptureRoute uses for new recordings -- no separate backend logic.
  const retryTranscription = async (entry: DiaryEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!entry.voice_url || retryingEntryId) return;

    setRetryingEntryId(entry.id);

    try {
      let audioBase64: string;
      let mimeType = 'audio/mp4';

      if (entry.voice_url.startsWith('data:')) {
        // Old-style inline recording (base64 stored directly in the DB row)
        audioBase64 = entry.voice_url;
        const match = entry.voice_url.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
      } else {
        // Normal case: a real Supabase Storage URL -- fetch the file back
        const res = await fetch(entry.voice_url);
        if (!res.ok) {
          throw new Error(`Không tải được file ghi âm để thử lại (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        mimeType = blob.type || mimeType;
        audioBase64 = await blobToBase64(blob);
      }

      const result = await processAudioWithGemini(entry.id, audioBase64, mimeType);

      if (result.error) {
        throw new Error(result.error);
      }

      // Reflect the new transcript immediately if this entry's detail is open,
      // rather than waiting on the next onRefresh() round-trip.
      if (activeEntry?.id === entry.id) {
        setActiveEntry((prev) =>
          prev
            ? {
                ...prev,
                transcription: result.text ?? prev.transcription,
                extracted_data: result.extracted_data ?? prev.extracted_data
              }
            : null
        );
      }

      setToast({
        message: 'Đã thử lại chuyển văn bản thành công!',
        type: 'success',
        open: true
      });

      onRefresh();
    } catch (err: any) {
      setToast({
        message: 'Lỗi khi thử lại chuyển văn bản: ' + (err.message || 'Vui lòng thử lại sau'),
        type: 'error',
        open: true
      });
    } finally {
      setRetryingEntryId(null);
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

      {/* Screen Title & Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Nhật Ký Công Trình</h2>
          <p className="text-xs text-slate-400">Danh sách nhật ký đã ghi nhận ({filteredEntries.length})</p>
        </div>

        <button
          onClick={onNavigateToSync}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/25 transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất Drive</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm từ khóa, thợ nề, xi măng, gạch..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters Accordion / Pills */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {/* Category Filter Pills */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition ${
              selectedCategory === 'all'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Tất cả danh mục
          </button>

          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition ${
                selectedCategory === cat
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Diary Entry Cards List */}
      {filteredEntries.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 my-4">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">Chưa tìm thấy nhật ký nào</p>
          <p className="text-xs text-slate-500">
            Thử thay đổi từ khóa tìm kiếm hoặc qua tab Ghi Nhận để tạo nhật ký mới
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const dateStr = new Date(entry.created_at).toLocaleString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            const ext = entry.extracted_data;
            const category = ext?.category || 'Chưa phân loại';
            const snippet =
              entry.transcription && entry.transcription.length > 100
                ? entry.transcription.substring(0, 100) + '...'
                : entry.transcription || 'Chưa có ghi chép văn bản...';
            const needsRetry = !!entry.voice_url && !entry.transcription;
            const isRetrying = retryingEntryId === entry.id;

            return (
              <div
                key={entry.id}
                onClick={() => setActiveEntry(entry)}
                className="glass-card rounded-2xl p-4 border border-slate-700/60 shadow-lg hover:border-sky-500/40 active:scale-[0.99] transition-all cursor-pointer space-y-3"
              >
                {/* Header: Date & Status */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    {dateStr}
                  </span>

                  <button
                    onClick={(e) => toggleEntryStatus(entry, e)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1 transition ${
                      entry.status === 'filed'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {entry.status === 'filed' ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> Đã Lưu Kho
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3" /> Bản Nháp
                      </>
                    )}
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex gap-3">
                  {entry.photo_url && (
                    <img
                      src={entry.photo_url}
                      alt="Thumbnail"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{snippet}</p>

                    {/* Category & Confidence Badge */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-medium">
                        {category}
                      </span>

                      {ext?.confidence_score !== undefined && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                          <Sparkles className="w-3 h-3" />
                          {(ext.confidence_score * 100).toFixed(0)}% AI
                        </span>
                      )}

                      {needsRetry && (
                        <button
                          onClick={(e) => retryTranscription(entry, e)}
                          disabled={retryingEntryId !== null}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-semibold hover:bg-rose-500/25 disabled:opacity-50 transition"
                        >
                          {isRetrying ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {isRetrying ? 'Đang thử lại...' : 'Chưa có văn bản — Thử lại'}
                        </button>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-500 self-center shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Entry Detail Modal / Drawer */}
      {activeEntry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto glass-card rounded-t-3xl sm:rounded-3xl p-6 border border-slate-700/80 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">Chi Tiết Nhật Ký</h3>
                <p className="text-xs text-slate-400">
                  {new Date(activeEntry.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
              <button
                onClick={() => setActiveEntry(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo View */}
            {activeEntry.photo_url && (
              <div className="rounded-2xl overflow-hidden border border-slate-700">
                <img src={activeEntry.photo_url} alt="Chi tiết ảnh" className="w-full h-56 object-cover" />
              </div>
            )}

            {/* Voice Audio Player */}
            {activeEntry.voice_url && (
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-700 space-y-1">
                <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold">
                  <Volume2 className="w-4 h-4" /> File Ghi Âm Giọng Nói
                </div>
                <audio controls src={activeEntry.voice_url} className="w-full h-8 mt-1" />
              </div>
            )}

            {/* Transcription */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">Văn bản ghi chép:</label>
                {activeEntry.voice_url && !activeEntry.transcription && (
                  <button
                    onClick={(e) => retryTranscription(activeEntry, e)}
                    disabled={retryingEntryId !== null}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[11px] font-semibold hover:bg-rose-500/25 disabled:opacity-50 transition"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${retryingEntryId === activeEntry.id ? 'animate-spin' : ''}`}
                    />
                    {retryingEntryId === activeEntry.id ? 'Đang thử lại...' : 'Thử Lại Chuyển Văn Bản'}
                  </button>
                )}
              </div>
              <p className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {activeEntry.transcription || 'Chưa có ghi chép văn bản.'}
              </p>
            </div>

            {/* AI Extracted Information */}
            {activeEntry.extracted_data && (
              <div className="space-y-3 p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20">
                <div className="flex items-center justify-between text-xs font-bold text-sky-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Trích Xuất AI Gemini
                  </span>
                  <span>Category: {activeEntry.extracted_data.category}</span>
                </div>

                {activeEntry.extracted_data.materials?.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-amber-400">Vật tư:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                      {activeEntry.extracted_data.materials.map((m: any, idx: number) => (
                        <li key={idx}>
                          {m.item}: {m.quantity} {m.unit} {m.note ? `(${m.note})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeEntry.extracted_data.labor?.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-emerald-400">Nhân công:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                      {activeEntry.extracted_data.labor.map((l: any, idx: number) => (
                        <li key={idx}>
                          {l.role}: {l.count || 1} người {l.hours ? `(${l.hours})` : ''} — {l.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Toggle */}
            <div>
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                {showRawJson ? 'Ẩn Metadata JSON' : 'Xem Raw Metadata JSON'}
              </button>

              {showRawJson && (
                <pre className="mt-2 p-3 rounded-xl bg-slate-950 text-[10px] text-emerald-400 font-mono overflow-x-auto border border-slate-800 max-h-40">
                  {JSON.stringify(activeEntry, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
