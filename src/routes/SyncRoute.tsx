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
          <h2 className="text-xl font-bold text-ink tracking-tight">Quản Trị Đồng Bộ</h2>
          <p className="text-xs text-ink-soft">Đồng bộ Google Drive Markdown Vault (Matt Admin)</p>
        </div>

        <div className="pill px-2 py-1 bg-warning-soft text-warning border border-ink">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin Only
        </div>
      </div>

      {/* Sync Card Action */}
      <div className="card p-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-[0.9rem] bg-ink flex items-center justify-center mx-auto text-paper">
          <HardDrive className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-ink">Google Drive Vault Export</h3>
          <p className="text-xs text-ink-soft">
            Thư mục Folder ID: <code className="text-ink font-mono text-[11px] bg-card-alt border border-ink/30 px-1 rounded">1so41_3Eb...Xo5Xr6</code>
          </p>
        </div>

        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="btn-primary w-full py-3.5 text-sm active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-ink/15 pb-2">
          <h3 className="label-micro text-ink">
            Lịch Sử 5 Lần Sync Gần Nhất
          </h3>
          <button
            onClick={fetchSyncLogs}
            className="p-1 text-ink-soft hover:text-ink transition"
            title="Làm mới log"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingLogs ? (
          <div className="py-4 text-center text-xs text-ink-soft">Đang tải lịch sử sync...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-xs text-ink-soft">Chưa có lịch sử đồng bộ trong CSDL</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-[0.7rem] bg-card-alt border border-ink flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-positive shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-danger shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-ink">
                      {log.status === 'success' ? `Đồng bộ ${log.entries_count || 0} mục` : 'Thất bại'}
                    </p>
                    <p className="text-[10px] text-ink-faint">
                      {new Date(log.synced_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                {log.error_message && (
                  <span className="text-[10px] text-danger max-w-[120px] truncate" title={log.error_message}>
                    {log.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview 5 Synced Entries */}
      <div className="card p-5 space-y-3">
        <h3 className="label-micro text-ink border-b border-ink/15 pb-2">
          5 Nhật Ký Mới Nhất Chuẩn Bị Sync
        </h3>

        {last5Entries.length === 0 ? (
          <p className="text-xs text-ink-soft py-2">Chưa có bản ghi nào.</p>
        ) : (
          <div className="space-y-2">
            {last5Entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-[0.7rem] bg-card-alt border border-ink/40 flex items-center gap-2.5 text-xs"
              >
                <FileText className="w-4 h-4 text-ink-soft shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">
                    {entry.transcription || entry.extracted_data?.category || 'Nhật ký không có tiêu đề'}
                  </p>
                  <p className="text-[10px] text-ink-faint">
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
