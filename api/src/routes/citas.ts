import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { withVetContext } from '../db';

export const citasRouter = Router();

// Validación estricta de todos los campos de entrada
const AgendarSchema = z.object({
    mascota_id: z.number().int().positive(),
    veterinario_id: z.number().int().positive(),
    fecha_hora: z.string().datetime({ offset: true }).or(
        z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    ),
    motivo: z.string().min(1).max(500),
});

/**
 * POST /citas
 *
 * Agenda una cita llamando al stored procedure sp_agendar_cita.
 * Todas las validaciones de negocio (vet activo, día descanso, colisión)
 * ocurren dentro del procedure en PostgreSQL.
 *
 * HARDENING:
 *   - Zod valida y parsea todos los campos antes de la query
 *   - Se usa CALL con parámetros $1..$4 — nunca SQL dinámico
 *   - El motivo (texto libre) viaja como parámetro, no concatenado
 */
citasRouter.post('/', async (req: Request, res: Response) => {
    const parsed = AgendarSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    }

    const { mascota_id, veterinario_id, fecha_hora, motivo } = parsed.data;

    try {
        const result = await withVetContext(veterinario_id, async (client) => {
            return client.query(
                'CALL sp_agendar_cita($1, $2, $3, $4, NULL)',
                [mascota_id, veterinario_id, fecha_hora, motivo]
            );
        });

        const cita_id = result.rows[0]?.p_cita_id ?? null;
        res.status(201).json({ message: 'Cita agendada correctamente', cita_id });
    } catch (err: any) {
        console.error('[citas] Error:', err.message);
        // Propagamos el mensaje de PostgreSQL al cliente (es legible y no expone internals)
        res.status(422).json({ error: err.message || 'Error al agendar la cita' });
    }
});
