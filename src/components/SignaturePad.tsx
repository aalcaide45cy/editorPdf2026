import React, { useRef, useState, useEffect } from 'react';
import { Trash2, Check, X, Brush } from 'lucide-react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export default function SignaturePad({ onSave, onClose }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
  }, [color, lineWidth]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Brush className="h-5 w-5 text-emerald-500" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Dibujar Firma</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-250 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Canvas container */}
        <div className="p-6 flex-grow flex flex-col gap-4">
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-48 cursor-crosshair touch-none"
            />
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 pointer-events-none select-none">
              Dibuja aquí tu firma
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center">
            {/* Color Selectors */}
            <div className="flex gap-2">
              {[
                { label: 'Negro', value: '#000000' },
                { label: 'Azul', value: '#1d4ed8' },
                { label: 'Verde', value: '#047857' }
              ].map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full border transition-all ${
                    color === c.value 
                      ? 'scale-110 ring-2 ring-emerald-500/50' 
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value, borderColor: 'rgba(128,128,128,0.2)' }}
                  title={c.label}
                />
              ))}
            </div>

            {/* Thickness selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Grosor:</span>
              <select
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="bg-slate-50 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-800 rounded px-2 py-1 outline-none text-slate-700 dark:text-slate-200"
              >
                <option value={2}>Fino</option>
                <option value={4}>Medio</option>
                <option value={6}>Grueso</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            onClick={clearCanvas}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-sm font-medium transition-all"
          >
            <Trash2 className="h-4 w-4" />
            Limpiar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
          >
            <Check className="h-4 w-4" />
            Guardar y Usar
          </button>
        </div>
      </div>
    </div>
  );
}
