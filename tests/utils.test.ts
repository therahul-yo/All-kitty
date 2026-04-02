import { jest } from '@jest/globals';
import { getSemanticError } from '../src/utils';
import { buildYtDlpArgs, cleanupOldFiles } from '../src/server';
import { DownloadRequest } from '../src/types';
import fs from 'fs';

describe('getSemanticError', () => {
    test('matches private video error', () => {
        const stderr = 'ERROR: [youtube] dQw4w9WgXcQ: This video is private';
        expect(getSemanticError(stderr)).toBe('This video is private.');
    });

    test('matches age-restricted error', () => {
        const stderr = 'ERROR: [youtube] dQw4w9WgXcQ: Video is age-restricted and requires sign-in';
        expect(getSemanticError(stderr)).toBe('Age-restricted media requires sign-in.');
    });

    test('matches video unavailable error', () => {
        const stderr = 'ERROR: [youtube] dQw4w9WgXcQ: Video unavailable';
        expect(getSemanticError(stderr)).toBe('Media is unavailable.');
    });

    test('returns default message for unknown errors', () => {
        const stderr = 'Some random error message from yt-dlp';
        expect(getSemanticError(stderr)).toBe('Processing failed. Please check the URL and try again.');
    });
});

describe('buildYtDlpArgs', () => {
    const mockDir = '/tmp/downloads';
    const uuid = 'test-uuid';

    test('builds audio-only args', () => {
        const req: DownloadRequest = {
            url: 'https://youtube.com/watch?v=123',
            format: 'audio',
            quality: '1080',
            codec: 'h264',
            container: 'mp4'
        };
        const args = buildYtDlpArgs(req, uuid, mockDir);
        expect(args).toContain('-x');
        expect(args).toContain('mp3');
    });

    test('builds tiktok specific args', () => {
        const req: DownloadRequest = {
            url: 'https://tiktok.com/@user/video/123',
            format: 'video',
            quality: '1080',
            codec: 'h264',
            container: 'mp4'
        };
        const args = buildYtDlpArgs(req, uuid, mockDir);
        expect(args).toContain('best');
    });

    test('builds twitter specific args', () => {
        const req: DownloadRequest = {
            url: 'https://twitter.com/user/status/123',
            format: 'video',
            quality: '1080',
            codec: 'h264',
            container: 'mp4'
        };
        const args = buildYtDlpArgs(req, uuid, mockDir);
        expect(args).toContain('bestvideo+bestaudio/best');
    });

    test('builds mute video args', () => {
        const req: DownloadRequest = {
            url: 'https://youtube.com/watch?v=123',
            format: 'mute',
            quality: '1080',
            codec: 'h264',
            container: 'mp4'
        };
        const args = buildYtDlpArgs(req, uuid, mockDir);
        expect(args).toContain('bestvideo');
    });

    test('handles max quality', () => {
        const req: DownloadRequest = {
            url: 'https://youtube.com/watch?v=123',
            format: 'video',
            quality: 'max',
            codec: 'h264',
            container: 'mp4'
        };
        const args = buildYtDlpArgs(req, uuid, mockDir);
        const formatStr = args[args.indexOf('-f') + 1];
        expect(formatStr).not.toContain('height<=');
    });
});

describe('cleanupOldFiles', () => {
    test('should not throw when directory reading fails', async () => {
        const readdirSpy = jest.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('Failed') as never);
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await cleanupOldFiles();
        expect(consoleSpy).toHaveBeenCalled();
        
        readdirSpy.mockRestore();
        consoleSpy.mockRestore();
    });
});
