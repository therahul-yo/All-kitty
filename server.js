const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 15 * 60 * 1000; // 15 mins
const MAX_FILE_AGE = parseInt(process.env.MAX_FILE_AGE) || 60 * 60 * 1000; // 1 hour

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create downloads directory
const downloadsDir = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Cleanup job: Remove files older than MAX_FILE_AGE
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
            } catch (err) {
                console.error(`[CLEANUP] Error processing ${file}:`, err.message);
            }
        }
        if (count > 0) console.log(`[CLEANUP] Purged ${count} old files.`);
    } catch (err) {
        console.error('[CLEANUP] Error reading downloads dir:', err.message);
    }
};

setInterval(cleanupOldFiles, CLEANUP_INTERVAL);
cleanupOldFiles(); // Run on startup

/**
 * Build yt-dlp arguments based on request body
 */
function buildYtDlpArgs(body, uuid, downloadsDir) {
    const { url, format, quality, codec, container } = body;
    const outputFileTemplate = path.join(downloadsDir, `${uuid}.%(ext)s`);
    let args = [
        '--no-playlist',
        '--no-warnings',
        '-o', outputFileTemplate
    ];

    // Platform-specific optimizations
    const isTikTok = /tiktok\.com/.test(url);
    const isTwitter = /twitter\.com|x\.com/.test(url);

    // 1. Audio-only mode
    if (format === 'audio') {
        args.push('-x', '--audio-format', 'mp3');
        return args;
    }

    // 2. Muted video mode (video only)
    if (format === 'mute') {
        args.push('-f', 'bestvideo');
        return args;
    }

    // 3. Platform-specific defaults
    if (isTikTok) {
        args.push('-f', 'best');
        return args;
    }

    if (isTwitter) {
        args.push('-f', 'bestvideo+bestaudio/best');
        return args;
    }

    // 4. Advanced format selection (mostly for YouTube)
    const preferredContainer = container && container !== 'auto' ? container : 'mp4';
    const extFilter = container && container !== 'auto' ? `[ext=${container}]` : '';
    
    let heightLimit = '';
    if (quality && quality !== '8k+') {
        const res = quality.replace('p', '');
        if (!isNaN(res)) heightLimit = `[height<=${res}]`;
    }

    let vcodecFilter = '';
    if (codec === 'h264') vcodecFilter = '[vcodec^=avc1]';
    else if (codec === 'av1') vcodecFilter = '[vcodec^=av01]';
    else if (codec === 'vp9') vcodecFilter = '[vcodec^=vp9]';

    // Complex format string: (video + audio) OR (best video) OR (best)
    const formatStr = `bestvideo${heightLimit}${vcodecFilter}${extFilter}+bestaudio[ext=m4a]/bestvideo${heightLimit}${vcodecFilter}${extFilter}+bestaudio/best${heightLimit}${extFilter}/best`;
    
    args.push('-f', formatStr);
    args.push('--merge-output-format', preferredContainer);

    return args;
}

/**
 * Get semantic error message from yt-dlp stderr
 */
function getSemanticError(stderr) {
    const errorPatterns = [
        { pattern: /Sign in to confirm you’re not a bot/i, message: 'Anti-bot detection triggered. Use a different link or try again.' },
        { pattern: /This video is private/i, message: 'This video is private.' },
        { pattern: /Video unavailable/i, message: 'Media is unavailable.' },
        { pattern: /Incomplete YouTube ID/i, message: 'Invalid URL provided.' },
        { pattern: /Unsupported URL/i, message: 'This platform is not supported.' },
        { pattern: /HTTP Error 403/i, message: 'Access denied (403). Try later.' },
        { pattern: /HTTP Error 404/i, message: 'Media not found (404).' },
        { pattern: /Video is age-restricted/i, message: 'Age-restricted media requires sign-in.' },
        { pattern: /Premium/i, message: 'This content requires a premium account.' }
    ];

    for (const { pattern, message } of errorPatterns) {
        if (pattern.test(stderr)) return message;
    }
    return 'Processing failed. Please check the URL and try again.';
}

app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({ error: 'A valid URL is required.' });
    }

    const uuid = crypto.randomUUID();
    const args = buildYtDlpArgs(req.body, uuid, downloadsDir);
    args.push(url);

    console.log(`[PROCESS] ID: ${uuid} | URL: ${url}`);
    
    const ytDlpProcess = spawn(YT_DLP_PATH, args);
    let errorOutput = '';

    ytDlpProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    ytDlpProcess.on('close', async (code) => {
        if (code !== 0) {
            console.error(`[ERROR] ID: ${uuid} | Code: ${code} | Msg: ${errorOutput.split('\n')[0]}`);
            return res.status(500).json({ error: getSemanticError(errorOutput) });
        }

        // Search for the output file (extension might vary)
        try {
            const files = await fs.promises.readdir(downloadsDir);
            const matchingFile = files.find(f => f.startsWith(uuid));

            if (matchingFile) {
                const ext = path.extname(matchingFile);
                console.log(`[SUCCESS] ID: ${uuid} | File: ${matchingFile}`);
                return res.json({ 
                    success: true, 
                    downloadUrl: `/downloads/${matchingFile}`,
                    filename: `kittypoop${ext}`
                });
            }
            
            throw new Error('File not found after successful process');
        } catch (err) {
            console.error(`[FAIL] ID: ${uuid} | ${err.message}`);
            return res.status(500).json({ error: 'Download failed to save. Please try again.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`[SERVER] AllKitty Media Engine ready on http://localhost:${PORT}`);
});
