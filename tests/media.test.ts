import { getSemanticError, extractYtDlpError, buildYtDlpArgs } from '../src/media';
import { DownloadRequest } from '../src/types';

// Verbatim stderr from yt-dlp 2026.07.04. Paraphrasing these defeats the point:
// the patterns exist to match what the tool really prints.
const IG_EMPTY_RESPONSE =
    'ERROR: [Instagram] DZ1dcD1v725: Instagram sent an empty media response. Check if this post is ' +
    'accessible in your browser without being logged-in. If it is not, then use --cookies-from-browser ' +
    'or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  ' +
    'for how to manually pass cookies. Otherwise, if the post is accessible in browser without being ' +
    'logged-in, please report this issue on  https://github.com/yt-dlp/yt-dlp/issues?q=  , filling out ' +
    'the appropriate issue template.';

const IG_RATE_LIMIT =
    'ERROR: [Instagram] DZ1dcD1v725: The webpage request was redirected to the login page. You have ' +
    'exceeded the rate-limit for accessing posts anonymously. Use --cookies-from-browser or --cookies ' +
    'for the authentication.';

const IG_PRIVATE =
    'ERROR: [Instagram] DZ1dcD1v725: This content is only available for registered users who follow ' +
    'this account. Use --cookies-from-browser or --cookies for the authentication.';

describe('getSemanticError', () => {
    test('names Instagram, not the URL, when the post is walled off', () => {
        const msg = getSemanticError(IG_EMPTY_RESPONSE);
        expect(msg).toContain('Instagram');
        expect(msg).toContain('COOKIES_PATH');
        expect(msg).not.toContain('check the URL');
    });

    test('distinguishes anonymous rate-limiting from a private account', () => {
        expect(getSemanticError(IG_RATE_LIMIT)).toContain('rate-limiting');
        expect(getSemanticError(IG_PRIVATE)).toContain('private account');
    });

    test('still recognises the YouTube bot wall', () => {
        const msg = getSemanticError("ERROR: [youtube] abc: Sign in to confirm you’re not a bot.");
        expect(msg).toContain('YouTube');
    });

    test('quotes the real error rather than blaming the URL', () => {
        const msg = getSemanticError('ERROR: [generic] DZ1dcD1v725: ffmpeg exited with code 1');
        expect(msg).toBe('ffmpeg exited with code 1');
    });

    test('keeps a leading word that is a label, not a media id', () => {
        expect(getSemanticError('ERROR: Postprocessing: Error opening output files')).toBe(
            'Postprocessing: Error opening output files'
        );
    });

    test('falls back to generic wording when stderr has no ERROR line', () => {
        expect(getSemanticError('[download] 12% of 4MiB')).toBe(
            'Processing failed. Please check the URL and try again.'
        );
    });
});

describe('extractYtDlpError', () => {
    test('drops the extractor tag, media id and bug-report boilerplate', () => {
        const raw =
            'ERROR: [Instagram] DZ1dcD1v725: Unable to download webpage: <urlopen error timed out>; ' +
            'please report this issue on  https://github.com/yt-dlp/yt-dlp/issues?q=  , filling out the ' +
            'appropriate issue template. Confirm you are on the latest version using  yt-dlp -U';
        expect(extractYtDlpError(raw)).toBe('Unable to download webpage: <urlopen error timed out>');
    });

    test('never leaks CLI flags at a web reader', () => {
        expect(extractYtDlpError(IG_PRIVATE)).not.toMatch(/--cookies/);
    });

    test('reports the last error when yt-dlp printed several', () => {
        const raw = ['ERROR: first thing broke', '[debug] retrying', 'ERROR: second thing broke'].join('\n');
        expect(extractYtDlpError(raw)).toBe('second thing broke');
    });

    test('caps runaway output', () => {
        const msg = extractYtDlpError(`ERROR: ${'x'.repeat(500)}`);
        expect(msg.length).toBeLessThanOrEqual(220);
        expect(msg.endsWith('…')).toBe(true);
    });

    test('returns empty string when there is nothing to quote', () => {
        expect(extractYtDlpError('')).toBe('');
        expect(extractYtDlpError('[download] Destination: a.mp4')).toBe('');
    });
});

describe('buildYtDlpArgs', () => {
    const base: DownloadRequest = { url: '', format: 'video', quality: 'max' } as DownloadRequest;

    test('sends an instagram.com referer for Instagram links', () => {
        const args = buildYtDlpArgs({ ...base, url: 'https://www.instagram.com/reel/DZ1dcD1v725/' }, 'u', '/tmp');
        expect(args[args.indexOf('--referer') + 1]).toBe('https://www.instagram.com/');
    });

    test('lets yt-dlp pick the User-Agent for Instagram, but pins it elsewhere', () => {
        const ig = buildYtDlpArgs({ ...base, url: 'https://www.instagram.com/reel/DZ1dcD1v725/' }, 'u', '/tmp');
        expect(ig).not.toContain('--user-agent');

        const yt = buildYtDlpArgs({ ...base, url: 'https://youtu.be/abc' }, 'u', '/tmp');
        expect(yt[yt.indexOf('--user-agent') + 1]).toMatch(/^Mozilla\/5\.0/);
    });

    test('leaves the existing Twitter and YouTube referers alone', () => {
        const tw = buildYtDlpArgs({ ...base, url: 'https://x.com/i/status/1' }, 'u', '/tmp');
        expect(tw[tw.indexOf('--referer') + 1]).toBe('https://x.com/');

        const yt = buildYtDlpArgs({ ...base, url: 'https://youtu.be/abc' }, 'u', '/tmp');
        expect(yt[yt.indexOf('--referer') + 1]).toBe('https://www.youtube.com/');
    });
});
