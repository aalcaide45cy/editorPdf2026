'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Shield, Cpu, RefreshCw, KeyRound, Sun, Moon } from 'lucide-react';

const Editor = dynamic(() => import('@/components/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/50 min-h-[300px]">
      <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
      <p className="text-slate-500 dark:text-slate-400">Cargando el entorno de edición local...</p>
    </div>
  ),
});

export default function Home() {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <main className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 transition-colors duration-250">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-900 bg-white/75 dark:bg-slate-950/75 backdrop-blur-md sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/20">
              <Shield className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                CAPA CERO
              </span>
              <span className="ml-1.5 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-full border border-emerald-500/15">
                PDF Editor
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-800"
              title={darkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            >
              {darkMode ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-600" />}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 dark:bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/25">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Modo 100% Seguro - Sin Servidor
            </div>
          </div>
        </div>
      </header>

      {/* Hero & App Area */}
      <div className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-10">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Edita tus PDFs con <span className="bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">Privacidad Absoluta</span>
          </h1>
          <p className="text-lg text-slate-605 dark:text-slate-400">
            Procesamiento 100% local. Tus documentos nunca salen de tu ordenador, nadie puede verlos y desaparecen por completo al cerrar la pestaña. Gratis y seguro.
          </p>
        </section>

        {/* Editor Wrapper */}
        <section className="w-full">
          <Editor />
        </section>

        {/* Features / Security Badges */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-900 flex gap-4 transition-colors">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 h-fit rounded-xl border border-emerald-500/10">
              <Cpu className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Procesamiento en RAM</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                La lectura, el renderizado de páginas en canvas y la inyección binaria con pdf-lib ocurren en la memoria de tu navegador.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-900 flex gap-4 transition-colors">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 h-fit rounded-xl border border-emerald-500/10">
              <KeyRound className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Cero Servidores</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No hay backend, APIs, Supabase ni almacenamiento S3. Privacidad nativa y total cumplimiento del RGPD por diseño.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-900 flex gap-4 transition-colors">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-3 h-fit rounded-xl border border-emerald-500/10">
              <Shield className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Sin Rastros</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Al cerrar o refrescar la pestaña del navegador, todos tus datos y documentos cargados se eliminan de forma irreversible.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 py-6 bg-white dark:bg-slate-950 mt-12 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <p>Capa Cero PDF Editor • Licencia MIT • Procesamiento Local y Seguro</p>
      </footer>
    </main>
  );
}
