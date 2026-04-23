import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Intenta cargar .env local (api/.env), si no existe carga el de la raíz del proyecto
const localEnv = path.resolve(__dirname, '../../.env');
const rootEnv = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
} else if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
} else {
    dotenv.config(); // intento estándar
}

// Pool de conexiones — credenciales desde variables de entorno
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
    connectionString
        ? { connectionString }
        : {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: Number(process.env.POSTGRES_PORT || 5432),
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: process.env.POSTGRES_DB || 'clinica_vet',
        }
);

/**
 * Ejecuta una función dentro de una transacción con el contexto
 * del veterinario activo inyectado como variable de sesión local.
 *
 * PostgreSQL expone ese valor mediante:
 *   current_setting('app.current_vet_id', true)
 *
 * Las políticas RLS en mascotas, citas y vacunas_aplicadas lo usan
 * para filtrar filas automáticamente.
 *
 * @param vetId  ID del veterinario autenticado (o null para admin)
 * @param fn     Callback que recibe el cliente de la transacción
 */
export async function withVetContext<T>(
    vetId: number | null,
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // SET LOCAL no soporta parámetros $1 en PostgreSQL.
        // vetId es seguro porque viene validado como entero por Zod antes de llegar aquí.
        if (vetId !== null) {
            await client.query(`SET LOCAL "app.current_vet_id" = '${vetId}'`);
        }

        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}