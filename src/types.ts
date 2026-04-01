import { ChildProcess } from 'child_process';

export interface DownloadRequest {
  url: string;
  format: 'video' | 'audio' | 'mute';
  quality: string;
  codec: string;
  container: string;
}

export interface DownloadResponse {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  error?: string;
  uuid?: string;
}

export interface ActiveProcess {
  process: ChildProcess;
  timestamp: number;
}
