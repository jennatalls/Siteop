import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckCircle2, Circle, Trash2, Calendar, Pencil } from 'lucide-react';
import { TodoItem } from '../lib/types';

interface TodoItemRowProps {
  item: TodoItem;
  onToggleDone: (item: TodoItem) => void;
  onDueDateChange: (item: TodoItem, dueDate: string) => void;
  onTextChange: (item: TodoItem, text: string) => void;
  onDelete: (item: TodoItem) => void;
  draggable?: boolean;
}

export const TodoItemRow: React.FC<TodoItemRowProps> = ({
  item,
  onToggleDone,
  onDueDateChange,
  onTextChange,
  onDelete,
  draggable = true
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(item.text);

  // Keep the draft in sync if the item's text changes from elsewhere (e.g. re-populate)
  useEffect(() => {
    if (!isEditing) setDraftText(item.text);
  }, [item.text, isEditing]);

  const commitEdit = () => {
    setIsEditing(false);
    const trimmed = draftText.trim();
    if (trimmed && trimmed !== item.text) {
      onTextChange(item, trimmed);
    } else {
      setDraftText(item.text);
    }
  };

  const cancelEdit = () => {
    setDraftText(item.text);
    setIsEditing(false);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2.5 rounded-2xl border text-xs transition ${
        item.is_done
          ? 'bg-slate-900/50 border-slate-800/60'
          : 'bg-slate-900/90 border-slate-800'
      }`}
    >
      {draggable ? (
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          aria-label="Kéo để sắp xếp"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}

      <button
        onClick={() => onToggleDone(item)}
        className="shrink-0 text-slate-400 hover:text-emerald-400"
        aria-label={item.is_done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
      >
        {item.is_done ? (
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
        ) : (
          <Circle className="w-4.5 h-4.5" />
        )}
      </button>

      {isEditing ? (
        <textarea
          autoFocus
          rows={2}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            } else if (e.key === 'Escape') {
              cancelEdit();
            }
          }}
          className="flex-1 bg-slate-950 border border-sky-500/40 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none resize-none"
        />
      ) : (
        <p
          onClick={() => setIsEditing(true)}
          className={`flex-1 leading-snug cursor-text ${
            item.is_done ? 'text-slate-500 line-through' : 'text-slate-200'
          }`}
        >
          {item.text}
        </p>
      )}

      {!isEditing && (
        <button
          onClick={() => setIsEditing(true)}
          className="shrink-0 p-1 text-slate-500 hover:text-sky-400"
          aria-label="Sửa nội dung"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <Calendar className="w-3.5 h-3.5 text-sky-400" />
        <input
          type="date"
          value={item.due_date || ''}
          onChange={(e) => onDueDateChange(item, e.target.value)}
          className="bg-transparent text-[11px] text-slate-300 focus:outline-none w-[92px]"
        />
      </div>

      <button
        onClick={() => onDelete(item)}
        className="shrink-0 p-1 text-slate-500 hover:text-rose-400"
        aria-label="Xóa mục"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
