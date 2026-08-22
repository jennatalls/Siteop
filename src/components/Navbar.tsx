import React from 'react';
import { Mic, BookOpen, Sparkles, RefreshCw, Wifi, WifiOff, LogIn, LogOut, User } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface NavbarProps {
  currentRoute: 'capture' | 'diary' | 'digest' | 'sync';
  onNavigate: (route: 'capture' | 'diary' | 'digest' | 'sync') => void;
  isOnline: boolean;
  offlineCount: number;
  user: SupabaseUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

const TABS: Array<{ id: 'capture' | 'diary' | 'digest' | 'sync'; label: string; icon: React.ElementType }> = [
  { id: 'capture', label: 'Ghi Nhận', icon: Mic },
  { id: 'diary', label: 'Nhật Ký', icon: BookOpen },
  { id: 'digest', label: 'Tổng Hợp', icon: Sparkles },
  { id: 'sync', label: 'Đồng Bộ', icon: RefreshCw }
];

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
      <header className="sticky top-0 z-40 w-full bg-paper/95 backdrop-saturate-150 px-4 py-3 flex items-center justify-between border-b border-ink">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[0.7rem] bg-ink flex items-center justify-center font-bold text-paper text-sm shrink-0">
            SO
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight text-ink flex items-center gap-1.5">
              Siteop
              <span className="label-micro px-1.5 py-0.5 rounded-pill bg-accent-soft text-ink border border-ink normal-case font-bold tracking-normal">
                PWA
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online/Offline Status Indicator */}
          <div
            className={`pill px-2.5 py-1 border ${
              isOnline
                ? 'bg-positive-soft text-positive border-ink'
                : 'bg-warning-soft text-warning border-ink'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
            {offlineCount > 0 && (
              <span className="bg-ink text-paper font-bold px-1.5 rounded-pill text-[10px] leading-4">
                {offlineCount}
              </span>
            )}
          </div>

          {/* Auth Button */}
          {user ? (
            <button
              onClick={onSignOut}
              className="pill btn-outline px-2.5 py-1.5"
              title={`Logged in as ${user.email}`}
            >
              <User className="w-3.5 h-3.5" />
              <span className="max-w-[70px] truncate hidden sm:inline font-semibold">{user.email}</span>
              <LogOut className="w-3.5 h-3.5 opacity-70" />
            </button>
          ) : (
            <button onClick={onOpenAuth} className="pill btn-primary px-3 py-1.5">
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </header>

      {/* Bottom Floating Navigation (4 Tabs: Ghi Nhận / Nhật Ký / Tổng Hợp / Đồng Bộ) */}
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md card p-1.5"
        aria-label="Điều hướng chính"
      >
        <div className="grid grid-cols-4 gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = currentRoute === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-[0.85rem] transition-all ${
                  isActive
                    ? 'bg-accent text-ink font-bold border border-ink'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-soft border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px]">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
