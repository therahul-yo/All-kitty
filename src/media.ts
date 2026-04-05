import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloadRequest } from './types.js';

export function getSemanticError(stderr: string): string {
    const errorPatterns = [
        { 
            pattern: /Sign in to confirm you’re not a bot/i, 
            message: 'YouTube anti-bot detection triggered. Please try a clean link without tracking (remove ?si=...) or provide a cookies.txt file.' 
        },
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

export function buildYtDlpArgs(body: DownloadRequest, uuid: string, downloadsDir: string): string[] {
    const { url, format, quality, codec, container } = body;
    const outputFileTemplate = path.join(downloadsDir, `${uuid}.%(ext)s`);
    let args = [
        '--no-playlist', 
        '--no-warnings', 
        '-o', outputFileTemplate,
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        '--add-header', 'Accept-Language: en-US,en;q=0.9',
        '--referer', 'https://www.youtube.com/',
        '--geo-bypass',
        '--sleep-requests', '1',
        '--no-check-certificate',
        '--prefer-free-formats'
    ];

    if (process.env.COOKIES_PATH && fs.existsSync(process.env.COOKIES_PATH)) {
        args.push('--cookies', process.env.COOKIES_PATH);
    }

    const isTikTok = /tiktok\.com/.test(url);
    const isTwitter = /twitter\.com|x\.com/.test(url);
    const isYoutube = /youtube\.com|youtu\.be/.test(url);

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
    
    let heightLimit = '';
    if (quality && quality !== 'max') {
        const res = quality.replace('p', '');
        if (!isNaN(parseInt(res))) heightLimit = `[height<=${res}]`;
    }

    let formatStr = '';
    if (isYoutube) {
        formatStr = `bestvideo${heightLimit}+bestaudio/best${heightLimit}`;
    } else {
        formatStr = `bestvideo${heightLimit}+bestaudio/best`;
    }
    
    args.push('-f', formatStr);
    args.push('--merge-output-format', preferredContainer);

    return args;
}
