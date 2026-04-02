import { z } from 'zod';

export const DownloadSchema = z.object({
  url: z.string().url('Invalid URL format'),
  format: z.enum(['video', 'audio', 'mute']).default('video'),
  quality: z.enum(['1080', '1440', '2160', 'max']).default('1080'),
  codec: z.enum(['h264', 'av1', 'vp9']).default('h264'),
  container: z.enum(['mp4', 'webm', 'auto']).default('auto'),
});

export type DownloadRequestSchema = z.infer<typeof DownloadSchema>;
