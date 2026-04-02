import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloadRequest } from './types.js';

export function getSemanticError(stderr: string): string {
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

export function buildYtDlpArgs(body: DownloadRequest, uuid: string, downloadsDir: string): string[] {
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
