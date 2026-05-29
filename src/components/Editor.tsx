'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Trash2, 
  RotateCw, 
  Download, 
  Type, 
  FileImage, 
  PenTool, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert,
  RefreshCw,
  Square,
  Circle,
  Edit3
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import SignaturePad from './SignaturePad';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

interface TextElement {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight?: 'bold' | 'normal';
  fontStyle?: 'italic' | 'normal';
  fontFamily?: 'sans-serif' | 'serif';
}

interface ImageElement {
  id: string;
  type: 'image';
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeElement {
  id: string;
  type: 'shape';
  shapeType: 'rect' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // Relleno
  borderColor: string;
  borderWidth: number;
  opacity: number;
}

type EditorElement = TextElement | ImageElement | ShapeElement;

interface OriginalTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 'bold' | 'normal';
  fontStyle: 'italic' | 'normal';
  fontFamily: 'sans-serif' | 'serif';
}

// Analizar colores de texto y fondo leyendo píxeles del canvas
const detectTextAndBgColor = (
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { textColor: '#000000', bgColor: '#ffffff' };

    // Convertir de coordenadas relativas a píxeles físicos del lienzo
    const pxX = Math.round(x * canvas.width);
    const pxY = Math.round(y * canvas.height);
    const pxW = Math.round(width * canvas.width);
    const pxH = Math.round(height * canvas.height);

    if (pxW <= 0 || pxH <= 0) return { textColor: '#000000', bgColor: '#ffffff' };

    const imgData = ctx.getImageData(pxX, pxY, pxW, pxH);
    const data = imgData.data;

    // Muestrear las esquinas para determinar el color de fondo aproximado
    const corners = [
      0, // superior izquierda
      Math.min(data.length - 4, (pxW - 1) * 4), // superior derecha
      Math.min(data.length - 4, (pxH - 1) * pxW * 4), // inferior izquierda
      data.length - 4 // inferior derecha
    ];

    const bgR = Math.round(corners.reduce((sum, idx) => sum + data[idx], 0) / 4);
    const bgG = Math.round(corners.reduce((sum, idx) => sum + data[idx + 1], 0) / 4);
    const bgB = Math.round(corners.reduce((sum, idx) => sum + data[idx + 2], 0) / 4);

    const toHex = (c: number) => c.toString(16).padStart(2, '0');
    const bgColor = `#${toHex(bgR)}${toHex(bgG)}${toHex(bgB)}`;

    // Buscar píxeles que difieran del fondo para obtener el color de letra
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 50) continue; // ignorar transparentes

      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (diff > 50) { // Umbral de contraste
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }

    let textColor = '#000000';
    if (count > 0) {
      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      textColor = `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`;
    } else {
      // Si no hay contraste detectado, usar el color inverso al brillo
      const brightness = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
      textColor = brightness > 125 ? '#000000' : '#ffffff';
    }

    return { textColor, bgColor };
  } catch (err) {
    console.error('Error al detectar colores del canvas:', err);
    return { textColor: '#000000', bgColor: '#ffffff' };
  }
};

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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Page manipulation states
  const [rotations, setRotations] = useState<{ [page: number]: number }>({});
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());

  // Editing items state
  const [elements, setElements] = useState<{ [page: number]: EditorElement[] }>({});
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  // Original PDF text detection
  const [isEditTextMode, setIsEditTextMode] = useState(false);
  const [originalTextItems, setOriginalTextItems] = useState<OriginalTextItem[]>([]);
  const [hiddenOriginalTextIds, setHiddenOriginalTextIds] = useState<Set<string>>(new Set());

  // Interactive tools states
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  
  // Drag & Resize references for HIGH PERFORMANCE (Zero Lag)
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const elementCoordsRef = useRef({ x: 0, y: 0 });
  const resizeDataRef = useRef({ width: 0, height: 0, startX: 0, startY: 0 });
  const elementSizeRef = useRef({ width: 0, height: 0 });

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

  // Detección de texto original del PDF al cambiar de página
  useEffect(() => {
    if (!pdfDocProxy) {
      setOriginalTextItems([]);
      setHiddenOriginalTextIds(new Set());
      return;
    }

    const loadOriginalText = async () => {
      try {
        const page = await pdfDocProxy.getPage(currentPage);
        const textContent = await page.getTextContent();
        
        // Usar un viewport de escala 1.0 constante para calcular coordenadas relativas
        const rotation = rotations[currentPage] || 0;
        const viewport = page.getViewport({ scale: 1.0, rotation });
        
        const items: OriginalTextItem[] = textContent.items
          .filter((item: any) => item.str && item.str.trim().length > 0)
          .map((item: any, idx: number) => {
            const matrix = item.transform; // [a, b, c, d, tx, ty]
            const tx = matrix[4];
            const ty = matrix[5];
            
            const [x, y] = viewport.convertToViewportPoint(tx, ty);
            
            const fontSize = Math.abs(matrix[3]) || 12;
            
            const itemWidth = item.width * viewport.scale;
            const itemHeight = fontSize * viewport.scale;

            // Extraer y normalizar estilos tipográficos a partir del nombre de la fuente
            const fontName = (item.fontName || '').toLowerCase();
            const isBold = fontName.includes('bold') || fontName.includes('black') || fontName.includes('heavy') || fontName.includes('w700') || fontName.includes('w800') || fontName.includes('w900') || fontName.includes('w600');
            const isItalic = fontName.includes('italic') || fontName.includes('oblique') || fontName.includes('obli');
            const isSerif = fontName.includes('times') || fontName.includes('serif') || fontName.includes('roman') || fontName.includes('georgia') || fontName.includes('minion');
            
            return {
              id: `orig-${currentPage}-${idx}`,
              text: item.str,
              x: x / viewport.width,
              y: (y - itemHeight) / viewport.height,
              width: itemWidth / viewport.width,
              height: itemHeight / viewport.height,
              fontSize: fontSize,
              fontWeight: isBold ? 'bold' : 'normal',
              fontStyle: isItalic ? 'italic' : 'normal',
              fontFamily: isSerif ? 'serif' : 'sans-serif',
            };
          });
        
        setOriginalTextItems(items);
        setHiddenOriginalTextIds(new Set());
      } catch (err) {
        console.error('Error cargando textos originales:', err);
      }
    };

    loadOriginalText();
  }, [pdfDocProxy, currentPage, rotations[currentPage]]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocProxy || !canvasRef.current) return;

    try {
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

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      
      setCanvasSize({ width: viewport.width / 2, height: viewport.height / 2 });
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
        
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        const doc = await loadingTask.promise;
        setPdfDocProxy(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setRotations({});
        setDeletedPages(new Set());
        setElements({});
        setSelectedElementId(null);
        setIsEditTextMode(false);
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
    setIsEditTextMode(false);
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
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontFamily: 'sans-serif'
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
      width: 0.25,
      height: 0.1,
    };
    const pageElements = elements[currentPage] || [];
    setElements({
      ...elements,
      [currentPage]: [...pageElements, newSig],
    });
    setSelectedElementId(newSig.id);
    setShowSignaturePad(false);
  };

  const addShapeElement = (shapeType: 'rect' | 'circle') => {
    const newShape: ShapeElement = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      shapeType: shapeType,
      x: 0.3,
      y: 0.3,
      width: 0.2,
      height: 0.15,
      color: '#ffffff', 
      borderColor: '#000000',
      borderWidth: 0, 
      opacity: 1.0,
    };
    const pageElements = elements[currentPage] || [];
    setElements({
      ...elements,
      [currentPage]: [...pageElements, newShape],
    });
    setSelectedElementId(newShape.id);
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

  // Simular la edición del texto original con preservación de formato completo
  const handleEditOriginalText = (item: OriginalTextItem) => {
    let detectedTextColor = '#000000';
    let detectedBgColor = '#ffffff';

    // Muestrear los colores del canvas en tiempo real
    if (canvasRef.current) {
      const colors = detectTextAndBgColor(
        canvasRef.current,
        item.x,
        item.y,
        item.width,
        item.height
      );
      detectedTextColor = colors.textColor;
      detectedBgColor = colors.bgColor;
    }

    // 1. Añadir el parche ocultador del color de fondo exacto
    const whiteoutId = `whiteout-${Date.now()}`;
    const whiteoutShape: ShapeElement = {
      id: whiteoutId,
      type: 'shape',
      shapeType: 'rect',
      x: item.x - 0.004,
      y: item.y - 0.004,
      width: item.width + 0.008,
      height: item.height + 0.008,
      color: detectedBgColor, 
      borderColor: detectedBgColor,
      borderWidth: 0,
      opacity: 1.0,
    };

    // 2. Añadir el texto editable con sus estilos y color detectados
    const textId = `text-edit-${Date.now()}`;
    const editableText: TextElement = {
      id: textId,
      type: 'text',
      text: item.text,
      x: item.x,
      y: item.y + 0.002,
      fontSize: item.fontSize,
      color: detectedTextColor, 
      fontWeight: item.fontWeight,
      fontStyle: item.fontStyle,
      fontFamily: item.fontFamily,
    };

    const pageElements = elements[currentPage] || [];
    setElements({
      ...elements,
      [currentPage]: [...pageElements, whiteoutShape, editableText],
    });

    const newHidden = new Set(hiddenOriginalTextIds);
    newHidden.add(item.id);
    setHiddenOriginalTextIds(newHidden);

    setSelectedElementId(textId);
  };

  // --- LÓGICA DE ARRASTRE Y REDIMENSIÓN DE ALTO RENDIMIENTO (SIN LAG) ---
  const handleElementPointerDown = (e: React.PointerEvent<HTMLDivElement>, element: EditorElement) => {
    e.stopPropagation();
    setSelectedElementId(element.id);
    
    const container = containerRef.current;
    if (!container) return;

    dragTargetRef.current = e.currentTarget;
    isDraggingRef.current = true;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const elemX = element.x * rect.width;
    const elemY = element.y * rect.height;

    dragOffsetRef.current = {
      x: clickX - elemX,
      y: clickY - elemY,
    };
    elementCoordsRef.current = { x: element.x, y: element.y };

    container.setPointerCapture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent, element: ImageElement | ShapeElement) => {
    e.stopPropagation();
    setSelectedElementId(element.id);
    isResizingRef.current = true;
    
    const container = containerRef.current;
    if (!container) return;

    const parentNode = (e.target as HTMLElement).parentNode as HTMLDivElement;
    dragTargetRef.current = parentNode;

    const rect = container.getBoundingClientRect();
    resizeDataRef.current = {
      width: element.width,
      height: element.height,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
    };
    elementSizeRef.current = { width: element.width, height: element.height };

    container.setPointerCapture(e.pointerId);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container || !selectedElementId || !dragTargetRef.current) return;

    const rect = container.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      let newX = (currentX - dragOffsetRef.current.x) / rect.width;
      let newY = (currentY - dragOffsetRef.current.y) / rect.height;
      newX = Math.max(0, Math.min(1, newX));
      newY = Math.max(0, Math.min(1, newY));
      
      elementCoordsRef.current = { x: newX, y: newY };
      
      dragTargetRef.current.style.left = `${newX * 100}%`;
      dragTargetRef.current.style.top = `${newY * 100}%`;
      
    } else if (isResizingRef.current) {
      const deltaX = currentX - resizeDataRef.current.startX;
      const deltaY = currentY - resizeDataRef.current.startY;
      
      let newWidth = resizeDataRef.current.width + (deltaX / rect.width);
      let newHeight = resizeDataRef.current.height + (deltaY / rect.height);
      
      const el = (elements[currentPage] || []).find(item => item.id === selectedElementId);
      if (el) {
        newWidth = Math.max(0.01, Math.min(1 - el.x, newWidth));
        newHeight = Math.max(0.01, Math.min(1 - el.y, newHeight));
        
        elementSizeRef.current = { width: newWidth, height: newHeight };
        
        dragTargetRef.current.style.width = `${newWidth * 100}%`;
        dragTargetRef.current.style.height = `${newHeight * 100}%`;
      }
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(e.pointerId);
    }

    if (isDraggingRef.current && selectedElementId) {
      const pageElements = elements[currentPage] || [];
      const updated = pageElements.map((el) => {
        if (el.id === selectedElementId) {
          return { ...el, x: elementCoordsRef.current.x, y: elementCoordsRef.current.y };
        }
        return el;
      });
      setElements({ ...elements, [currentPage]: updated });
    } else if (isResizingRef.current && selectedElementId) {
      const pageElements = elements[currentPage] || [];
      const updated = pageElements.map((el) => {
        if (el.id === selectedElementId && (el.type === 'image' || el.type === 'shape')) {
          return { ...el, width: elementSizeRef.current.width, height: elementSizeRef.current.height };
        }
        return el;
      });
      setElements({ ...elements, [currentPage]: updated });
    }

    isDraggingRef.current = false;
    isResizingRef.current = false;
    dragTargetRef.current = null;
  };

  // Modificaciones de propiedades
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
      if (el.id === selectedElementId) {
        return { ...el, color } as any;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const toggleSelectedBold = () => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const next = el.fontWeight === 'bold' ? 'normal' : 'bold';
        return { ...el, fontWeight: next } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const toggleSelectedItalic = () => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const next = el.fontStyle === 'italic' ? 'normal' : 'italic';
        return { ...el, fontStyle: next } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedFontFamily = (family: 'sans-serif' | 'serif') => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, fontFamily: family } as TextElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedBorderColor = (borderColor: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, borderColor } as ShapeElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedBorderWidth = (borderWidth: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, borderWidth } as ShapeElement;
      }
      return el;
    });
    setElements({ ...elements, [currentPage]: updated });
  };

  const updateSelectedOpacity = (opacity: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, opacity } as ShapeElement;
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

  // Guardado nativo
  const compileAndDownload = async () => {
    if (!pdfBytes) return;

    setLoadingMsg('Compilando y estructurando el PDF de forma local...');

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const allPages = pdfDoc.getPages();

      const hexToRgb = (hex: string) => {
        if (!hex || hex.length < 7) return rgb(0, 0, 0);
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return rgb(r, g, b);
      };

      for (let i = 0; i < allPages.length; i++) {
        const pageNum = i + 1;
        const page = allPages[i];

        if (rotations[pageNum]) {
          const currentRot = page.getRotation().angle;
          page.setRotation(degrees((currentRot + rotations[pageNum]) % 360));
        }

        const pageElements = elements[pageNum] || [];
        if (pageElements.length > 0) {
          const { width, height } = page.getSize();
          
          for (const el of pageElements) {
            if (el.type === 'text') {
              // Mapear la tipografía correcta con estilo en pdf-lib
              let selectedFont = StandardFonts.Helvetica;
              const isSerif = el.fontFamily === 'serif';
              
              if (isSerif) {
                if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
                  selectedFont = StandardFonts.TimesRomanBoldItalic;
                } else if (el.fontWeight === 'bold') {
                  selectedFont = StandardFonts.TimesRomanBold;
                } else if (el.fontStyle === 'italic') {
                  selectedFont = StandardFonts.TimesRomanItalic;
                } else {
                  selectedFont = StandardFonts.TimesRoman;
                }
              } else {
                if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
                  selectedFont = StandardFonts.HelveticaBoldOblique;
                } else if (el.fontWeight === 'bold') {
                  selectedFont = StandardFonts.HelveticaBold;
                } else if (el.fontStyle === 'italic') {
                  selectedFont = StandardFonts.HelveticaOblique;
                } else {
                  selectedFont = StandardFonts.Helvetica;
                }
              }

              const embeddedFont = await pdfDoc.embedFont(selectedFont);
              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - (el.fontSize * 0.95);

              page.drawText(el.text, {
                x: elPdfX,
                y: elPdfY,
                size: el.fontSize,
                font: embeddedFont,
                color: hexToRgb(el.color),
              });
            } else if (el.type === 'image') {
              const base64Data = el.dataUrl.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              
              let pdfImage;
              if (el.dataUrl.includes('image/png')) {
                pdfImage = await pdfDoc.embedPng(imageBytes);
              } else {
                pdfImage = await pdfDoc.embedJpg(imageBytes);
              }

              const elPdfWidth = el.width * width;
              const elPdfHeight = el.height * height;
              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - elPdfHeight;

              page.drawImage(pdfImage, {
                x: elPdfX,
                y: elPdfY,
                width: elPdfWidth,
                height: elPdfHeight,
              });
            } else if (el.type === 'shape') {
              const elPdfWidth = el.width * width;
              const elPdfHeight = el.height * height;
              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - elPdfHeight;

              const fillColor = hexToRgb(el.color);
              const borderCol = hexToRgb(el.borderColor);

              if (el.shapeType === 'rect') {
                page.drawRectangle({
                  x: elPdfX,
                  y: elPdfY,
                  width: elPdfWidth,
                  height: elPdfHeight,
                  color: fillColor,
                  borderColor: borderCol,
                  borderWidth: el.borderWidth,
                  opacity: el.opacity,
                });
              } else if (el.shapeType === 'circle') {
                page.drawEllipse({
                  x: elPdfX + elPdfWidth / 2,
                  y: elPdfY + elPdfHeight / 2,
                  xScale: elPdfWidth / 2,
                  yScale: elPdfHeight / 2,
                  color: fillColor,
                  borderColor: borderCol,
                  borderWidth: el.borderWidth,
                  opacity: el.opacity,
                });
              }
            }
          }
        }
      }

      if (deletedPages.size > 0) {
        const sortedIndices = Array.from(deletedPages)
          .map((p) => p - 1)
          .sort((a, b) => b - a);

        for (const index of sortedIndices) {
          pdfDoc.removePage(index);
        }
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const blob = new Blob([modifiedPdfBytes] as BlobPart[], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      const baseName = pdfFile ? pdfFile.name.replace(/\.[^/.]+$/, "") : 'documento';
      link.download = `${baseName}_editado.pdf`;
      document.body.appendChild(link);
      link.click();
      
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
    <div className="w-full flex flex-col gap-6 text-slate-900 dark:text-slate-100">
      
      {loadingMsg && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[110] flex flex-col items-center justify-center text-center px-4">
          <RefreshCw className="h-12 w-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-white font-medium text-lg">{loadingMsg}</p>
          <p className="text-slate-400 text-sm mt-2">Todo el proceso es 100% privado en tu ordenador.</p>
        </div>
      )}

      {showSignaturePad && (
        <SignaturePad 
          onSave={addSignatureElement} 
          onClose={() => setShowSignaturePad(false)} 
        />
      )}

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

      {/* DRAG AND DROP ZONE */}
      {!pdfDocProxy ? (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-350 ${
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
        /* WORKSPACE */
        <div className="flex flex-col gap-4">
          
          {/* BARRA DE HERRAMIENTAS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 transition-colors">
            
            {/* Acciones de Inserción */}
            <div className="flex items-center gap-2">
              <button
                onClick={addTextElement}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Añadir Nuevo Texto"
              >
                <Type className="h-4 w-4" />
                <span>Texto</span>
              </button>

              <button
                onClick={() => addShapeElement('rect')}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Añadir Rectángulo"
              >
                <Square className="h-4 w-4" />
                <span>Rectángulo</span>
              </button>

              <button
                onClick={() => addShapeElement('circle')}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Añadir Círculo"
              >
                <Circle className="h-4 w-4" />
                <span>Círculo</span>
              </button>

              <button
                onClick={() => setShowSignaturePad(true)}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Dibujar e Insertar Firma"
              >
                <PenTool className="h-4 w-4" />
                <span>Firmar</span>
              </button>

              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={activePageDeleted}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                title="Subir Imagen Local"
              >
                <FileImage className="h-4 w-4" />
                <span>Imagen</span>
              </button>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

              <button
                onClick={() => setIsEditTextMode(!isEditTextMode)}
                disabled={activePageDeleted || originalTextItems.length === 0}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${
                  isEditTextMode 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm' 
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}
                title="Habilitar/Deshabilitar capa para editar el texto original del documento"
              >
                <Edit3 className="h-4 w-4" />
                <span>Modificar Original</span>
              </button>
            </div>

            {/* Ajustes de Elementos Seleccionados */}
            {selectedElement && (
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850">
                {selectedElement.type === 'text' && (
                  <>
                    <span className="text-xs text-slate-400 font-bold select-none">Texto:</span>
                    <input
                      type="text"
                      value={selectedElement.text}
                      onChange={(e) => updateSelectedText(e.target.value)}
                      className="bg-white dark:bg-slate-900 text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-44 outline-none text-slate-800 dark:text-slate-200 font-medium"
                    />
                    
                    <select
                      value={selectedElement.fontSize}
                      onChange={(e) => updateSelectedFontSize(Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-800 dark:text-slate-200"
                    >
                      {[6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72].map((s) => (
                        <option key={s} value={s}>{s}px</option>
                      ))}
                    </select>

                    {/* Controles de Estilos Tipográficos */}
                    <div className="flex items-center gap-1.5 border-l border-r border-slate-200 dark:border-slate-800 px-2.5 py-0.5">
                      {/* Negrita */}
                      <button
                        onClick={toggleSelectedBold}
                        className={`p-1.5 rounded-lg text-xs font-bold w-7 h-7 flex items-center justify-center transition-all ${
                          selectedElement.fontWeight === 'bold'
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-250'
                        }`}
                        title="Negrita"
                      >
                        N
                      </button>

                      {/* Cursiva */}
                      <button
                        onClick={toggleSelectedItalic}
                        className={`p-1.5 rounded-lg text-xs italic font-semibold w-7 h-7 flex items-center justify-center transition-all ${
                          selectedElement.fontStyle === 'italic'
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-250'
                        }`}
                        title="Cursiva"
                      >
                        K
                      </button>

                      {/* Familia de fuente */}
                      <select
                        value={selectedElement.fontFamily || 'sans-serif'}
                        onChange={(e) => updateSelectedFontFamily(e.target.value as 'sans-serif' | 'serif')}
                        className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-800 dark:text-slate-200"
                      >
                        <option value="sans-serif">Sans-Serif</option>
                        <option value="serif">Serif (Times)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Color:</span>
                      <input
                        type="color"
                        value={selectedElement.color}
                        onChange={(e) => updateSelectedColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </>
                )}

                {selectedElement.type === 'shape' && (
                  <>
                    <span className="text-xs text-slate-400 font-bold select-none">Forma:</span>
                    
                    {/* Color de Relleno */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Relleno:</span>
                      <input
                        type="color"
                        value={selectedElement.color}
                        onChange={(e) => updateSelectedColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>

                    {/* Color de Borde */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Borde:</span>
                      <input
                        type="color"
                        value={selectedElement.borderColor}
                        onChange={(e) => updateSelectedBorderColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>

                    {/* Grosor de Borde */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Grosor:</span>
                      <select
                        value={selectedElement.borderWidth}
                        onChange={(e) => updateSelectedBorderWidth(Number(e.target.value))}
                        className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200"
                      >
                        {[0, 1, 2, 3, 4, 6, 8, 12].map((w) => (
                          <option key={w} value={w}>{w === 0 ? 'Sin Borde' : `${w}px`}</option>
                        ))}
                      </select>
                    </div>

                    {/* Opacidad */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Opacidad:</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={selectedElement.opacity}
                        onChange={(e) => updateSelectedOpacity(Number(e.target.value))}
                        className="w-16 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <span className="text-[10px] font-semibold w-7">{Math.round(selectedElement.opacity * 100)}%</span>
                    </div>
                  </>
                )}

                {selectedElement.type === 'image' && (
                  <span className="text-xs text-slate-400 font-bold select-none">Firma / Imagen seleccionada</span>
                )}

                <button
                  onClick={deleteSelectedElement}
                  className="text-red-500 hover:text-red-650 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                  title="Eliminar elemento del lienzo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(0.2, Number((zoom - 0.2).toFixed(1))))}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors"
                title="Alejar Zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-slate-500 select-none w-14 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(10.0, Number((zoom + 0.2).toFixed(1))))}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors"
                title="Acercar Zoom (Hasta 1000%)"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            
            {/* MINIATURAS */}
            <div className="w-full lg:w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex lg:flex-col gap-4 overflow-x-auto lg:overflow-x-visible lg:max-h-[600px] lg:overflow-y-auto transition-colors">
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
                        ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400' 
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

            {/* ÁREA DEL LIENZO */}
            <div className="flex-grow flex flex-col items-center gap-4 w-full">
              
              <div className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-sm transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Página {currentPage} de {numPages}
                  </span>
                  {activePageDeleted && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/15 animate-pulse">
                      <ShieldAlert className="h-3 w-3" />
                      Excluida del documento final
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
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-750 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all"
                        title="Rotar página 90 grados"
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

              {/* CONTENEDOR DEL LIENZO */}
              <div 
                className="relative overflow-auto border border-slate-200 dark:border-slate-800 rounded-3xl max-w-full bg-slate-100 dark:bg-slate-900/30 flex justify-center items-center p-4 min-h-[400px] w-full transition-colors"
                onClick={() => setSelectedElementId(null)}
              >
                {activePageDeleted ? (
                  <div className="text-center p-8 max-w-md">
                    <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-3" />
                    <h4 className="font-bold text-slate-855 dark:text-white mb-1">Esta página ha sido excluida</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      No se incluirá en el archivo compilado. Puedes recuperarla en cualquier momento presionando el botón "Recuperar Página" superior.
                    </p>
                  </div>
                ) : (
                  <div 
                    ref={containerRef}
                    className="relative cursor-default select-none shadow-lg bg-white"
                    style={{ 
                      width: canvasSize.width > 0 ? canvasSize.width : 'auto', 
                      height: canvasSize.height > 0 ? canvasSize.height : 'auto' 
                    }}
                    onPointerMove={handleContainerPointerMove}
                    onPointerUp={handleContainerPointerUp}
                  >
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full block rounded-xl pointer-events-none"
                      style={{ width: '100%', height: '100%' }}
                    />

                    {/* Capa de Edición y Superposición */}
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      
                      {/* 1. Capa de Texto Original */}
                      {isEditTextMode && originalTextItems.map((item) => {
                        if (hiddenOriginalTextIds.has(item.id)) return null;
                        return (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOriginalText(item);
                            }}
                            className="absolute border border-dashed border-emerald-500/50 hover:border-emerald-600 hover:bg-emerald-500/10 cursor-pointer pointer-events-auto z-20 group"
                            style={{
                              left: `${item.x * 100}%`,
                              top: `${item.y * 100}%`,
                              width: `${item.width * 100}%`,
                              height: `${item.height * 100}%`,
                              willChange: 'transform',
                            }}
                            title="Haz clic para modificar este texto original preservando el formato"
                          >
                            <div className="absolute top-[-16px] left-0 bg-emerald-600 text-white text-[8px] px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none select-none">
                              Modificar texto (conservando formato)
                            </div>
                          </div>
                        );
                      })}

                      {/* 2. Capa de Elementos de Edición */}
                      {pageElements.map((el) => {
                        const isSel = el.id === selectedElementId;

                        if (el.type === 'text') {
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                const newTxt = prompt('Editar texto:', el.text);
                                if (newTxt !== null) updateSelectedText(newTxt);
                              }}
                              className={`absolute cursor-move select-none pointer-events-auto px-2 py-1 rounded transition-all group ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 bg-white/90 dark:bg-slate-900/90 shadow-md z-30' 
                                  : 'hover:bg-slate-500/10 hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                fontSize: `${el.fontSize / 2}px`,
                                color: el.color,
                                fontFamily: el.fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Helvetica, Arial, sans-serif',
                                fontWeight: el.fontWeight || 'normal',
                                fontStyle: el.fontStyle || 'normal',
                                transform: 'translate(0, 0)',
                                whiteSpace: 'nowrap',
                                willChange: 'left, top',
                                touchAction: 'none',
                              }}
                              title="Doble clic para editar. Arrastra para mover."
                            >
                              {el.text}
                            </div>
                          );
                        } else if (el.type === 'image') {
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute cursor-move pointer-events-auto transition-all ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 shadow-md z-30' 
                                  : 'hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                width: `${el.width * 100}%`,
                                height: `${el.height * 100}%`,
                                willChange: 'left, top, width, height',
                                touchAction: 'none',
                              }}
                            >
                              <img 
                                src={el.dataUrl} 
                                alt="Imagen" 
                                className="w-full h-full object-contain pointer-events-none"
                              />

                              {isSel && (
                                <div
                                  onPointerDown={(e) => startResize(e, el)}
                                  className="absolute bottom-[-5px] right-[-5px] w-3.5 h-3.5 bg-emerald-500 border border-white dark:border-slate-900 rounded-full cursor-se-resize z-25 pointer-events-auto shadow-sm"
                                  title="Cambiar tamaño"
                                />
                              )}
                            </div>
                          );
                        } else if (el.type === 'shape') {
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute cursor-move pointer-events-auto transition-all ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 shadow-md z-30' 
                                  : 'hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                width: `${el.width * 100}%`,
                                height: `${el.height * 100}%`,
                                backgroundColor: el.color,
                                border: el.borderWidth > 0 ? `${el.borderWidth / 2}px solid ${el.borderColor}` : 'none',
                                borderRadius: el.shapeType === 'circle' ? '50%' : '0px',
                                opacity: el.opacity,
                                willChange: 'left, top, width, height',
                                touchAction: 'none',
                              }}
                            >
                              {isSel && (
                                <div
                                  onPointerDown={(e) => startResize(e, el)}
                                  className="absolute bottom-[-5px] right-[-5px] w-3.5 h-3.5 bg-emerald-500 border border-white dark:border-slate-900 rounded-full cursor-se-resize z-25 pointer-events-auto shadow-sm"
                                  title="Cambiar tamaño"
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

              {/* Paginación */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-xs font-bold text-slate-500 select-none">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage === numPages}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* BOTONES INFERIORES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 transition-colors">
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
