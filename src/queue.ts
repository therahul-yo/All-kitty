import Queue from 'bull';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DownloadRequest } from './types.js';
import { buildYtDlpArgs, getSemanticError } from './media.js';
import { updateDownloadStatus } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';
const FILE_PREFIX = process.env.FILE_PREFIX || 'allkitty';
const downloadsDir = path.resolve(__dirname, '../public/downloads');

const downloadQueue = new Queue('downloads', process.env.REDIS_URL || 'redis://localhost:6379', {
  redis: {
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
});

downloadQueue.on('error', (err) => {
    console.error('[QUEUE ERROR]', err.message);
});

downloadQueue.process((job) => {
    const { id, data } = job;
    const uuid = id as string;
    const req = data as DownloadRequest;

    updateDownloadStatus(uuid, 'processing');

    const args = buildYtDlpArgs(req, uuid, downloadsDir);
    args.push(req.url);

    return new Promise<any>((resolve, reject) => {
        const ytDlpProcess = spawn(YT_DLP_PATH, args);
        let errorOutput = '';

        ytDlpProcess.stderr.on('data', (data) => errorOutput += data.toString());

        ytDlpProcess.on('close', async (code) => {
            if (code !== 0) {
                const error = getSemanticError(errorOutput);
                updateDownloadStatus(uuid, 'failed');
                return reject(new Error(error));
            }

            try {
                const files = await fs.promises.readdir(downloadsDir);
                const matchingFile = files.find(f => f.startsWith(uuid));
                if (matchingFile) {
                    const ext = path.extname(matchingFile);
                    const stats = await fs.promises.stat(path.join(downloadsDir, matchingFile));
                    updateDownloadStatus(uuid, 'completed', `${FILE_PREFIX}${ext}`, stats.size);
                    return resolve({
                        success: true,
                        downloadUrl: `/downloads/${matchingFile}`,
                        filename: `${FILE_PREFIX}${ext}`
                    });
                }
                throw new Error('File missing');
            } catch (err) {
                updateDownloadStatus(uuid, 'failed');
                return reject(new Error('Save failed.'));
            }
        });
    });
});

export async function addToQueue(uuid: string, data: DownloadRequest): Promise<string> {
    const job = await downloadQueue.add(data, { jobId: uuid });
    return job.id as string;
}

export async function getQueueStatus() {
    const [waiting, active, completed, failed] = await Promise.all([
        downloadQueue.getWaitingCount(),
        downloadQueue.getActiveCount(),
        downloadQueue.getCompletedCount(),
        downloadQueue.getFailedCount()
    ]);
    return { waiting, active, completed, failed };
}

export async function getJobStatus(jobId: string) {
    const job = await downloadQueue.getJob(jobId);
    if (!job) return null;
    
    const state = await job.getState();
    return {
        id: job.id,
        state,
        progress: job.progress(),
        result: job.returnvalue,
        failedReason: job.failedReason
    };
}

export { downloadQueue };
