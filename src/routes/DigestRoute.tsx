import React, { useState, useEffect } from 'react';
import {
  Calendar,
  AlertTriangle,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Tag,
  ChevronDown,
  ChevronUp,
  Volume2,
  Layers
} from 'lucide-react';
import { DailyDigest, DiaryEntry, EntryFlag } from '../lib/types';
import { supabase } from '../lib/supabase';
import { Toast } from '../components/Toast';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface DigestRouteProps {
  onRefresh: () => void;
}

export const DigestRoute: React.FC<DigestRouteProps> = ({ onRefresh }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [flaggedEntries, setFlaggedEntries] = useState<Array<{ entry: DiaryEntry; flag: EntryFlag }>>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Fetch Digest & Flagged Entries for selectedDate
  const fetchDigestForDate = async (dateStr: string) => {
    setLoading(true);
    try {
      // 1. Fetch daily digest row
      const { data: digestData } = await supabase
        .from('daily_digests')
        .select('*')
        .eq('digest_date', dateStr)
        .maybeSingle();

      setDigest(digestData as DailyDigest | null);

      // 2. Fetch entries & flags for date using flat queries to avoid relationship joins
      const startIso = `${dateStr}T00:00:00.000Z`;
      const endIso = `${dateStr}T23:59:59.999Z`;

      const { data: entriesData } = await supabase
        .from('diary_entries')
        .select('*')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false });

      const { data: flagsData } = await supabase.from('entry_flags').select('*');

      if (entriesData) {
        const flagsByEntryId: Record<string, EntryFlag> = {};
        if (flagsData) {
          flagsData.forEach((f: any) => {
            flagsByEntryId[f.entry_id] = f as EntryFlag;
          });
        }

        const flaggedList: Array<{ entry: DiaryEntry; flag: EntryFlag }> = [];
        entriesData.forEach((e: any) => {
          const flag = flagsByEntryId[e.id];
          if (flag && flag.is_flagged) {
            flaggedList.push({ entry: e as DiaryEntry, flag });
          }
        });

        setFlaggedEntries(flaggedList);
      }
    } catch (err) {
      console.warn('Digest load exception:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigestForDate(selectedDate);
  }, [selectedDate]);

  const changeDateByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Manual Trigger: "Tạo Tổng Hợp" with client fallback if serverless returns error
  const handleGenerateDigest = async () => {
    setGenerating(true);
    setToast({
      message: 'Đang kết nối Gemini AI để tổng hợp báo cáo ngày...',
      type: 'info',
      open: true
    });

    try {
      let digestPayload: DailyDigest | null = null;

      // 1. Try Vercel Serverless API first
      try {
        const response = await fetch(`/api/generate-digest?date=${selectedDate}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate })
        });

        if (response.ok) {
          digestPayload = await response.json();
        }
      } catch (e) {
        console.warn('Serverless API fetch error, switching to direct Gemini client:', e);
      }

      // 2. Client-side Gemini fallback if serverless returned error or running on localhost
      if (!digestPayload) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process as any)?.env?.GEMINI_API_KEY;

        const startIso = `${selectedDate}T00:00:00.000Z`;
        const endIso = `${selectedDate}T23:59:59.999Z`;

        const { data: dayEntries } = await supabase
          .from('diary_entries')
          .select('*')
          .gte('created_at', startIso)
          .lte('created_at', endIso);

        const count = dayEntries ? dayEntries.length : 0;

        if (apiKey && count > 0) {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

          let promptContent = `Danh sách nhật ký công trình ngày ${selectedDate}:\n`;
          dayEntries?.forEach((e: any, idx: number) => {
            promptContent += `- Nhật ký #${idx + 1}: ${e.transcription || e.extracted_data?.category || 'Ghi nhận'}\n`;
          });

          const res = await model.generateContent(`Bạn là chuyên gia xây dựng. Phân tích danh sách nhật ký sau và trả về JSON:
${promptContent}
JSON:
{
  "agenda_text": "Danh sách việc cần chú ý cho ngày mai (gạch đầu dòng)",
  "summary_text": "Tóm tắt tổng quan tiến độ hôm nay"
}`);

          const raw = res.response.text();
          let agendaText = 'Đã cập nhật các việc cần chú ý cho ngày mai.';
          let summaryText = 'Đã hoàn thành các công việc ghi nhận trong ngày.';

          try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              const p = JSON.parse(match[0]);
              agendaText = p.agenda_text || agendaText;
              summaryText = p.summary_text || summaryText;
            }
          } catch (e) {}

          digestPayload = {
            id: `digest_${Date.now()}`,
            digest_date: selectedDate,
            agenda_text: agendaText,
            summary_text: summaryText,
            entries_count: count,
            generated_at: new Date().toISOString()
          };

          // Save to Supabase daily_digests table
          await supabase.from('daily_digests').upsert(digestPayload, { onConflict: 'digest_date' });
        } else {
          digestPayload = {
            id: `digest_${Date.now()}`,
            digest_date: selectedDate,
            agenda_text: flaggedEntries.length > 0
              ? flaggedEntries.map((f, i) => `${i + 1}. ${f.flag.summary_bullet || f.entry.transcription}`).join('\n')
              : 'Chưa có mục cần chú ý cho ngày này.',
            summary_text: count > 0 ? `Đã hoàn thành ${count} ghi nhận trong ngày.` : 'Không có ghi nhận nào trong ngày.',
            entries_count: count,
            generated_at: new Date().toISOString()
          };
          await supabase.from('daily_digests').upsert(digestPayload, { onConflict: 'digest_date' });
        }
      }

      setDigest(digestPayload);
      setToast({
        message: 'Tạo tổng hợp báo cáo ngày thành công!',
        type: 'success',
        open: true
      });
      fetchDigestForDate(selectedDate);
    } catch (err: any) {
      console.error('Digest generation exception:', err);
      setToast({
        message: 'Lỗi khi tạo tổng hợp: ' + (err.message || 'Thử lại'),
        type: 'error',
        open: true
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-5">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Title & Date Navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">Tổng Hợp Ngày</h2>
            <p className="text-xs text-slate-400">Báo cáo tiến độ & danh sách cần chú ý (Gemini AI)</p>
          </div>

          <button
            onClick={handleGenerateDigest}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 transition"
          >
            {generating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Tạo Tổng Hợp</span>
          </button>
        </div>

        {/* Date Selector Banner */}
        <div className="glass-panel rounded-2xl p-2.5 flex items-center justify-between border border-slate-800">
          <button
            onClick={() => changeDateByDays(-1)}
            className="p-1.5 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-100 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => changeDateByDays(1)}
            className="p-1.5 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400" />
          <p>Đang tải dữ liệu tổng hợp...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION 1: "⚠️ CẦN CHÚ Ý" (Agenda Text) */}
          <div className="glass-card rounded-3xl p-5 border border-amber-500/30 space-y-3 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Section 1: ⚠️ Cần Chú Ý (Agenda)
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                To-Do Ngày Mai
              </span>
            </div>

            <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
              {digest?.agenda_text || 'Chưa có tổng hợp agenda cần chú ý. Chạm nút "Tạo Tổng Hợp" để Gemini AI phân tích.'}
            </div>
          </div>

          {/* SECTION 2: "📋 TÓM TẮT" (Summary Text) */}
          <div className="glass-card rounded-3xl p-5 border border-sky-500/30 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
              <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-sky-400" />
                Section 2: 📋 Tóm Tắt (Summary)
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                Tiến Độ Tổng Quan
              </span>
            </div>

            <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
              {digest?.summary_text || 'Chưa có tóm tắt tổng quan. Chạm nút "Tạo Tổng Hợp" để Gemini AI tổng hợp tiến độ.'}
            </div>
          </div>

          {/* FLAGGED ENTRIES LIST */}
          <div className="glass-card rounded-3xl p-5 border border-slate-700/60 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Danh Sách Mục Flagged Cần Chú Ý ({flaggedEntries.length})
              </h3>
            </div>

            {flaggedEntries.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                Không có nhật ký nào bị gắn cờ chú ý trong ngày này.
              </p>
            ) : (
              <div className="space-y-2.5">
                {flaggedEntries.map(({ entry, flag }) => {
                  const isExpanded = expandedEntryId === entry.id;

                  return (
                    <div
                      key={entry.id}
                      className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs transition"
                    >
                      <div
                        onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                        className="flex items-start justify-between gap-2 cursor-pointer"
                      >
                        <div className="flex items-start gap-2 flex-1">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-slate-100 leading-snug">
                              {flag.summary_bullet || entry.transcription || 'Nhật ký đính kèm'}
                            </p>

                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {flag.flag_reason || 'chú ý'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(entry.created_at).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button className="p-1 text-slate-400 hover:text-white">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Expanded View: Full Transcript & Photo */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-800 space-y-2 animate-fade-in">
                          {entry.photo_url && (
                            <img
                              src={entry.photo_url}
                              alt="Flagged entry photo"
                              className="w-full h-40 object-cover rounded-xl border border-slate-700"
                            />
                          )}

                          {entry.voice_url && (
                            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                              <Volume2 className="w-4 h-4 text-sky-400 shrink-0" />
                              <audio controls src={entry.voice_url} className="w-full h-7" />
                            </div>
                          )}

                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
                            <span className="font-bold text-slate-200 block mb-0.5">Văn bản ghi chép đầy đủ:</span>
                            {entry.transcription || 'Chưa có ghi chép văn bản.'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
