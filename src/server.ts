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
import { getSemanticError } from './utils.js';
import { DownloadSchema } from './validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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
            "script-src": ["'self'", "'unsafe-inline'"], // Needed for simple vanilla JS interactions
        },
    },
}));

const downloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: { error: 'Too many downloads, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
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

setInterval(cleanupOldFiles, CLEANUP_INTERVAL);

function buildYtDlpArgs(body: DownloadRequest, uuid: string, downloadsDir: string): string[] {
    const { url, format, quality, codec, container } = body;
    const outputFileTemplate = path.join(downloadsDir, `${uuid}.%(ext)s`);
    let args = ['--no-playlist', '--no-warnings', '-o', outputFileTemplate];

    const isTikTok = /tiktok\.com/.test(url);
    const isTwitter = /twitter\.com|x\.com/.test(url);

    if (format === 'audio') {
        args.push('-x', '--audio-format', 'mp3');
        return args;
    }

    if (format === 'mute') {
        args.push('-f', 'bestvideo');
        return args;
    }

    if (isTikTok) {
        args.push('-f', 'best');
        return args;
    }

    if (isTwitter) {
        args.push('-f', 'bestvideo+bestaudio/best');
        return args;
    }

    const preferredContainer = container && container !== 'auto' ? container : 'mp4';
    const extFilter = container && container !== 'auto' ? `[ext=${container}]` : '';
    
    let heightLimit = '';
    if (quality && quality !== 'max') {
        const res = quality.replace('p', '');
        if (!isNaN(parseInt(res))) heightLimit = `[height<=${res}]`;
    }

    let vcodecFilter = '';
    if (codec === 'h264') vcodecFilter = '[vcodec^=avc1]';
    else if (codec === 'av1') vcodecFilter = '[vcodec^=av01]';
    else if (codec === 'vp9') vcodecFilter = '[vcodec^=vp9]';

    const formatStr = `bestvideo${heightLimit}${vcodecFilter}${extFilter}+bestaudio[ext=m4a]/bestvideo${heightLimit}${vcodecFilter}${extFilter}+bestaudio/best${heightLimit}${extFilter}/best`;
    
    args.push('-f', formatStr);
    args.push('--merge-output-format', preferredContainer);

    return args;
}

app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        downloadsDir: downloadsDir,
        activeProcesses: activeProcesses.size
    });
});

app.post('/api/cancel', (req: Request, res: Response) => {
    const { uuid } = req.body;
    if (uuid && activeProcesses.has(uuid)) {
        const active = activeProcesses.get(uuid)!;
        active.process.kill('SIGKILL');
        activeProcesses.delete(uuid);
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Process not found.' });
});

app.post('/api/download', downloadLimiter, async (req: Request, res: Response) => {
    let responseSent = false;

    const sendResponse = (status: number, data: DownloadResponse) => {
        if (responseSent) return;
        responseSent = true;
        res.status(status).json(data);
    };

    // Input Validation with Zod
    const validation = DownloadSchema.safeParse(req.body);
    if (!validation.success) {
        return sendResponse(400, { 
            success: false, 
            error: validation.error.errors.map(e => e.message).join(', ') 
        });
    }

    const { url } = validation.data;
    const uuid = crypto.randomUUID();
    const args = buildYtDlpArgs(validation.data as DownloadRequest, uuid, downloadsDir);
    args.push(url);

    const ytDlpProcess = spawn(YT_DLP_PATH, args);
    activeProcesses.set(uuid, { process: ytDlpProcess, timestamp: Date.now() });

    let errorOutput = '';
    ytDlpProcess.stderr.on('data', (data) => errorOutput += data.toString());

    ytDlpProcess.on('close', async (code) => {
        activeProcesses.delete(uuid);
        if (code !== 0) {
            return sendResponse(500, { success: false, error: getSemanticError(errorOutput) });
        }

        try {
            const files = await fs.promises.readdir(downloadsDir);
            const matchingFile = files.find(f => f.startsWith(uuid));
            if (matchingFile) {
                const ext = path.extname(matchingFile);
                return sendResponse(200, { 
                    success: true, 
                    downloadUrl: `/downloads/${matchingFile}`,
                    filename: `${FILE_PREFIX}${ext}`,
                    uuid
                });
            }
            throw new Error('File missing');
        } catch (err) {
            return sendResponse(500, { success: false, error: 'Save failed.' });
        }
    });

    req.on('close', () => {
        if (!responseSent && activeProcesses.has(uuid)) {
            activeProcesses.get(uuid)!.process.kill('SIGKILL');
            activeProcesses.delete(uuid);
        }
    });
});

app.listen(PORT, () => console.log(`[SERVER] AllKitty ready on port ${PORT}`));
