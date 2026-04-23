import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { withVetContext } from '../db';
import { redis } from '../redis';

export const vacunasRouter = Router();

const AplicarVacunaSchema = z.object({
    mascota_id: z.number().int().positive(),
    vacuna_id: z.number().int().positive(),
    veterinario_id: z.number().int().positive(),
    costo_cobrado: z.number().positive(),
});

// Clave de caché que esta ruta invalida al aplicar una vacuna
const CACHE_KEY = 'vacunacion:pendiente';

/**
 * POST /vacunas
 *
 * Registra la aplicación de una vacuna e invalida el caché Redis
 * de la vista v_mascotas_vacunacion_pendiente.
 *
 * HARDENING:
 *   - Zod valida todos los campos (IDs como enteros positivos, costo como número)
 *   - Insert con $1..$4 — nunca concatenación de strings
 */
vacunasRouter.post('/', async (req: Request, res: Response) => {
    const parsed = AplicarVacunaSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    }

    const { mascota_id, vacuna_id, veterinario_id, costo_cobrado } = parsed.data;

    try {
        const result = await withVetContext(veterinario_id, async (client) => {
            return client.query(
                `INSERT INTO vacunas_aplicadas (mascota_id, vacuna_id, veterinario_id, costo_cobrado)
         VALUES ($1, $2, $3, $4)
         RETURNING id, fecha_aplicacion`,
                [mascota_id, vacuna_id, veterinario_id, costo_cobrado]
            );
        });

        // Invalida el caché — los datos de vacunación pendiente cambiaron
        await redis.del(CACHE_KEY);
        console.log(`[Redis] Cache invalidado: ${CACHE_KEY}`);

        res.status(201).json({
            message: 'Vacuna aplicada correctamente',
            data: result.rows[0],
        });
    } catch (err: any) {
        console.error('[vacunas] Error:', err.message);
        res.status(500).json({ error: 'Error al registrar la vacuna' });
    }
});
