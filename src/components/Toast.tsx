import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  isOpen,
  onClose,
  duration = 3000
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce-in w-[90%] max-w-sm">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl glass-card border shadow-2xl ${
          type === 'success'
            ? 'border-emerald-500/30 text-emerald-300 bg-slate-900/90'
            : type === 'error'
            ? 'border-rose-500/30 text-rose-300 bg-slate-900/90'
            : 'border-sky-500/30 text-sky-300 bg-slate-900/90'
        }`}
      >
        {type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
        {type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
        {type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
        <span className="text-xs font-semibold">{message}</span>
      </div>
    </div>
  );
};
