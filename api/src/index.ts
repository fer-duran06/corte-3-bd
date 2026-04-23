import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { mascotasRouter } from './routes/mascotas';
import { citasRouter } from './routes/citas';
import { vacunasRouter } from './routes/vacunas';
import { vacunacionRouter } from './routes/vacunacion';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas
app.use('/mascotas', mascotasRouter);
app.use('/citas', citasRouter);
app.use('/vacunas', vacunasRouter);
app.use('/vacunacion-pendiente', vacunacionRouter);

// Handler global de errores no capturados
app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Error no capturado:', _err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
    console.log(`[API] Servidor corriendo en http://localhost:${PORT}`);
});
