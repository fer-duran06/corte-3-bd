import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { withVetContext } from '../db';

export const mascotasRouter = Router();

// Esquema de validación Zod — protege contra inputs maliciosos
const BuscarSchema = z.object({
    q: z.string().min(1).max(100).optional(),
    vet_id: z.coerce.number().int().positive(),
});

/**
 * GET /mascotas?q=nombre&vet_id=1
 *
 * Busca mascotas por nombre (parcial, case-insensitive).
 * El RLS de PostgreSQL filtra automáticamente según app.current_vet_id.
 *
 * HARDENING:
 *   - El término de búsqueda viaja como parámetro $1 — nunca concatenado
 *   - Zod valida tipo y longitud antes de llegar a la query
 *   - El vet_id del header/query se parsea como número — nunca como string raw
 */
mascotasRouter.get('/', async (req: Request, res: Response) => {
    const parsed = BuscarSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Parámetros inválidos', details: parsed.error.flatten() });
    }

    const { q, vet_id } = parsed.data;

    try {
        const result = await withVetContext(vet_id, async (client) => {
            // Búsqueda parametrizada con ILIKE y $1 — anti SQL injection
            // El % se concatena en JS antes de pasarlo como parámetro,
            // NO dentro del string SQL. PostgreSQL lo trata como valor literal.
            const termino = q ? `%${q}%` : '%';
            return client.query(
                `SELECT m.id, m.nombre, m.especie, m.fecha_nacimiento,
                d.nombre AS dueno_nombre, d.telefono AS dueno_telefono
         FROM mascotas m
         JOIN duenos d ON d.id = m.dueno_id
         WHERE m.nombre ILIKE $1
         ORDER BY m.nombre`,
                [termino]
            );
        });

        res.json({ data: result.rows, total: result.rowCount });
    } catch (err) {
        // Error genérico al cliente — nunca exponer stack trace
        console.error('[mascotas] Error:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
