'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Trash2, 
  RotateCw, 
  Plus, 
  Download, 
  Type, 
  FileImage, 
  PenTool, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import SignaturePad from './SignaturePad';

// Configurar el worker usando unpkg CDN para Next.js estático
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

interface TextElement {
  id: string;
  type: 'text';
  text: string;
  x: number; // Porcentaje del contenedor (0 a 1)
  y: number; // Porcentaje del contenedor (0 a 1)
  fontSize: number;
  color: string;
}

interface ImageElement {
  id: string;
  type: 'image';
  dataUrl: string;
  x: number; // Porcentaje del contenedor (0 a 1)
  y: number; // Porcentaje del contenedor (0 a 1)
  width: number; // Porcentaje de ancho (0 a 1)
  height: number; // Porcentaje de alto (0 a 1)
}

type EditorElement = TextElement | ImageElement;

export default function Editor() {
  // Document states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  
  // Navigation & Viewer states
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.2);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string>('');

  // Page manipulation states
  const [rotations, setRotations] = useState<{ [page: number]: number }>({});
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());

  // Editing items state
  // key is page number, value is list of elements
  const [elements, setElements] = useState<{ [page: number]: EditorElement[] }>({});
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  // Interactive tools states
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'signature' | 'image'>('select');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  
  // Dragging states
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizingElement, setIsResizingElement] = useState(false);
  const [initialResizeData, setInitialResizeData] = useState({ width: 0, height: 0, startX: 0, startY: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Evitar salida accidental
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pdfFile) {
        const message = '¿Estás seguro de que deseas salir? Los cambios se perderán por completo (nada se guarda en el servidor).';
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pdfFile]);

  // Renderizar la página actual cuando cambia el PDF, la página actual o el zoom
  useEffect(() => {
    if (!pdfDocProxy) return;
    renderPage(currentPage);
  }, [pdfDocProxy, currentPage, zoom, rotations[currentPage]]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocProxy || !canvasRef.current) return;

    try {
      // Si la página está marcada como eliminada, no renderizar o mostrar aviso
      if (deletedPages.has(pageNum)) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      const page = await pdfDocProxy.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rotation = rotations[pageNum] || 0;
      const viewport = page.getViewport({ scale: zoom, rotation });

      // Configurar dimensiones
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  };

  // Cargar PDF en memoria
  const handleFileChange = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Por favor, selecciona un archivo PDF válido.');
      return;
    }

    setLoadingMsg('Leyendo archivo en la memoria del navegador...');
    setPdfFile(file);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bytes = e.target?.result as ArrayBuffer;
        setPdfBytes(bytes);
        
        // Cargar documento en PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        const doc = await loadingTask.promise;
        setPdfDocProxy(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setRotations({});
        setDeletedPages(new Set());
        setElements({});
        setSelectedElementId(null);
        setLoadingMsg('');
      } catch (err) {
        console.error('Error parsing PDF:', err);
        alert('Error al procesar el archivo PDF localmente.');
        resetState();
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const resetState = () => {
    setPdfFile(null);
    setPdfBytes(null);
    setPdfDocProxy(null);
    setNumPages(0);
    setCurrentPage(1);
    setRotations({});
    setDeletedPages(new Set());
    setElements({});
    setSelectedElementId(null);
    setActiveTool('select');
    setLoadingMsg('');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Herramientas de página
  const rotateActivePage = () => {
    const currentRot = rotations[currentPage] || 0;
    const newRot = (currentRot + 90) % 360;
    setRotations({ ...rotations, [currentPage]: newRot });
  };

  const deleteActivePage = () => {
    if (confirm(`¿Estás seguro de que deseas eliminar la página ${currentPage}?`)) {
      const newDeleted = new Set(deletedPages);
      newDeleted.add(currentPage);
      setDeletedPages(newDeleted);
      
      // Buscar siguiente página no eliminada
      let nextAvailable = 1;
      for (let i = 1; i <= numPages; i++) {
        if (!newDeleted.has(i)) {
          nextAvailable = i;
          break;
        }
      }
      setCurrentPage(nextAvailable);
    }
  };

  const recoverActivePage = () => {
    const newDeleted = new Set(deletedPages);
    newDeleted.delete(currentPage);
    setDeletedPages(newDeleted);
  };

  // Añadir elementos de edición
  const addTextElement = () => {
    const newText: TextElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: 'Haz doble clic para editar',
      x: 0.1,
      y: 0.1,
      fontSize: 16,
      color: '#000000',
    };
    const pageElements = elements[currentPage] || [];
    setElements({
      ...elements,
      [currentPage]: [...pageElements, newText],
    });
    setSelectedElementId(newText.id);
  };

  const addSignatureElement = (dataUrl: string) => {
    const newSig: ImageElement = {
      id: `sig-${Date.now()}`,
      type: 'image',
      dataUrl: dataUrl,
      x: 0.2,
      y: 0.2,
      width: 0.25, // 25% del ancho del canvas
      height: 0.1, // 10% de alto aproximado
    };
    const pageElements = elements[currentPage] || [];
    setElements({
      ...elements,
      [currentPage]: [...pageElements, newSig],
    });
    setSelectedElementId(newSig.id);
    setShowSignaturePad(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const newImg: ImageElement = {
            id: `img-${Date.now()}`,
            type: 'image',
            dataUrl: event.target.result as string,
            x: 0.2,
            y: 0.2,
            width: 0.2,
            height: 0.2,
          };
          const pageElements = elements[currentPage] || [];
          setElements({
            ...elements,
            [currentPage]: [...pageElements, newImg],
          });
          setSelectedElementId(newImg.id);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Eventos de drag-and-drop para mover elementos
  const handleElementPointerDown = (e: React.PointerEvent, element: EditorElement) => {
    e.stopPropagation();
    setSelectedElementId(element.id);
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const elemX = element.x * rect.width;
    const elemY = element.y * rect.height;

    setDragOffset({
      x: clickX - elemX,
      y: clickY - elemY,
    });
    setIsDraggingElement(true);
    container.setPointerCapture(e.pointerId);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container || !selectedElementId) return;

    const rect = container.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (isDraggingElement) {
      const pageElements = elements[currentPage] || [];
      const updated = pageElements.map((el) => {
        if (el.id === selectedElementId) {
          // Nuevas coordenadas relativas restringidas a 0..1
          let newX = (currentX - dragOffset.x) / rect.width;
          let newY = (currentY - dragOffset.y) / rect.height;
          newX = Math.max(0, Math.min(1, newX));
          newY = Math.max(0, Math.min(1, newY));
          return { ...el, x: newX, y: newY } as EditorElement;
        }
        return el;
      });
      setElements({ ...elements, [currentPage]: updated });
    } else if (isResizingElement) {
      const pageElements = elements[currentPage] || [];
      const updated = pageElements.map((el) => {
        if (el.id === selectedElementId && el.type === 'image') {
          const deltaX = currentX - initialResizeData.startX;
          const deltaY = currentY - initialResizeData.startY;
          
          let newWidth = initialResizeData.width + (deltaX / rect.width);
          let newHeight = initialResizeData.height + (deltaY / rect.height);
          
          newWidth = Math.max(0.05, Math.min(1 - el.x, newWidth));
          newHeight = Math.max(0.02, Math.min(1 - el.y, newHeight));
          
          return { ...el, width: newWidth, height: newHeight } as ImageElement;
        }
        return el;
      });
      setElements({ ...elements, [currentPage]: updated });
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    setIsDraggingElement(false);
    setIsResizingElement(false);
    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(e.pointerId);
    }
  };

  // Redimensionar imágenes
  const startResize = (e: React.PointerEvent, element: ImageElement) => {
    e.stopPropagation();
    setSelectedElementId(element.id);
    setIsResizingElement(true);
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setInitialResizeData({
      width: element.width,
      height: element.height,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
    });
    container.setPointerCapture(e.pointerId);
  };

  // Modificar propiedades del texto seleccionado
  const updateSelectedText = (text: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, text } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedFontSize = (fontSize: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, fontSize } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedColor = (color: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, color } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const deleteSelectedElement = () => {
    if (!selectedElementId) return;
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.filter((el) => el.id !== selectedElementId);
    setElements({ ...elements, [currentPage]: updated });
    setSelectedElementId(null);
  };

  // Compilación con pdf-lib e inversión de coordenadas Y
  const compileAndDownload = async () => {
    if (!pdfBytes) return;

    setLoadingMsg('Compilando y firmando el PDF de forma local...');

    try {
      // 1. Cargar el PDF original
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // 2. Obtener todas las páginas
      const allPages = pdfDoc.getPages();

      // Helper para convertir color hex a RGB (0..1)
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return rgb(r, g, b);
      };

      // 3. Modificar cada página
      for (let i = 0; i < allPages.length; i++) {
        const pageNum = i + 1;
        const page = allPages[i];

        // Aplicar rotación si existe
        if (rotations[pageNum]) {
          const currentRot = page.getRotation().angle;
          page.setRotation(degrees((currentRot + rotations[pageNum]) % 360));
        }

        // Si la página tiene elementos añadidos, dibujarlos
        const pageElements = elements[pageNum] || [];
        if (pageElements.length > 0) {
          const { width, height } = page.getSize();
          
          for (const el of pageElements) {
            if (el.type === 'text') {
              const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
              
              // Inversión de coordenadas Y: 
              // En HTML5 Canvas, y=0 es arriba. En PDF-Lib, y=0 es abajo.
              // pdfY = height - (yPercent * height) - fontSize
              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - (el.fontSize * 0.95);

              page.drawText(el.text, {
                x: elPdfX,
                y: elPdfY,
                size: el.fontSize,
                font: helveticaFont,
                color: hexToRgb(el.color),
              });
            } else if (el.type === 'image') {
              // Convertir dataUrl (base64) a bytes
              const base64Data = el.dataUrl.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              
              // Cargar imagen en el documento
              let pdfImage;
              if (el.dataUrl.includes('image/png')) {
                pdfImage = await pdfDoc.embedPng(imageBytes);
              } else {
                pdfImage = await pdfDoc.embedJpg(imageBytes);
              }

              // Calcular tamaños
              const elPdfWidth = el.width * width;
              const elPdfHeight = el.height * height;
              
              // Inversión de coordenadas Y:
              // pdfY = height - (yPercent * height) - elPdfHeight
              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - elPdfHeight;

              page.drawImage(pdfImage, {
                x: elPdfX,
                y: elPdfY,
                width: elPdfWidth,
                height: elPdfHeight,
              });
            }
          }
        }
      }

      // 4. Eliminar páginas marcadas
      if (deletedPages.size > 0) {
        // Eliminar en orden inverso para no alterar los índices durante la eliminación
        const sortedIndices = Array.from(deletedPages)
          .map((p) => p - 1) // Convertir a base 0
          .sort((a, b) => b - a);

        for (const index of sortedIndices) {
          pdfDoc.removePage(index);
        }
      }

      // 5. Guardar el PDF y descargarlo
      const modifiedPdfBytes = await pdfDoc.save();
      
      const blob = new Blob([modifiedPdfBytes] as BlobPart[], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      const baseName = pdfFile ? pdfFile.name.replace(/\.[^/.]+$/, "") : 'documento';
      link.download = `${baseName}_editado.pdf`;
      document.body.appendChild(link);
      link.click();
      
      // Limpieza inmediata de memoria
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      setLoadingMsg('');
    } catch (err) {
      console.error('Error compiling PDF:', err);
      alert('Ocurrió un error al compilar el PDF de forma local.');
      setLoadingMsg('');
    }
  };

  const activePageDeleted = deletedPages.has(currentPage);
  const pageElements = elements[currentPage] || [];
  const selectedElement = pageElements.find((el) => el.id === selectedElementId);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Loading Overlay */}
      {loadingMsg && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[110] flex flex-col items-center justify-center text-center px-4">
          <RefreshCw className="h-12 w-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-white font-medium text-lg">{loadingMsg}</p>
          <p className="text-slate-400 text-sm mt-2">Todo el proceso es 100% privado en tu ordenador.</p>
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad 
          onSave={addSignatureElement} 
          onClose={() => setShowSignaturePad(false)} 
        />
      )}

      {/* Inputs ocultos */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
        className="hidden"
      />
      <input 
        ref={imageInputRef}
        type="file"
        accept="image/png, image/jpeg"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* ESTADO INICIAL: Drop Zone */}
      {!pdfDocProxy ? (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
            isDraggingOver 
              ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 scale-[0.99] shadow-inner' 
              : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/80'
          }`}
        >
          <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl border border-emerald-500/20 mb-4 transition-transform hover:scale-110">
            <Upload className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            {isDraggingOver ? 'Suelta el archivo aquí para cargarlo' : 'Arrastra tu PDF aquí o haz clic para buscar'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-6">
            Procesamiento local inmediato. Los archivos se abren directamente desde tu memoria RAM.
          </p>
          <div className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 select-none">
            Modo 100% Seguro • Cumple RGPD
          </div>
        </div>
      ) : (
        /* ESTADO DE EDICIÓN: Workspace */
        <div className="flex flex-col gap-4">
          
          {/* BARRA DE HERRAMIENTAS SUPERIOR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            
            {/* Herramientas de Inserción */}
            <div className="flex items-center gap-2">
              <button
                onClick={addTextElement}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Añadir Texto"
              >
                <Type className="h-4 w-4" />
                <span>Añadir Texto</span>
              </button>

              <button
                onClick={() => setShowSignaturePad(true)}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Insertar Firma"
              >
                <PenTool className="h-4 w-4" />
                <span>Firmar</span>
              </button>

              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Añadir Imagen"
              >
                <FileImage className="h-4 w-4" />
                <span>Imagen</span>
              </button>
            </div>

            {/* Ajustes de Elemento Seleccionado */}
            {selectedElement && selectedElement.type === 'text' && (
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-850">
                <span className="text-xs text-slate-400 font-semibold select-none">Texto:</span>
                <input
                  type="text"
                  value={selectedElement.text}
                  onChange={(e) => updateSelectedText(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-800 w-36 outline-none"
                />
                
                {/* Tamaño de fuente */}
                <select
                  value={selectedElement.fontSize}
                  onChange={(e) => updateSelectedFontSize(Number(e.target.value))}
                  className="bg-white dark:bg-slate-900 text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-800 outline-none"
                >
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40].map((s) => (
                    <option key={s} value={s}>{s}px</option>
                  ))}
                </select>

                {/* Color */}
                <input
                  type="color"
                  value={selectedElement.color}
                  onChange={(e) => updateSelectedColor(e.target.value)}
                  className="w-6 h-6 p-0 rounded-md cursor-pointer border border-slate-200 dark:border-slate-800"
                />

                <button
                  onClick={deleteSelectedElement}
                  className="text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1"
                  title="Eliminar elemento"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {selectedElement && selectedElement.type === 'image' && (
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-850">
                <span className="text-xs text-slate-400 font-semibold select-none">Firma / Imagen:</span>
                <button
                  onClick={deleteSelectedElement}
                  className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-md transition-colors"
                  title="Eliminar elemento"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            )}

            {/* Controles de Vista */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors"
                title="Alejar Zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-slate-500 select-none w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors"
                title="Acercar Zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CUERPO DE TRABAJO PRINCIPAL */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            
            {/* BARRA LATERAL (Miniaturas y navegación rápida) */}
            <div className="w-full lg:w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex lg:flex-col gap-4 overflow-x-auto lg:overflow-x-visible lg:max-h-[600px] lg:overflow-y-auto">
              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-1 hidden lg:block select-none">
                PÁGINAS DEL DOCUMENTO
              </div>
              {Array.from({ length: numPages }).map((_, index) => {
                const pageNum = index + 1;
                const isCurrent = pageNum === currentPage;
                const isDeleted = deletedPages.has(pageNum);
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all min-w-[120px] lg:min-w-0 ${
                      isCurrent 
                        ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-450' 
                        : isDeleted
                        ? 'border-red-200 dark:border-red-950/20 bg-red-500/5 text-red-500 opacity-60'
                        : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-sm font-semibold">Pág. {pageNum}</span>
                    <div className="flex items-center gap-1">
                      {isDeleted && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold">DEL</span>}
                      {rotations[pageNum] ? <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold">{rotations[pageNum]}°</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ESPACIO DE EDICIÓN DEL PDF */}
            <div className="flex-grow flex flex-col items-center gap-4 w-full">
              
              {/* Acciones de la Página Activa */}
              <div className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Página {currentPage} de {numPages}
                  </span>
                  {activePageDeleted && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/15 animate-pulse">
                      <ShieldAlert className="h-3 w-3" />
                      Página eliminada del archivo final
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activePageDeleted ? (
                    <button
                      onClick={recoverActivePage}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all"
                    >
                      Recuperar Página
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={rotateActivePage}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-250 dark:hover:bg-slate-750 text-slate-750 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all"
                        title="Rotar 90 grados a la derecha"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        Rotar
                      </button>
                      <button
                        onClick={deleteActivePage}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-655 dark:text-red-400 rounded-lg text-xs font-semibold transition-all"
                        title="Eliminar página"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* CONTENEDOR INTERACTIVO DEL LIENZO */}
              <div 
                className="relative overflow-auto border border-slate-200 dark:border-slate-800 rounded-3xl max-w-full bg-slate-150 dark:bg-slate-900/30 flex justify-center items-center p-4 min-h-[400px] w-full"
                onClick={() => setSelectedElementId(null)}
              >
                {activePageDeleted ? (
                  <div className="text-center p-8 max-w-md">
                    <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-3" />
                    <h4 className="font-bold text-slate-850 dark:text-white mb-1">Esta página ha sido excluida</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      No se incluirá en el archivo descargado. Puedes recuperarla en cualquier momento presionando el botón "Recuperar Página" superior.
                    </p>
                  </div>
                ) : (
                  <div 
                    ref={containerRef}
                    className="relative cursor-default select-none shadow-lg"
                    style={{ 
                      width: canvasRef.current?.width ? canvasRef.current.width / 2 : 'auto', 
                      height: canvasRef.current?.height ? canvasRef.current.height / 2 : 'auto' 
                    }}
                    onPointerMove={handleContainerPointerMove}
                    onPointerUp={handleContainerPointerUp}
                  >
                    {/* Lienzo del PDF */}
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full block rounded-xl pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    />

                    {/* Capa de Edición Interactiva */}
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {pageElements.map((el) => {
                        const isSel = el.id === selectedElementId;

                        if (el.type === 'text') {
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              className={`absolute cursor-move select-none pointer-events-auto px-2 py-1 rounded transition-all group ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 bg-white/70 dark:bg-slate-900/70 shadow-md' 
                                  : 'hover:bg-slate-500/10 hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                fontSize: `${el.fontSize / 2}px`, // Ajustado a escala de pantalla (50% retina)
                                color: el.color,
                                fontFamily: 'Helvetica, Arial, sans-serif',
                                fontWeight: 'normal',
                                transform: 'translate(0, 0)',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {el.text}
                            </div>
                          );
                        } else if (el.type === 'image') {
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              className={`absolute cursor-move pointer-events-auto transition-all ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 shadow-md' 
                                  : 'hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                width: `${el.width * 100}%`,
                                height: `${el.height * 100}%`,
                              }}
                            >
                              {/* Imagen de firma/imagen */}
                              <img 
                                src={el.dataUrl} 
                                alt="Firma o Imagen insertada" 
                                className="w-full h-full object-contain pointer-events-none"
                              />

                              {/* Control de redimensionamiento */}
                              {isSel && (
                                <div
                                  onPointerDown={(e) => startResize(e, el)}
                                  className="absolute bottom-[-5px] right-[-5px] w-3 h-3 bg-emerald-500 border border-white dark:border-slate-900 rounded-full cursor-se-resize z-20 pointer-events-auto"
                                  title="Arrastra para redimensionar"
                                />
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de navegación inferior */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 hover:bg-white dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-xs font-semibold text-slate-500 select-none">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage === numPages}
                  className="p-2 hover:bg-white dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* ACCIONES FINALES E INFERIORES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 mt-4">
            
            <button
              onClick={() => {
                if (confirm('¿Estás seguro de que deseas salir y borrar los archivos? Esta acción es irreversible.')) {
                  resetState();
                }
              }}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:bg-red-500/10 px-4 py-2.5 rounded-xl font-bold transition-all w-full sm:w-auto justify-center"
            >
              <Trash2 className="h-4 w-4" />
              Borrar todo y Salir de forma segura
            </button>

            <button
              onClick={compileAndDownload}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-emerald-500/20 w-full sm:w-auto justify-center"
            >
              <Download className="h-4 w-4" />
              Descargar PDF Editado
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
