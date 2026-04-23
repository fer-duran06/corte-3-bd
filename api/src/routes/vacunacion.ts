import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { redis } from '../redis';

export const vacunacionRouter = Router();

const CACHE_KEY = 'vacunacion:pendiente';
const CACHE_TTL = 60; // segundos

/**
 * GET /vacunacion-pendiente
 *
 * Devuelve la vista v_mascotas_vacunacion_pendiente.
 * Estrategia de caché: Cache-Aside con TTL de 60 segundos.
 *
 * Flujo:
 *   1. Busca en Redis con clave 'vacunacion:pendiente'
 *   2. HIT → devuelve JSON cacheado + header X-Cache: HIT
 *   3. MISS → consulta la vista en PostgreSQL, guarda en Redis, responde
 *
 * Invalidación:
 *   POST /vacunas borra la clave tras registrar una vacuna.
 */
vacunacionRouter.get('/', async (_req: Request, res: Response) => {
    try {
        // 1. Intentar desde caché
        const cached = await redis.get(CACHE_KEY);

        if (cached) {
            console.log('[Redis] HIT —', CACHE_KEY);
            res.setHeader('X-Cache', 'HIT');
            return res.json({ data: JSON.parse(cached), from_cache: true });
        }

        // 2. MISS — consultar PostgreSQL
        console.log('[Redis] MISS —', CACHE_KEY);
        const result = await pool.query(
            'SELECT * FROM v_mascotas_vacunacion_pendiente'
        );

        // 3. Guardar en Redis con TTL
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result.rows));

        res.setHeader('X-Cache', 'MISS');
        res.json({ data: result.rows, from_cache: false });
    } catch (err) {
        console.error('[vacunacion] Error:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
