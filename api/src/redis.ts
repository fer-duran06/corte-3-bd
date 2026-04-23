import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Cliente Redis — URL desde .env, nunca hardcodeada
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('[Redis] Conectado'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));
