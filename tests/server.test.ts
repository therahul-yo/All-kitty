import request from 'supertest';
import { app } from '../src/server';
import { jest } from '@jest/globals';

describe('API Endpoints', () => {
    describe('GET /api/health', () => {
        test('should return health status', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'healthy');
        }, 30000);
    });

    describe('POST /api/download', () => {
        test('should return 400 for missing body', async () => {
            const res = await request(app).post('/api/download').send({});
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('success', false);
        }, 30000);

        test('should return 400 for invalid URL', async () => {
            const res = await request(app).post('/api/download').send({ url: 'not-a-url' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        }, 30000);

        test('should return 400 for non-http protocols', async () => {
            const res = await request(app).post('/api/download').send({ url: 'ftp://example.com' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Only HTTP and HTTPS');
        }, 30000);

        test('should return 400 for invalid format', async () => {
            const res = await request(app).post('/api/download').send({ 
                url: 'https://youtube.com/watch?v=123',
                format: 'invalid'
            });
            expect(res.status).toBe(400);
        }, 30000);
    });

    describe('POST /api/cancel', () => {
        test('should return 404 for unknown UUID', async () => {
            const res = await request(app).post('/api/cancel').send({ uuid: 'non-existent' });
            expect(res.status).toBe(404);
        }, 30000);
    });
});
