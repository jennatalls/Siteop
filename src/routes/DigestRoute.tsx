import React, { useState, useEffect } from 'react';
import {
  Calendar,
  AlertTriangle,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ListChecks
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { DailyDigest, EntryFlag, TodoItem } from '../lib/types';
import { supabase } from '../lib/supabase';
import { Toast } from '../components/Toast';
import { TodoItemRow } from '../components/TodoItemRow';

// --- Date helpers (local calendar, matching the existing date-input convention in this file) ---

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMondayString(d: Date): string {
  return toDateStr(getMonday(d));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function formatWeekLabel(weekStartStr: string): string {
  const start = new Date(weekStartStr);
  const end = new Date(addDays(weekStartStr, 6));
  const fmt = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} - ${fmt(end)}`;
}

// Sort: incomplete items first (by sort_order), completed items pushed to the bottom
function sortTodoItems(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    return a.sort_order - b.sort_order;
  });
}

interface DigestRouteProps {
  onRefresh: () => void;
}

export const DigestRoute: React.FC<DigestRouteProps> = ({ onRefresh }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Weekly To-Do state
  const [weekStart, setWeekStart] = useState<string>(() => getMondayString(new Date()));
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Fetch the daily digest row for selectedDate
  const fetchDigestForDate = async (dateStr: string) => {
    setLoading(true);
    try {
      const { data: digestData } = await supabase
        .from('daily_digests')
        .select('*')
        .eq('digest_date', dateStr)
        .maybeSingle();

      setDigest(digestData as DailyDigest | null);
    } catch (err) {
      console.warn('Digest load exception:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch this week's to-do items, then auto-populate any newly-flagged
  // entries that don't have a to-do item yet. Never touches existing rows'
  // due_date / sort_order / is_done -- only inserts genuinely new ones.
  const fetchAndPopulateTodos = async (weekStartStr: string) => {
    setTodoLoading(true);
    try {
      const weekEndStr = addDays(weekStartStr, 6);
      const startIso = `${weekStartStr}T00:00:00.000Z`;
      const endIso = `${weekEndStr}T23:59:59.999Z`;

      // 1. Flagged entries for the week (flat queries, same pattern used elsewhere)
      const { data: entriesData } = await supabase
        .from('diary_entries')
        .select('*')
        .gte('created_at', startIso)
        .lte('created_at', endIso);

      const { data: flagsData } = await supabase.from('entry_flags').select('*');

      const flagsByEntryId: Record<string, EntryFlag> = {};
      (flagsData || []).forEach((f: any) => {
        flagsByEntryId[f.entry_id] = f as EntryFlag;
      });

      const flaggedThisWeek = (entriesData || []).filter((e: any) => flagsByEntryId[e.id]?.is_flagged);

      // 2. Existing to-do items for this week
      const { data: existingItems } = await supabase
        .from('todo_items')
        .select('*')
        .eq('week_start', weekStartStr)
        .order('sort_order', { ascending: true });

      const existingByEntryId = new Set((existingItems || []).map((t: any) => t.entry_id));
      const maxSortOrder = (existingItems || []).reduce((max: number, t: any) => Math.max(max, t.sort_order), -1);

      // 3. New to-do rows for flagged entries that don't have one yet
      const newRows = flaggedThisWeek
        .filter((e: any) => !existingByEntryId.has(e.id))
        .map((e: any, idx: number) => ({
          entry_id: e.id,
          week_start: weekStartStr,
          text: flagsByEntryId[e.id]?.summary_bullet || e.transcription || 'Nhật ký cần chú ý',
          sort_order: maxSortOrder + 1 + idx,
          is_done: false
        }));

      let mergedItems: TodoItem[] = (existingItems || []) as TodoItem[];

      if (newRows.length > 0) {
        const { data: inserted, error } = await supabase
          .from('todo_items')
          .upsert(newRows, { onConflict: 'entry_id', ignoreDuplicates: true })
          .select();

        if (error) {
          console.warn('Failed to populate new to-do items:', error);
        } else if (inserted) {
          mergedItems = [...mergedItems, ...(inserted as TodoItem[])];
        }
      }

      setTodoItems(sortTodoItems(mergedItems));
    } catch (err) {
      console.warn('Todo list load exception:', err);
    } finally {
      setTodoLoading(false);
    }
  };

  useEffect(() => {
    fetchDigestForDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    fetchAndPopulateTodos(weekStart);
  }, [weekStart]);

  const changeDateByDays = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const changeWeekBy = (weeks: number) => {
    setWeekStart((prev) => addDays(prev, weeks * 7));
  };

  const toggleTodoDone = async (item: TodoItem) => {
    const newDone = !item.is_done;
    setTodoItems((prev) => sortTodoItems(prev.map((t) => (t.id === item.id ? { ...t, is_done: newDone } : t))));

    const { error } = await supabase.from('todo_items').update({ is_done: newDone }).eq('id', item.id);
    if (error) {
      setToast({ message: 'Lỗi cập nhật to-do: ' + error.message, type: 'error', open: true });
      setTodoItems((prev) => sortTodoItems(prev.map((t) => (t.id === item.id ? { ...t, is_done: item.is_done } : t))));
    }
  };

  const updateTodoDueDate = async (item: TodoItem, dueDate: string) => {
    const newDue = dueDate || null;
    setTodoItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, due_date: newDue } : t)));

    const { error } = await supabase.from('todo_items').update({ due_date: newDue }).eq('id', item.id);
    if (error) {
      setToast({ message: 'Lỗi cập nhật hạn chót: ' + error.message, type: 'error', open: true });
    }
  };

  const updateTodoText = async (item: TodoItem, text: string) => {
    setTodoItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, text } : t)));

    const { error } = await supabase.from('todo_items').update({ text }).eq('id', item.id);
    if (error) {
      setToast({ message: 'Lỗi cập nhật nội dung: ' + error.message, type: 'error', open: true });
      setTodoItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, text: item.text } : t)));
    }
  };

  const deleteTodoItem = async (item: TodoItem) => {
    setTodoItems((prev) => prev.filter((t) => t.id !== item.id));

    const { error } = await supabase.from('todo_items').delete().eq('id', item.id);
    if (error) {
      setToast({ message: 'Lỗi xóa mục: ' + error.message, type: 'error', open: true });
      fetchAndPopulateTodos(weekStart);
    }
  };

  const handleTodoDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const incomplete = todoItems.filter((t) => !t.is_done);
    const oldIndex = incomplete.findIndex((t) => t.id === active.id);
    const newIndex = incomplete.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(incomplete, oldIndex, newIndex).map((t, idx) => ({ ...t, sort_order: idx }));
    const doneItems = todoItems.filter((t) => t.is_done);

    setTodoItems(sortTodoItems([...reordered, ...doneItems]));

    try {
      await Promise.all(
        reordered.map((t) => supabase.from('todo_items').update({ sort_order: t.sort_order }).eq('id', t.id))
      );
    } catch (err) {
      console.warn('Failed to persist to-do order:', err);
    }
  };

  // Manual Trigger: "Tạo Tổng Hợp" via the Vercel Serverless API ONLY.
  // This NEVER calls Gemini directly from the browser -- the Gemini API key must
  // stay server-side. If the serverless call fails, the failure is thrown and
  // surfaced in the toast instead of faking a successful digest.
  const handleGenerateDigest = async () => {
    setGenerating(true);
    setToast({
      message: 'Đang kết nối Gemini AI để tổng hợp báo cáo ngày...',
      type: 'info',
      open: true
    });

    try {
      const response = await fetch(`/api/generate-digest?date=${selectedDate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`/api/generate-digest returned ${response.status}: ${errBody}`);
      }

      const digestPayload: DailyDigest = await response.json();

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

          {/* WEEKLY TO-DO LIST */}
          <div className="glass-card rounded-3xl p-5 border border-slate-700/60 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-amber-400" />
                To-Do Tuần Này ({todoItems.filter((t) => !t.is_done).length})
              </h3>
            </div>

            {/* Week Selector Banner */}
            <div className="glass-panel rounded-2xl p-2 flex items-center justify-between border border-slate-800">
              <button
                onClick={() => changeWeekBy(-1)}
                className="p-1.5 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-200">Tuần {formatWeekLabel(weekStart)}</span>
              <button
                onClick={() => changeWeekBy(1)}
                className="p-1.5 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {todoLoading ? (
              <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-400" />
              </div>
            ) : todoItems.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                Không có nhật ký nào bị gắn cờ chú ý trong tuần này.
              </p>
            ) : (
              <div className="space-y-3">
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTodoDragEnd}>
                  <SortableContext
                    items={todoItems.filter((t) => !t.is_done).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {todoItems
                        .filter((t) => !t.is_done)
                        .map((item) => (
                          <TodoItemRow
                            key={item.id}
                            item={item}
                            onToggleDone={toggleTodoDone}
                            onDueDateChange={updateTodoDueDate}
                            onTextChange={updateTodoText}
                            onDelete={deleteTodoItem}
                          />
                        ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {todoItems.some((t) => t.is_done) && (
                  <div className="pt-2 border-t border-slate-800/60 space-y-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Đã hoàn thành</p>
                    {todoItems
                      .filter((t) => t.is_done)
                      .map((item) => (
                        <TodoItemRow
                          key={item.id}
                          item={item}
                          onToggleDone={toggleTodoDone}
                          onDueDateChange={updateTodoDueDate}
                          onTextChange={updateTodoText}
                          onDelete={deleteTodoItem}
                          draggable={false}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
