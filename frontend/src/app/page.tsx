'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Lista de veterinarios — en un sistema real vendría de la API
const VETERINARIOS = [
    { id: 1, nombre: 'Dr. Fernando López Castro' },
    { id: 2, nombre: 'Dra. Sofía García Velasco' },
    { id: 3, nombre: 'Dr. Andrés Méndez Bravo' },
];

export default function LoginPage() {
    const router = useRouter();
    const [vetId, setVetId] = useState<string>('');
    const [error, setError] = useState('');

    const handleIngresar = () => {
        if (!vetId) {
            setError('Selecciona un veterinario para continuar.');
            return;
        }
        // Guardamos el vet seleccionado en localStorage — el frontend lo incluye
        // en cada request a la API como query param vet_id
        localStorage.setItem('vet_id', vetId);
        const vet = VETERINARIOS.find((v) => v.id === Number(vetId));
        localStorage.setItem('vet_nombre', vet?.nombre ?? '');
        router.push('/mascotas');
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo / Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/20 border border-blue-400/30 mb-4 backdrop-blur-sm">
                        <span className="text-4xl">🐾</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Clínica Veterinaria</h1>
                    <p className="text-blue-300 mt-1 text-sm">Sistema de Gestión</p>
                </div>

                {/* Card */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
                    <h2 className="text-xl font-semibold text-white mb-6">Selecciona tu perfil</h2>

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="vet-select" className="block text-sm text-blue-200 mb-2 font-medium">
                                Veterinario
                            </label>
                            <select
                                id="vet-select"
                                value={vetId}
                                onChange={(e) => { setVetId(e.target.value); setError(''); }}
                                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all appearance-none cursor-pointer"
                            >
                                <option value="" className="bg-slate-800">— Seleccionar —</option>
                                {VETERINARIOS.map((v) => (
                                    <option key={v.id} value={v.id} className="bg-slate-800">
                                        {v.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            id="btn-ingresar"
                            onClick={handleIngresar}
                            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 active:scale-95"
                        >
                            Ingresar al sistema
                        </button>
                    </div>
                </div>

                <p className="text-center text-slate-500 text-xs mt-6">
                    Base de Datos Avanzadas · UP Chiapas · Corte 3
                </p>
            </div>
        </main>
    );
}
