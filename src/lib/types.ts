export interface ExtractedData {
  category: string;
  materials: Array<{
    item: string;
    quantity?: string;
    unit?: string;
    note?: string;
  }>;
  labor: Array<{
    role: string;
    count?: number;
    hours?: string;
    note?: string;
  }>;
  confidence_score: number; // 0.0 - 1.0
  summary_vi?: string;
}

export type EntryStatus = 'draft' | 'filed' | 'archived';

export interface DiaryEntry {
  id: string;
  created_by?: string | null;
  created_at: string;
  voice_url?: string | null;
  photo_url?: string | null;
  transcription?: string | null;
  extracted_data?: ExtractedData | null;
  status: EntryStatus;
  submitted_at?: string | null;
  // Local transient fields
  is_pending_sync?: boolean;
}

export interface SyncLog {
  id: string;
  synced_at: string;
  entries_count: number;
  google_drive_file_id?: string | null;
  status: 'success' | 'failed' | 'partial';
  error_message?: string | null;
}

export interface OfflineEntry {
  id: string;
  createdAt: string;
  voiceBlobBase64?: string;
  photoBlobBase64?: string;
  audioMimeType?: string;
  photoMimeType?: string;
  retryCount: number;
}
