import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, FolderCheck, HardDrive, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { DiaryEntry, SyncLog } from '../lib/types';
import { supabase } from '../lib/supabase';
import { Toast } from '../components/Toast';

interface SyncRouteProps {
  entries: DiaryEntry[];
  onRefresh: () => void;
}

export const SyncRoute: React.FC<SyncRouteProps> = ({ entries, onRefresh }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; open: boolean }>({
    message: '',
    type: 'success',
    open: false
  });

  // Fetch last 5 sync logs from Supabase
  const fetchSyncLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(5);

      if (error) {
        console.warn('Sync logs table read warning:', error);
      } else if (data) {
        setLogs(data as SyncLog[]);
      }
    } catch (err) {
      console.warn('Fetch sync logs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchSyncLogs();
  }, []);

  // Trigger Manual Sync to Google Drive
  const handleManualSync = async () => {
    setIsSyncing(true);
    setToast({
      message: 'Đang kết nối Vercel API & xuất file Markdown lên Google Drive...',
      type: 'info',
      open: true
    });

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Xuất Google Drive thất bại');
      }

      setToast({
        message: `Xuất thành công! Đã ghi ${result.entries_count || entries.length} nhật ký vào Vault Drive.`,
        type: 'success',
        open: true
      });

      fetchSyncLogs();
      onRefresh();
    } catch (err: any) {
      console.error('Manual sync error:', err);
      setToast({
        message: 'Lỗi đồng bộ: ' + (err.message || 'Kiểm tra cấu hình API Vercel'),
        type: 'error',
        open: true
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Last 5 synced entries preview
  const last5Entries = entries.slice(0, 5);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 pb-28 space-y-5">
      <Toast
        message={toast.message}
        type={toast.type}
        isOpen={toast.open}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Screen Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Quản Trị Đồng Bộ</h2>
          <p className="text-xs text-slate-400">Đồng bộ Google Drive Markdown Vault (Matt Admin)</p>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin Only
        </div>
      </div>

      {/* Sync Card Action */}
      <div className="glass-card rounded-3xl p-6 space-y-4 border border-slate-700/60 shadow-xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center mx-auto text-slate-950 shadow-lg shadow-sky-500/20">
          <HardDrive className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-100">Google Drive Vault Export</h3>
          <p className="text-xs text-slate-400">
            Thư mục Folder ID: <code className="text-sky-400 font-mono text-[11px]">1so41_3Eb...Xo5Xr6</code>
          </p>
        </div>

        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Đang Xuất Google Drive...</span>
            </>
          ) : (
            <>
              <FolderCheck className="w-5 h-5" />
              <span>Kích Hoạt Sync Now</span>
            </>
          )}
        </button>
      </div>

      {/* Sync Logs Table / History */}
      <div className="glass-card rounded-3xl p-5 space-y-3 border border-slate-700/60 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Lịch Sử 5 Lần Sync Gần Nhất
          </h3>
          <button
            onClick={fetchSyncLogs}
            className="p-1 text-slate-400 hover:text-sky-400 transition"
            title="Làm mới log"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingLogs ? (
          <div className="py-4 text-center text-xs text-slate-500">Đang tải lịch sử sync...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">Chưa có lịch sử đồng bộ trong CSDL</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-200">
                      {log.status === 'success' ? `Đồng bộ ${log.entries_count || 0} mục` : 'Thất bại'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(log.synced_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                {log.error_message && (
                  <span className="text-[10px] text-rose-400 max-w-[120px] truncate" title={log.error_message}>
                    {log.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview 5 Synced Entries */}
      <div className="glass-card rounded-3xl p-5 space-y-3 border border-slate-700/60 shadow-xl">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-2">
          5 Nhật Ký Mới Nhất Chuẩn Bị Sync
        </h3>

        {last5Entries.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">Chưa có bản ghi nào.</p>
        ) : (
          <div className="space-y-2">
            {last5Entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2.5 text-xs"
              >
                <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-300 truncate">
                    {entry.transcription || entry.extracted_data?.category || 'Nhật ký không có tiêu đề'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(entry.created_at).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
