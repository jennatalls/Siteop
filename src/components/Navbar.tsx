import React from 'react';
import { Mic, BookOpen, RefreshCw, Wifi, WifiOff, LogIn, LogOut, User } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface NavbarProps {
  currentRoute: 'capture' | 'diary' | 'sync';
  onNavigate: (route: 'capture' | 'diary' | 'sync') => void;
  isOnline: boolean;
  offlineCount: number;
  user: SupabaseUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  isOnline,
  offlineCount,
  user,
  onOpenAuth,
  onSignOut
}) => {
  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full glass-panel px-4 py-3 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-amber-400 flex items-center justify-center font-bold text-slate-950 text-sm shadow-md shadow-sky-500/20">
            SO
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
              Siteop <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 ml-1">PWA</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online/Offline Status Indicator */}
          <div
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="font-medium">{isOnline ? 'Online' : 'Offline'}</span>
            {offlineCount > 0 && (
              <span className="bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                {offlineCount}
              </span>
            )}
          </div>

          {/* Auth Button */}
          {user ? (
            <button
              onClick={onSignOut}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title={`Logged in as ${user.email}`}
            >
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="max-w-[70px] truncate hidden sm:inline">{user.email}</span>
              <LogOut className="w-3.5 h-3.5 ml-0.5 opacity-70" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/20 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </header>

      {/* Bottom Floating Navigation (Mobile Native Feel) */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md glass-panel rounded-2xl p-1.5 border border-slate-700/60 shadow-2xl shadow-slate-950/80">
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => onNavigate('capture')}
            className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
              currentRoute === 'capture'
                ? 'bg-sky-500/15 text-sky-400 font-semibold shadow-inner border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Mic className={`w-5 h-5 mb-0.5 ${currentRoute === 'capture' ? 'animate-bounce-short text-sky-400' : ''}`} />
            <span className="text-xs">Ghi Nhận</span>
          </button>

          <button
            onClick={() => onNavigate('diary')}
            className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
              currentRoute === 'diary'
                ? 'bg-sky-500/15 text-sky-400 font-semibold shadow-inner border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-5 h-5 mb-0.5" />
            <span className="text-xs">Nhật Ký</span>
          </button>

          <button
            onClick={() => onNavigate('sync')}
            className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
              currentRoute === 'sync'
                ? 'bg-sky-500/15 text-sky-400 font-semibold shadow-inner border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <RefreshCw className="w-5 h-5 mb-0.5" />
            <span className="text-xs">Đồng Bộ</span>
          </button>
        </div>
      </nav>
    </>
  );
};
