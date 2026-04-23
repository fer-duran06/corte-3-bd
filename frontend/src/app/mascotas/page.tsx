'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Mascota {
    id: number;
    nombre: string;
    especie: string;
    fecha_nacimiento: string | null;
    dueno_nombre: string;
    dueno_telefono: string;
}

export default function MascotasPage() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [mascotas, setMascotas] = useState<Mascota[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [vetNombre, setVetNombre] = useState('');
    const [vetId, setVetId] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const id = localStorage.getItem('vet_id');
        const nombre = localStorage.getItem('vet_nombre');
        if (!id) {
            router.push('/');
            return;
        }
        setVetId(id);
        setVetNombre(nombre ?? '');
        // Carga inicial: todas las mascotas del vet
        buscar(id, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const buscar = async (vid: string, q: string) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ vet_id: vid });
            if (q.trim()) params.set('q', q.trim());

            const res = await fetch(`${API_URL}/mascotas?${params}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al buscar mascotas');
            }
            const data = await res.json();
            setMascotas(data.data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            setSearched(true);
        }
    };

    const handleBuscar = () => {
        if (vetId) buscar(vetId, query);
    };

    const calcularEdad = (fecha: string | null) => {
        if (!fecha) return '—';
        const hoy = new Date();
        const nac = new Date(fecha);
        const años = hoy.getFullYear() - nac.getFullYear();
        return `${años} año${años !== 1 ? 's' : ''}`;
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">🐾 Mis Mascotas</h1>
                        <p className="text-blue-300 text-sm mt-1">{vetNombre}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => router.push('/vacunacion')}
                            className="px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-xl text-sm hover:bg-emerald-500/30 transition-all"
                        >
                            💉 Vacunación
                        </button>
                        <button
                            onClick={() => { localStorage.clear(); router.push('/'); }}
                            className="px-4 py-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-sm hover:bg-white/10 transition-all"
                        >
                            Salir
                        </button>
                    </div>
                </div>

                {/* Buscador */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 mb-6 flex gap-3">
                    <input
                        id="input-buscar"
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                        placeholder="Buscar por nombre de mascota..."
                        className="flex-1 bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    />
                    <button
                        id="btn-buscar"
                        onClick={handleBuscar}
                        disabled={loading}
                        className="px-6 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-xl transition-all disabled:opacity-50 active:scale-95"
                    >
                        {loading ? '...' : 'Buscar'}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-500/10 border border-red-400/30 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm">
                        {error}
                    </div>
                )}

                {/* Resultados */}
                {searched && (
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                            <span className="text-slate-300 font-medium">Resultados</span>
                            <span className="text-slate-500 text-sm">{mascotas.length} mascota{mascotas.length !== 1 ? 's' : ''}</span>
                        </div>

                        {mascotas.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                <span className="text-4xl">🔍</span>
                                <p className="mt-3">No se encontraron mascotas</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {mascotas.map((m) => (
                                    <div key={m.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-all">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-lg flex-shrink-0">
                                            {m.especie === 'perro' ? '🐕' : m.especie === 'gato' ? '🐈' : '🐇'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium">{m.nombre}</p>
                                            <p className="text-slate-400 text-sm capitalize">
                                                {m.especie} · {calcularEdad(m.fecha_nacimiento)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-300 text-sm">{m.dueno_nombre}</p>
                                            <p className="text-slate-500 text-xs">{m.dueno_telefono}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
