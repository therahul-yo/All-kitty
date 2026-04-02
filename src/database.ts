import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../downloads.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    format TEXT,
    filename TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_size INTEGER
  )
`);

export interface DownloadRecord {
  id: string;
  url: string;
  format?: string;
  filename?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileSize?: number;
}

export function saveDownload(record: DownloadRecord) {
  const stmt = db.prepare(`
    INSERT INTO downloads (id, url, format, filename, status, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      filename = COALESCE(excluded.filename, downloads.filename),
      file_size = COALESCE(excluded.file_size, downloads.file_size)
  `);
  stmt.run(record.id, record.url, record.format, record.filename, record.status, record.fileSize);
}

export function getRecentDownloads(limit = 10): any[] {
  return db.prepare('SELECT * FROM downloads ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function updateDownloadStatus(id: string, status: string, filename?: string, fileSize?: number) {
    const stmt = db.prepare(`
        UPDATE downloads 
        SET status = ?, filename = COALESCE(?, filename), file_size = COALESCE(?, file_size)
        WHERE id = ?
    `);
    stmt.run(status, filename || null, fileSize || null, id);
}
