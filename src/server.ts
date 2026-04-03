import express, { Request, Response, NextFunction } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { DownloadRequest, DownloadResponse, ActiveProcess } from './types.js';
import { getSemanticError, buildYtDlpArgs } from './media.js';
import { DownloadSchema } from './validators.js';
import { saveDownload, getRecentDownloads, updateDownloadStatus } from './database.js';
import { addToQueue, getQueueStatus, getJobStatus, downloadQueue } from './queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Enable trusting proxy headers for Render
const PORT = process.env.PORT || 3000;
const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL || '900000');
const MAX_FILE_AGE = parseInt(process.env.MAX_FILE_AGE || '3600000');
const FILE_PREFIX = process.env.FILE_PREFIX || 'allkitty';

const activeProcesses = new Map<string, ActiveProcess>();

// Security Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "https:"],
            "script-src": ["'self'", "'unsafe-inline'"],
        },
    },
}));

const downloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: { error: 'Too many downloads, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json());
app.use(express.static('public'));

const downloadsDir = path.resolve(__dirname, '../public/downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

const cleanupOldFiles = async () => {
    try {
        const files = await fs.promises.readdir(downloadsDir);
        const now = Date.now();
        let count = 0;
        for (const file of files) {
            if (file === '.gitkeep') continue;
            const filePath = path.join(downloadsDir, file);
            try {
                const stats = await fs.promises.stat(filePath);
                if (now - stats.mtime.getTime() > MAX_FILE_AGE) {
                    await fs.promises.unlink(filePath);
                    count++;
                }
            } catch (err: any) {
                console.error(`[CLEANUP] Error processing ${file}:`, err.message);
            }
        }
        if (count > 0) console.log(`[CLEANUP] Purged ${count} old files.`);
    } catch (err: any) {
        console.error('[CLEANUP] Error reading downloads dir:', err.message);
    }
};

const cleanupInterval = setInterval(cleanupOldFiles, CLEANUP_INTERVAL);
if (process.env.NODE_ENV === 'test') {
    cleanupInterval.unref();
}

app.get('/api/health', async (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        downloadsDir: downloadsDir,
        queue: await getQueueStatus()
    });
});

app.get('/api/history', (req: Request, res: Response) => {
    const limitStr = req.query.limit;
    const limit = typeof limitStr === 'string' ? parseInt(limitStr) : 10;
    res.json(getRecentDownloads(isNaN(limit) ? 10 : limit));
});

app.get('/api/queue/status', async (req: Request, res: Response) => {
    res.json(await getQueueStatus());
});

app.get('/api/queue/:jobId', async (req: Request, res: Response) => {
    const jobId = req.params.jobId as string;
    const status = await getJobStatus(jobId);
    if (!status) return res.status(404).json({ error: 'Job not found.' });
    res.json(status);
});

app.post('/api/cancel', async (req: Request, res: Response) => {
    const { uuid } = req.body;
    if (!uuid) return res.status(400).json({ error: 'UUID is required.' });

    // Cancel Bull job if it exists
    const job = await downloadQueue.getJob(uuid);
    if (job) {
        await job.remove();
        updateDownloadStatus(uuid, 'failed');
        console.log(`[CANCEL] Job ${uuid} removed from queue.`);
        return res.json({ success: true });
    }

    // fallback to legacy process map if needed (though queue handles most now)
    if (activeProcesses.has(uuid)) {
        const active = activeProcesses.get(uuid)!;
        active.process.kill('SIGKILL');
        activeProcesses.delete(uuid);
        updateDownloadStatus(uuid, 'failed');
        return res.json({ success: true });
    }

    res.status(404).json({ error: 'Process not found.' });
});

app.post('/api/download', downloadLimiter, async (req: Request, res: Response) => {
    // Input Validation with Zod
    const validation = DownloadSchema.safeParse(req.body);
    if (!validation.success) {
        const errorMsg = validation.error.issues.map(i => i.message).join(', ');
        return res.status(400).json({ 
            success: false, 
            error: errorMsg
        });
    }

    const { url, format } = validation.data;
    const uuid = crypto.randomUUID();
    
    // Initial save
    saveDownload({
        id: uuid,
        url,
        format,
        status: 'pending'
    });

    // Add to background queue
    try {
        await addToQueue(uuid, validation.data as DownloadRequest);
        res.json({ success: true, jobId: uuid });
    } catch (err: any) {
        updateDownloadStatus(uuid, 'failed');
        res.status(500).json({ success: false, error: 'Failed to queue job.' });
    }
});

export { app, cleanupOldFiles };

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`[SERVER] AllKitty ready on port ${PORT}`));
}
