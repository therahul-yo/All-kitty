export function getSemanticError(stderr) {
    const errorPatterns = [
        { pattern: /Sign in to confirm you’re not a bot/i, message: 'Anti-bot detection triggered. Use a different link or try again.' },
        { pattern: /This video is private/i, message: 'This video is private.' },
        { pattern: /Video unavailable/i, message: 'Media is unavailable.' },
        { pattern: /Incomplete YouTube ID/i, message: 'Invalid URL provided.' },
        { pattern: /Unsupported URL/i, message: 'This platform is not supported.' },
        { pattern: /HTTP Error 403/i, message: 'Access denied (403). Try later.' },
        { pattern: /HTTP Error 404/i, message: 'Media not found (404).' },
        { pattern: /Video is age-restricted/i, message: 'Video is age-restricted and requires sign-in.' },
        { pattern: /Premium/i, message: 'This content requires a premium account.' }
    ];
    for (const { pattern, message } of errorPatterns) {
        if (pattern.test(stderr))
            return message;
    }
    return 'Processing failed. Please check the URL and try again.';
}
