import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloadRequest } from './types.js';

export function getSemanticError(stderr: string): string {
    const errorPatterns = [
        {
            pattern: /Sign in to confirm you[’']re not a bot|confirm.+not a bot/i,
            message: 'YouTube blocked the server IP. Set COOKIES_PATH (cookies.txt from a logged-in browser) or PROXY_URL on the host.'
        },
        {
            pattern: /NSFW tweet requires authentication|tweet requires.+log[- ]?in|requires authentication/i,
            message: 'Twitter/X requires login. Set COOKIES_PATH on the host with cookies.txt exported from x.com.'
        },
        { pattern: /No video could be found in this tweet/i, message: 'No video found in this tweet.' },
        { pattern: /This video is private/i, message: 'This video is private.' },
        { pattern: /Video unavailable/i, message: 'Media is unavailable.' },
        { pattern: /Incomplete YouTube ID/i, message: 'Invalid URL provided.' },
        { pattern: /Unsupported URL/i, message: 'This platform is not supported.' },
        { pattern: /HTTP Error 429|Too Many Requests/i, message: 'Rate-limited. Wait a minute and retry.' },
        { pattern: /HTTP Error 403/i, message: 'Access denied (403). The platform may be blocking the server IP — try cookies/proxy.' },
        { pattern: /HTTP Error 404/i, message: 'Media not found (404).' },
        { pattern: /Video is age-restricted|age[- ]restricted/i, message: 'Age-restricted media — provide cookies.txt from a signed-in account.' },
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
        '--geo-bypass',
        '--force-ipv4',
        '--sleep-requests', '1',
        '--retries', '5',
        '--fragment-retries', '5',
        '--extractor-retries', '3',
        '--no-check-certificate',
        '--extractor-args', 'youtube:player_client=tv_simply,mweb,ios,android,web_safari,web'
    ];

    const isTwitter = /twitter\.com|x\.com/.test(url);
    const isYoutube = /youtube\.com|youtu\.be/.test(url);
    if (isTwitter) {
        args.push('--referer', 'https://x.com/');
    } else if (isYoutube) {
        args.push('--referer', 'https://www.youtube.com/');
    }

    if (process.env.COOKIES_PATH && fs.existsSync(process.env.COOKIES_PATH)) {
        args.push('--cookies', process.env.COOKIES_PATH);
    }

    if (process.env.PROXY_URL) {
        args.push('--proxy', process.env.PROXY_URL);
    }

    if (format === 'audio') {
        args.push('-x', '--audio-format', 'mp3', '-f', 'bestaudio/best');
        return args;
    }

    if (format === 'mute') {
        args.push('-f', 'bestvideo/best');
        return args;
    }

    let heightLimit = '';
    if (quality && quality !== 'max') {
        const res = quality.replace('p', '');
        if (!isNaN(parseInt(res))) heightLimit = `[height<=${res}]`;
    }

    const formatStr = heightLimit
        ? `bestvideo${heightLimit}+bestaudio/best${heightLimit}/bestvideo+bestaudio/best`
        : `bestvideo+bestaudio/best`;

    args.push('-f', formatStr);

    const preferredContainer = container && container !== 'auto' ? container : 'mp4';
    args.push('--merge-output-format', preferredContainer);

    return args;
}
