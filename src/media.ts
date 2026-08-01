import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloadRequest } from './types.js';

// yt-dlp appends CLI advice and bug-report boilerplate to its errors. None of it
// means anything to someone looking at a web page, so strip it before the text is
// ever shown.
const NOISE = [
    /[;.]?\s*please report this issue on\s+https?:\/\/\S+[\s\S]*$/i,
    /\.?\s*Confirm you are on the latest version using\s+yt-dlp -U\.?[\s\S]*$/i,
    /\.?\s*Use --cookies[\s\S]*?for how to manually pass cookies\.?/i,
    /\.?\s*Use --cookies(-from-browser)?[^.]*\.?/i,
    /\.?\s*See\s+https:\/\/github\.com\/yt-dlp\/yt-dlp\/wiki\/FAQ\S*\s*[\s\S]*$/i,
    /\s*\(caused by [\s\S]*$/i
];

/**
 * Pull the real failure out of a yt-dlp run. Returns '' when there is nothing
 * quotable, so callers can fall back to their own wording.
 */
export function extractYtDlpError(stderr: string): string {
    const line = stderr
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('ERROR:'))
        .pop();
    if (!line) return '';

    let msg = line.replace(/^ERROR:\s*/, '');
    // "[Instagram] DZ1dcD1v725: Unable to …" — the extractor tag and media id are
    // noise to a reader who already knows which link they pasted. The id is only
    // dropped when it trails a tag, so a bare "Postprocessing: …" keeps its prefix.
    msg = msg.replace(/^\[[^\]]+\]\s*(?:[\w.-]+:\s+)?/, '');
    for (const pattern of NOISE) msg = msg.replace(pattern, '');

    msg = msg.replace(/\s+/g, ' ').trim().replace(/[.,;\s]+$/, '');
    if (msg.length > 220) msg = `${msg.slice(0, 217).trimEnd()}…`;
    return msg;
}

export function getSemanticError(stderr: string): string {
    const errorPatterns = [
        {
            pattern: /Sign in to confirm you[’']re not a bot|confirm.+not a bot/i,
            message: 'YouTube blocked the server IP. Set COOKIES_PATH (cookies.txt from a logged-in browser) or PROXY_URL on the host.'
        },
        // Instagram serves almost nothing to logged-out datacentre IPs. These come
        // before the generic auth patterns below so the advice names the right site.
        {
            pattern: /Instagram sent an empty media response/i,
            message: 'Instagram would not serve this post to a logged-out visitor. Set COOKIES_PATH on the host with cookies.txt exported from a signed-in instagram.com session.'
        },
        {
            pattern: /exceeded the rate-limit for accessing posts anonymously|redirected to the login page/i,
            message: 'Instagram is rate-limiting anonymous requests from this server. Wait a few minutes, or set COOKIES_PATH / PROXY_URL on the host.'
        },
        {
            pattern: /only available for registered users who follow this account/i,
            message: 'This Instagram post is from a private account. Only a signed-in follower can fetch it — set COOKIES_PATH on the host.'
        },
        {
            pattern: /Instagram account cookies are no longer valid/i,
            message: 'The Instagram cookies on the host have expired. Export a fresh cookies.txt and update COOKIES_PATH.'
        },
        { pattern: /There is no video in this post/i, message: 'That Instagram post has no video in it.' },
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

    // Nothing matched. Say what actually went wrong rather than "check the URL",
    // which sends people to re-paste a link that was never the problem.
    return extractYtDlpError(stderr) || 'Processing failed. Please check the URL and try again.';
}

export function buildYtDlpArgs(body: DownloadRequest, uuid: string, downloadsDir: string): string[] {
    const { url, format, quality, codec, container } = body;
    const outputFileTemplate = path.join(downloadsDir, `${uuid}.%(ext)s`);
    const isTwitter = /twitter\.com|x\.com/.test(url);
    const isYoutube = /youtube\.com|youtu\.be/.test(url);
    const isInstagram = /instagram\.com/.test(url);

    let args = [
        '--no-playlist',
        '--no-warnings',
        '-o', outputFileTemplate,
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

    // Instagram's extractor impersonates a browser, which picks a matching
    // User-Agent for the TLS fingerprint it presents. Pinning a stale Chrome 121
    // string on top of that is the exact mismatch its anti-bot checks look for, so
    // let yt-dlp set the header itself there.
    if (!isInstagram) {
        args.push(
            '--user-agent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        );
    }

    if (isTwitter) {
        args.push('--referer', 'https://x.com/');
    } else if (isYoutube) {
        args.push('--referer', 'https://www.youtube.com/');
    } else if (isInstagram) {
        args.push('--referer', 'https://www.instagram.com/');
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
