'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface VacunacionItem {
    mascota_id: number;
    mascota_nombre: string;
    especie: string;
    dueno_nombre: string;
    dueno_telefono: string;
    vacuna_nombre: string | null;
    fecha_aplicacion: string | null;
    proxima_dosis_estimada: string | null;
}

export default function VacunacionPage() {
    const router = useRouter();
    const [datos, setDatos] = useState<VacunacionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fromCache, setFromCache] = useState<boolean | null>(null);
    const [vetNombre, setVetNombre] = useState('');
    const [lastFetch, setLastFetch] = useState<string>('');

    const fetchVacunacion = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_URL}/vacunacion-pendiente`);
            if (!res.ok) throw new Error('Error al obtener datos');
            const data = await res.json();
            setDatos(data.data);
            setFromCache(data.from_cache);
            setLastFetch(new Date().toLocaleTimeString('es-MX'));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const nombre = localStorage.getItem('vet_nombre');
        if (!localStorage.getItem('vet_id')) {
            router.push('/');
            return;
        }
        setVetNombre(nombre ?? '');
        fetchVacunacion();
    }, [router, fetchVacunacion]);

    const formatFecha = (f: string | null) => {
        if (!f) return '—';
        return new Date(f).toLocaleDateString('es-MX', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">💉 Vacunación Pendiente</h1>
                        <p className="text-emerald-300 text-sm mt-1">{vetNombre}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => router.push('/mascotas')}
                            className="px-4 py-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 rounded-xl text-sm hover:bg-blue-500/30 transition-all"
                        >
                            🐾 Mascotas
                        </button>
                        <button
                            onClick={() => { localStorage.clear(); router.push('/'); }}
                            className="px-4 py-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-sm hover:bg-white/10 transition-all"
                        >
                            Salir
                        </button>
                    </div>
                </div>

                {/* Banner de caché — demo Redis */}
                {fromCache !== null && (
                    <div className={`mb-6 px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${fromCache
                            ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
                            : 'bg-orange-500/10 border-orange-400/30 text-orange-300'
                        }`}>
                        <span>{fromCache ? '⚡' : '🔄'}</span>
                        <span>
                            {fromCache
                                ? `Cache HIT — datos servidos desde Redis (TTL 60 s)`
                                : `Cache MISS — datos consultados desde PostgreSQL y guardados en Redis`}
                        </span>
                        <span className="ml-auto text-xs opacity-60">{lastFetch}</span>
                    </div>
                )}

                <div className="flex gap-3 mb-6">
                    <button
                        id="btn-refrescar"
                        onClick={fetchVacunacion}
                        disabled={loading}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-xl transition-all disabled:opacity-50 active:scale-95 text-sm"
                    >
                        {loading ? '⏳ Cargando…' : '🔄 Refrescar (ver HIT/MISS)'}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-500/10 border border-red-400/30 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm">
                        {error}
                    </div>
                )}

                {/* Tabla */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                        <span className="text-slate-300 font-medium">Mascotas con vacunación vencida o pendiente</span>
                        {!loading && <span className="text-slate-500 text-sm">{datos.length} registros</span>}
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-slate-500">
                            <div className="inline-block w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
                            <p>Consultando…</p>
                        </div>
                    ) : datos.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <span className="text-4xl">✅</span>
                            <p className="mt-3">Todas las mascotas están al día</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="px-6 py-3 text-left text-slate-400 font-medium">Mascota</th>
                                        <th className="px-6 py-3 text-left text-slate-400 font-medium">Dueño</th>
                                        <th className="px-6 py-3 text-left text-slate-400 font-medium">Última vacuna</th>
                                        <th className="px-6 py-3 text-left text-slate-400 font-medium">Próxima dosis</th>
                                        <th className="px-6 py-3 text-left text-slate-400 font-medium">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {datos.map((item) => {
                                        const vencida = item.proxima_dosis_estimada
                                            ? new Date(item.proxima_dosis_estimada) < new Date()
                                            : true;
                                        return (
                                            <tr key={item.mascota_id} className="hover:bg-white/5 transition-all">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span>{item.especie === 'perro' ? '🐕' : item.especie === 'gato' ? '🐈' : '🐇'}</span>
                                                        <div>
                                                            <p className="text-white font-medium">{item.mascota_nombre}</p>
                                                            <p className="text-slate-500 capitalize">{item.especie}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-slate-300">{item.dueno_nombre}</p>
                                                    <p className="text-slate-500">{item.dueno_telefono}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-slate-300">{item.vacuna_nombre ?? '—'}</p>
                                                    <p className="text-slate-500">{formatFecha(item.fecha_aplicacion)}</p>
                                                </td>
                                                <td className="px-6 py-4 text-slate-300">
                                                    {formatFecha(item.proxima_dosis_estimada)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${vencida
                                                            ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                                                            : 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                                                        }`}>
                                                        {vencida ? '⚠ Vencida' : '🔔 Próxima'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
