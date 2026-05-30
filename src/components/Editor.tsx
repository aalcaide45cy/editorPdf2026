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
  Edit3,
  Undo,
  Redo,
  ChevronDown
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import SignaturePad from './SignaturePad';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

const GOOGLE_FONTS = [
  { name: 'Inter', category: 'Sans-Serif' },
  { name: 'Roboto', category: 'Sans-Serif' },
  { name: 'Poppins', category: 'Sans-Serif' },
  { name: 'Montserrat', category: 'Sans-Serif' },
  { name: 'Lato', category: 'Sans-Serif' },
  { name: 'Open Sans', category: 'Sans-Serif' },
  { name: 'Raleway', category: 'Sans-Serif' },
  { name: 'Nunito', category: 'Sans-Serif' },
  { name: 'Oswald', category: 'Sans-Serif' },
  { name: 'Ubuntu', category: 'Sans-Serif' },
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'Lora', category: 'Serif' },
  { name: 'PT Serif', category: 'Serif' },
  { name: 'EB Garamond', category: 'Serif' },
  { name: 'Crimson Text', category: 'Serif' },
  { name: 'Libre Baskerville', category: 'Serif' },
  { name: 'Cinzel', category: 'Serif' },
  { name: 'Fira Code', category: 'Monospace' },
  { name: 'JetBrains Mono', category: 'Monospace' },
  { name: 'Source Code Pro', category: 'Monospace' },
  { name: 'Pacifico', category: 'Script' },
  { name: 'Caveat', category: 'Script' },
  { name: 'Dancing Script', category: 'Script' },
];

const fetchGoogleFontTtf = async (fontName: string): Promise<ArrayBuffer | null> => {
  try {
    const cleanName = fontName.replace(/\s+/g, '').toLowerCase();
    const cleanFontName = fontName.replace(/\s+/g, '');
    
    // OFL license
    let fontUrl = `https://raw.githubusercontent.com/google/fonts/main/ofl/${cleanName}/${cleanFontName}-Regular.ttf`;
    let res = await fetch(fontUrl);
    if (!res.ok) {
      // Apache license
      fontUrl = `https://raw.githubusercontent.com/google/fonts/main/apache/${cleanName}/${cleanFontName}-Regular.ttf`;
      res = await fetch(fontUrl);
    }
    if (!res.ok) {
      // UFL license
      fontUrl = `https://raw.githubusercontent.com/google/fonts/main/ufl/${cleanName}/${cleanFontName}-Regular.ttf`;
      res = await fetch(fontUrl);
    }
    
    if (res.ok) {
      return await res.arrayBuffer();
    }
    
    // Fallback: parse font family WOFF/TTF from CSS API
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.1'
      }
    });
    const cssText = await cssRes.text();
    const match = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/) || cssText.match(/url\((https:\/\/[^)]+\.otf)\)/) || cssText.match(/url\((https:\/\/[^)]+)\)/);
    if (match) {
      const fbRes = await fetch(match[1]);
      if (fbRes.ok) {
        return await fbRes.arrayBuffer();
      }
    }
    return null;
  } catch (err) {
    console.error('Error fetching font TTF:', fontName, err);
    return null;
  }
};

const cleanFontSubsetPrefix = (name: string): string => {
  if (!name) return name;
  const plusIdx = name.indexOf('+');
  return plusIdx !== -1 ? name.slice(plusIdx + 1) : name;
};

const getCssFontFamily = (el: { pdfFontName?: string; fontFamily?: string }) => {
  if (el.pdfFontName) {
    const cleaned = cleanFontSubsetPrefix(el.pdfFontName).trim();
    if (cleaned.includes(' ') && !cleaned.startsWith('"') && !cleaned.startsWith("'")) {
      return `"${cleaned}", sans-serif`;
    }
    return cleaned;
  }
  if (!el.fontFamily) return 'Helvetica, Arial, sans-serif';
  if (el.fontFamily === 'sans-serif') return 'Helvetica, Arial, sans-serif';
  if (el.fontFamily === 'serif') return 'Georgia, "Times New Roman", serif';
  if (el.fontFamily === 'monospace') return 'Courier, "Courier New", monospace';
  return `"${el.fontFamily}", Helvetica, Arial, sans-serif`;
};

interface TextElement {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight?: 'bold' | 'normal' | 'medium' | 'semibold' | 'light';
  fontStyle?: 'italic' | 'normal';
  fontFamily?: string;
  originalTextId?: string;
  pdfFontName?: string;
  underline?: boolean;
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
  fontWeight: 'bold' | 'normal' | 'medium' | 'semibold' | 'light';
  fontStyle: 'italic' | 'normal';
  fontFamily: string;
  pdfFontName?: string;
  underline?: boolean;
}

// Analizar colores de texto y fondo leyendo píxeles del canvas con límites de seguridad estrictos
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
    let pxX = Math.round(x * canvas.width);
    let pxY = Math.round(y * canvas.height);
    let pxW = Math.round(width * canvas.width);
    let pxH = Math.round(height * canvas.height);

    // Ajustar límites de seguridad
    pxX = Math.max(0, Math.min(canvas.width - 1, pxX));
    pxY = Math.max(0, Math.min(canvas.height - 1, pxY));
    pxW = Math.max(1, Math.min(canvas.width - pxX, pxW));
    pxH = Math.max(1, Math.min(canvas.height - pxY, pxH));

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
      if (diff > 30) { // Umbral de contraste más sensible (30) para trazos finos
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
      const brightness = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
      textColor = brightness > 125 ? '#000000' : '#ffffff';
    }

    return { textColor, bgColor };
  } catch (err) {
    console.error('Error al detectar colores del canvas:', err);
    return { textColor: '#000000', bgColor: '#ffffff' };
  }
};

const mapFontWeightToCss = (weight?: string) => {
  if (!weight) return 'normal';
  if (weight === 'bold') return 'bold';
  if (weight === 'semibold') return 'bold';
  if (weight === 'medium') return 'bold';
  if (weight === 'light') return '300';
  return 'normal';
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
  
  // Undo/History stack
  const [history, setHistory] = useState<{[page: number]: EditorElement[]}[]>([]);

  // Original PDF text detection
  const [isEditTextMode, setIsEditTextMode] = useState(false);
  const [originalTextItems, setOriginalTextItems] = useState<OriginalTextItem[]>([]);
  
  // Redo stack
  const [redoHistory, setRedoHistory] = useState<{[page: number]: EditorElement[]}[]>([]);

  // Derived hidden original text IDs
  const hiddenOriginalTextIds = React.useMemo(() => {
    const ids = new Set<string>();
    Object.values(elements).forEach((pageEls) => {
      pageEls.forEach((el) => {
        if (el.type === 'text' && el.originalTextId) {
          ids.add(el.originalTextId);
        }
      });
    });
    return ids;
  }, [elements]);

  // Inline text editing states
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const wasElementClickRef = useRef(false);
  const [activeGuides, setActiveGuides] = useState<{ x: number | null, y: number | null }>({ x: null, y: null });

  // Interactive tools states
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  const shapesDropdownRef = useRef<HTMLDivElement>(null);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const [showInlineFontDropdown, setShowInlineFontDropdown] = useState(false);
  const [inlineFontSearch, setInlineFontSearch] = useState('');
  const inlineFontDropdownRef = useRef<HTMLDivElement>(null);
  const activeRenderTaskRef = useRef<any>(null);
  
  // Drag & Resize references for HIGH PERFORMANCE (Zero Lag)
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const elementCoordsRef = useRef({ x: 0, y: 0 });
  const resizeDataRef = useRef({ width: 0, height: 0, startX: 0, startY: 0 });
  const elementSizeRef = useRef({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auxiliar para propagar y guardar en el historial (Deshacer)
  const pushToHistory = (newElements: {[page: number]: EditorElement[]}) => {
    setHistory((prev) => [...prev, elements]);
    setElements(newElements);
    setRedoHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousElements = history[history.length - 1];
    setRedoHistory((prev) => [...prev, elements]);
    setElements(previousElements);
    setHistory((prev) => prev.slice(0, -1));
    
    if (selectedElementId) {
      const pageEls = previousElements[currentPage] || [];
      const exists = pageEls.some((el) => el.id === selectedElementId);
      if (!exists) {
        setSelectedElementId(null);
        setEditingTextElementId(null);
      }
    } else {
      setSelectedElementId(null);
      setEditingTextElementId(null);
    }
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const nextElements = redoHistory[redoHistory.length - 1];
    setHistory((prev) => [...prev, elements]);
    setElements(nextElements);
    setRedoHistory((prev) => prev.slice(0, -1));
    
    if (selectedElementId) {
      const pageEls = nextElements[currentPage] || [];
      const exists = pageEls.some((el) => el.id === selectedElementId);
      if (!exists) {
        setSelectedElementId(null);
        setEditingTextElementId(null);
      }
    } else {
      setSelectedElementId(null);
      setEditingTextElementId(null);
    }
  };

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

  // Cerrar desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shapesDropdownRef.current && !shapesDropdownRef.current.contains(e.target as Node)) {
        setShowShapesDropdown(false);
      }
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setShowFontDropdown(false);
      }
      if (inlineFontDropdownRef.current && !inlineFontDropdownRef.current.contains(e.target as Node)) {
        setShowInlineFontDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cargar Google Fonts en bloque para vistas previas del editor
  useEffect(() => {
    const fontNamesLink = GOOGLE_FONTS.map(f => f.name.replace(/\s+/g, '+')).join('|');
    const link = document.createElement('link');
    link.id = 'google-fonts-preview-link';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css?family=${fontNamesLink}&display=swap`;
    document.head.appendChild(link);
    return () => {
      const el = document.getElementById('google-fonts-preview-link');
      if (el) document.head.removeChild(el);
    };
  }, []);

  // Renderizar la página actual cuando cambia el PDF, la página actual o el zoom
  useEffect(() => {
    if (!pdfDocProxy) return;
    renderPage(currentPage);
  }, [pdfDocProxy, currentPage, zoom, rotations[currentPage]]);

  // Detección de texto original del PDF al cambiar de página
  useEffect(() => {
    if (!pdfDocProxy) {
      setOriginalTextItems([]);
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
            
            let fontSize = Math.round(item.height || Math.abs(matrix[3]) || 12);
            if (fontSize < 4) {
              fontSize = Math.round(Math.abs(matrix[3])) || 12;
            }
            if (fontSize < 4) {
              fontSize = 12;
            }
            
            const itemWidth = item.width * viewport.scale;
            const itemHeight = fontSize * viewport.scale;

            // Extraer estilo desde textContent.styles para mayor precisión
            const fontStyleObj = textContent.styles[item.fontName];
            const fontNameFull = ((fontStyleObj ? fontStyleObj.fontFamily : '') || item.fontName || '').toLowerCase();
            const plusIdx = fontNameFull.indexOf('+');
            const fontName = plusIdx !== -1 ? fontNameFull.slice(plusIdx + 1) : fontNameFull;
            
            let fontWeight: 'bold' | 'normal' | 'medium' | 'semibold' | 'light' = 'normal';
            if (fontName.includes('black') || fontName.includes('heavy') || fontName.includes('w900')) {
              fontWeight = 'bold';
            } else if (
              fontName.includes('bold') || 
              fontName.includes('w700') || 
              fontName.includes('w800') || 
              fontName.includes('w850') || 
              fontName.includes('-bd') || 
              fontName.endsWith('bd') ||
              fontName.includes('-bold') ||
              fontName.includes('_bold') ||
              fontName.includes('.bold') ||
              fontName.includes('boldmt') ||
              fontName.endsWith('-b') ||
              fontName.endsWith('_b')
            ) {
              fontWeight = 'bold';
            } else if (fontName.includes('semibold') || fontName.includes('w600') || fontName.includes('demi') || fontName.includes('semi-bold') || fontName.includes('semi')) {
              fontWeight = 'semibold';
            } else if (fontName.includes('medium') || fontName.includes('w500') || fontName.includes('med')) {
              fontWeight = 'medium';
            } else if (fontName.includes('light') || fontName.includes('w300') || fontName.includes('lt')) {
              fontWeight = 'light';
            }

            const isItalic = fontName.includes('italic') || 
                             fontName.includes('oblique') || 
                             fontName.includes('obli') || 
                             fontName.includes('-it') ||
                             fontName.endsWith('it') ||
                             fontName.includes('slant');
            
            const isMonospace = fontName.includes('mono') || fontName.includes('courier') || fontName.includes('consolas') || fontName.includes('code');
            const isSerif = (fontName.includes('serif') && !fontName.includes('sans')) || fontName.includes('times') || fontName.includes('roman') || fontName.includes('georgia') || fontName.includes('cambria') || fontName.includes('garamond');
            
            let fontFamily: 'sans-serif' | 'serif' | 'monospace' = 'sans-serif';
            if (isMonospace) fontFamily = 'monospace';
            else if (isSerif) fontFamily = 'serif';

            return {
              id: `orig-${currentPage}-${idx}`,
              text: item.str,
              x: x / viewport.width,
              y: (y - itemHeight) / viewport.height,
              width: itemWidth / viewport.width,
              height: itemHeight / viewport.height,
              fontSize: fontSize,
              fontWeight,
              fontStyle: isItalic ? 'italic' : 'normal',
              fontFamily,
              pdfFontName: cleanFontSubsetPrefix(
                fontStyleObj && fontStyleObj.fontFamily && !['sans-serif', 'serif', 'monospace'].includes(fontStyleObj.fontFamily)
                  ? fontStyleObj.fontFamily
                  : item.fontName
              ),
            };
          });
        
        setOriginalTextItems(items);
      } catch (err) {
        console.error('Error cargando textos originales:', err);
      }
    };

    loadOriginalText();
  }, [pdfDocProxy, currentPage, rotations[currentPage]]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocProxy || !canvasRef.current) return;

    // Cancelar cualquier renderizado activo previo en este canvas para evitar carreras visuales
    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel();
      } catch (err) {
        // Ignorar error al cancelar
      }
    }

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

      const renderTask = page.render(renderContext);
      activeRenderTaskRef.current = renderTask;

      await renderTask.promise;
      
      setCanvasSize({ width: viewport.width / 2, height: viewport.height / 2 });
    } catch (error: any) {
      if (error && (error.name === 'HeadingStatus' || error.name === 'RenderingCancelledException' || error.message?.includes('cancelled'))) {
        return; // Ignorar cancelaciones esperadas por concurrencia
      }
      console.error('Error rendering page:', error);
    } finally {
      activeRenderTaskRef.current = null;
    }
  };

  const adjustZoomToFitWidth = async (docProxy: pdfjsLib.PDFDocumentProxy) => {
    if (!canvasWrapperRef.current) return;
    try {
      const page = await docProxy.getPage(currentPage);
      const rotation = rotations[currentPage] || 0;
      
      const viewport = page.getViewport({ scale: 1.0, rotation });
      const pageWidth = viewport.width;

      const wrapperWidth = canvasWrapperRef.current.clientWidth;
      if (wrapperWidth < 50) return; // Evitar calcular zoom erróneo cuando el contenedor está colapsado

      const targetWidth = Math.max(200, wrapperWidth - 48);

      let calculatedZoom = (targetWidth * 2) / pageWidth;
      calculatedZoom = Number(calculatedZoom.toFixed(1));
      calculatedZoom = Math.max(0.4, Math.min(3.0, calculatedZoom));
      
      setZoom(calculatedZoom);
    } catch (err) {
      console.error('Error adjusting zoom to fit width:', err);
    }
  };

  // Ajustar el zoom automático del PDF usando un ResizeObserver para reaccionar al tamaño del contenedor de forma fluida
  useEffect(() => {
    if (!pdfDocProxy || !canvasWrapperRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 50) {
          adjustZoomToFitWidth(pdfDocProxy);
        }
      }
    });

    resizeObserver.observe(canvasWrapperRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [pdfDocProxy, currentPage, rotations[currentPage]]);

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
        setEditingTextElementId(null);
        setIsEditTextMode(false);
        setHistory([]);
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
    setEditingTextElementId(null);
    setIsEditTextMode(false);
    setHistory([]);
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

  // Handlers para edición inline de texto
  const handleStartTextEdit = (element: TextElement) => {
    setEditingTextElementId(element.id);
    setTempText(element.text);
    setSelectedElementId(element.id);
  };

  const handleConfirmTextEdit = (id: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === id && el.type === 'text') {
        return { ...el, text: tempText } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
    setEditingTextElementId(null);
    setSelectedElementId(null);
  };

  const handleCancelTextEdit = () => {
    setEditingTextElementId(null);
    setSelectedElementId(null);
  };

  // Añadir elementos de edición
  const addTextElement = () => {
    if (editingTextElementId) {
      handleConfirmTextEdit(editingTextElementId);
    }
    const newTextId = `text-${Date.now()}`;
    const newText: TextElement = {
      id: newTextId,
      type: 'text',
      text: 'Nuevo Texto',
      x: 0.1,
      y: 0.1,
      fontSize: 16,
      color: '#000000',
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontFamily: 'sans-serif'
    };
    const pageElements = elements[currentPage] || [];
    pushToHistory({
      ...elements,
      [currentPage]: [...pageElements, newText],
    });
    setSelectedElementId(newTextId);
    handleStartTextEdit(newText); // Abrir edición inline automáticamente
  };

  const addSignatureElement = (dataUrl: string) => {
    if (editingTextElementId) {
      handleConfirmTextEdit(editingTextElementId);
    }
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
    pushToHistory({
      ...elements,
      [currentPage]: [...pageElements, newSig],
    });
    setSelectedElementId(newSig.id);
    setShowSignaturePad(false);
  };

  const addShapeElement = (shapeType: 'rect' | 'circle') => {
    if (editingTextElementId) {
      handleConfirmTextEdit(editingTextElementId);
    }
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
    pushToHistory({
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
          if (editingTextElementId) {
            handleConfirmTextEdit(editingTextElementId);
          }
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
          pushToHistory({
            ...elements,
            [currentPage]: [...pageElements, newImg],
          });
          setSelectedElementId(newImg.id);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const alignSelectedElement = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!selectedElementId) return;
    const pageElements = elements[currentPage] || [];
    const currentEl = pageElements.find(item => item.id === selectedElementId);
    if (!currentEl) return;

    let elWidth = 0.15;
    let elHeight = 0.04;
    if (currentEl.type === 'text') {
      elWidth = Math.min(0.8, (currentEl.text.length * currentEl.fontSize * 0.5) / 595);
      elHeight = currentEl.fontSize / 842;
    } else if ('width' in currentEl && 'height' in currentEl) {
      elWidth = currentEl.width;
      elHeight = currentEl.height;
    }

    let newX = currentEl.x;
    let newY = currentEl.y;

    if (type === 'left') newX = 0.05;
    else if (type === 'center') newX = 0.5 - elWidth / 2;
    else if (type === 'right') newX = 0.95 - elWidth;
    else if (type === 'top') newY = 0.05;
    else if (type === 'middle') newY = 0.5 - elHeight / 2;
    else if (type === 'bottom') newY = 0.95 - elHeight;

    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId) {
        return { ...el, x: newX, y: newY };
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  // Simular la edición del texto original con preservación de formato completo
  const handleEditOriginalText = (item: OriginalTextItem) => {
    if (editingTextElementId) {
      handleConfirmTextEdit(editingTextElementId);
    }
    let detectedTextColor = '#000000';
    let detectedBgColor = '#ffffff';

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
    const timestamp = Date.now();
    const whiteoutId = `whiteout-orig-${timestamp}`;
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
    const textId = `text-edit-${timestamp}`;
    const editableText: TextElement = {
      id: textId,
      type: 'text',
      text: item.text,
      x: item.x,
      y: item.y,
      fontSize: item.fontSize,
      color: detectedTextColor, 
      fontWeight: item.fontWeight,
      fontStyle: item.fontStyle,
      fontFamily: item.fontFamily,
      originalTextId: item.id,
      pdfFontName: item.pdfFontName,
    };

    const pageElements = elements[currentPage] || [];
    pushToHistory({
      ...elements,
      [currentPage]: [...pageElements, whiteoutShape, editableText],
    });

    setSelectedElementId(textId);
    handleStartTextEdit(editableText); // Abrir edición inline automáticamente
  };

  // --- LÓGICA DE ARRASTRE Y REDIMENSIÓN DE ALTO RENDIMIENTO (SIN LAG) ---
  const handleElementPointerDown = (e: React.PointerEvent<HTMLDivElement>, element: EditorElement) => {
    e.stopPropagation();
    
    // Si ya estábamos editando otro texto, guardar sus cambios primero
    if (editingTextElementId && editingTextElementId !== element.id) {
      handleConfirmTextEdit(editingTextElementId);
    }

    setSelectedElementId(element.id);
    wasElementClickRef.current = true;
    
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
    wasElementClickRef.current = true;
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
    const pageElements = elements[currentPage] || [];

    if (isDraggingRef.current) {
      let newX = (currentX - dragOffsetRef.current.x) / rect.width;
      let newY = (currentY - dragOffsetRef.current.y) / rect.height;

      // Obtener dimensiones estimadas del elemento actual para limitar y hacer snapping
      const currentEl = pageElements.find(item => item.id === selectedElementId);
      let elWidth = 0.15;
      let elHeight = 0.04;
      if (currentEl) {
        if (currentEl.type === 'text') {
          elWidth = Math.min(0.8, (currentEl.text.length * currentEl.fontSize * 0.5) / 595);
          elHeight = currentEl.fontSize / 842;
        } else if ('width' in currentEl && 'height' in currentEl) {
          elWidth = currentEl.width;
          elHeight = currentEl.height;
        }
      }

      newX = Math.max(0, Math.min(1 - elWidth, newX));
      newY = Math.max(0, Math.min(1 - elHeight, newY));

      // LÓGICA DE SNAPPING E INTEL-GUIDES
      const snapThreshold = 0.012; // 1.2% de la página
      let snappedX: number | null = null;
      let snappedY: number | null = null;

      const currentCenterX = newX + elWidth / 2;
      const currentCenterY = newY + elHeight / 2;
      const currentRight = newX + elWidth;
      const currentBottom = newY + elHeight;

      // Snap vertical (guías en eje X)
      if (Math.abs(currentCenterX - 0.5) < snapThreshold) {
        newX = 0.5 - elWidth / 2;
        snappedX = 0.5;
      } else {
        for (const other of pageElements) {
          if (other.id === selectedElementId) continue;
          let otherWidth = 0.15;
          if (other.type === 'text') {
            otherWidth = Math.min(0.8, (other.text.length * other.fontSize * 0.5) / 595);
          } else if ('width' in other) {
            otherWidth = other.width;
          }
          const otherRight = other.x + otherWidth;
          const otherCenterX = other.x + otherWidth / 2;

          if (Math.abs(newX - other.x) < snapThreshold) {
            newX = other.x;
            snappedX = other.x;
            break;
          }
          if (Math.abs(currentCenterX - otherCenterX) < snapThreshold) {
            newX = otherCenterX - elWidth / 2;
            snappedX = otherCenterX;
            break;
          }
          if (Math.abs(currentRight - otherRight) < snapThreshold) {
            newX = otherRight - elWidth;
            snappedX = otherRight;
            break;
          }
        }
      }

      // Snap horizontal (guías en eje Y)
      if (Math.abs(currentCenterY - 0.5) < snapThreshold) {
        newY = 0.5 - elHeight / 2;
        snappedY = 0.5;
      } else {
        for (const other of pageElements) {
          if (other.id === selectedElementId) continue;
          let otherHeight = 0.04;
          if (other.type === 'text') {
            otherHeight = other.fontSize / 842;
          } else if ('height' in other) {
            otherHeight = other.height;
          }
          const otherBottom = other.y + otherHeight;
          const otherCenterY = other.y + otherHeight / 2;

          if (Math.abs(newY - other.y) < snapThreshold) {
            newY = other.y;
            snappedY = other.y;
            break;
          }
          if (Math.abs(currentCenterY - otherCenterY) < snapThreshold) {
            newY = otherCenterY - elHeight / 2;
            snappedY = otherCenterY;
            break;
          }
          if (Math.abs(currentBottom - otherBottom) < snapThreshold) {
            newY = otherBottom - elHeight;
            snappedY = otherBottom;
            break;
          }
        }
      }
      
      elementCoordsRef.current = { x: newX, y: newY };
      
      dragTargetRef.current.style.left = `${newX * 100}%`;
      dragTargetRef.current.style.top = `${newY * 100}%`;
      setActiveGuides({ x: snappedX, y: snappedY });
      
    } else if (isResizingRef.current) {
      const deltaX = currentX - resizeDataRef.current.startX;
      const deltaY = currentY - resizeDataRef.current.startY;
      
      let newWidth = resizeDataRef.current.width + (deltaX / rect.width);
      let newHeight = resizeDataRef.current.height + (deltaY / rect.height);
      
      const el = pageElements.find(item => item.id === selectedElementId);
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
      const orig = pageElements.find(item => item.id === selectedElementId);
      if (orig && (orig.x !== elementCoordsRef.current.x || orig.y !== elementCoordsRef.current.y)) {
        pushToHistory({ ...elements, [currentPage]: updated });
      }
    } else if (isResizingRef.current && selectedElementId) {
      const pageElements = elements[currentPage] || [];
      const updated = pageElements.map((el) => {
        if (el.id === selectedElementId && (el.type === 'image' || el.type === 'shape')) {
          return { ...el, width: elementSizeRef.current.width, height: elementSizeRef.current.height };
        }
        return el;
      });
      const orig = pageElements.find(item => item.id === selectedElementId) as any;
      if (orig && (orig.width !== elementSizeRef.current.width || orig.height !== elementSizeRef.current.height)) {
        pushToHistory({ ...elements, [currentPage]: updated });
      }
    }

    isDraggingRef.current = false;
    isResizingRef.current = false;
    dragTargetRef.current = null;
    setActiveGuides({ x: null, y: null });
  };

  // Modificaciones de propiedades con pushToHistory
  const updateSelectedText = (text: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, text } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedFontSize = (fontSize: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        return { ...el, fontSize } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedColor = (color: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId) {
        return { ...el, color } as any;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const toggleSelectedBold = () => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const next = el.fontWeight === 'bold' ? 'normal' : 'bold';
        const { pdfFontName, ...rest } = el;
        return { ...rest, fontWeight: next } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const toggleSelectedItalic = () => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const next = el.fontStyle === 'italic' ? 'normal' : 'italic';
        const { pdfFontName, ...rest } = el;
        return { ...rest, fontStyle: next } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedFontFamily = (family: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const { pdfFontName, ...rest } = el;
        return { ...rest, fontFamily: family } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const toggleSelectedUnderline = () => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'text') {
        const next = !el.underline;
        return { ...el, underline: next } as TextElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedBorderColor = (borderColor: string) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, borderColor } as ShapeElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedBorderWidth = (borderWidth: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, borderWidth } as ShapeElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const updateSelectedOpacity = (opacity: number) => {
    const pageElements = elements[currentPage] || [];
    const updated = pageElements.map((el) => {
      if (el.id === selectedElementId && el.type === 'shape') {
        return { ...el, opacity } as ShapeElement;
      }
      return el;
    });
    pushToHistory({ ...elements, [currentPage]: updated });
  };

  const deleteSelectedElement = () => {
    if (!selectedElementId) return;
    const pageElements = elements[currentPage] || [];
    
    const elementToDelete = pageElements.find(el => el.id === selectedElementId);
    let updated = pageElements.filter((el) => el.id !== selectedElementId);
    
    if (selectedElementId.startsWith('text-edit-')) {
      const timestamp = selectedElementId.replace('text-edit-', '');
      const whiteoutId = `whiteout-orig-${timestamp}`;
      updated = updated.filter((el) => el.id !== whiteoutId);
    }
    
    pushToHistory({ ...elements, [currentPage]: updated });
    setSelectedElementId(null);
    setEditingTextElementId(null);
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
              let embeddedFont = null;

              if (el.fontFamily && !['sans-serif', 'serif', 'monospace'].includes(el.fontFamily)) {
                try {
                  const fontBuffer = await fetchGoogleFontTtf(el.fontFamily);
                  if (fontBuffer) {
                    embeddedFont = await pdfDoc.embedFont(fontBuffer);
                  }
                } catch (err) {
                  console.error('Error al incrustar Google Font:', el.fontFamily, err);
                }
              }

              if (!embeddedFont) {
                let selectedFont = StandardFonts.Helvetica;
                const isSerif = el.fontFamily === 'serif';
                const isMono = el.fontFamily === 'monospace';
                const isBoldFont = el.fontWeight === 'bold' || el.fontWeight === 'semibold' || el.fontWeight === 'medium';
                const isItalicFont = el.fontStyle === 'italic';

                if (isMono) {
                  if (isBoldFont && isItalicFont) {
                    selectedFont = StandardFonts.CourierBoldOblique;
                  } else if (isBoldFont) {
                    selectedFont = StandardFonts.CourierBold;
                  } else if (isItalicFont) {
                    selectedFont = StandardFonts.CourierOblique;
                  } else {
                    selectedFont = StandardFonts.Courier;
                  }
                } else if (isSerif) {
                  if (isBoldFont && isItalicFont) {
                    selectedFont = StandardFonts.TimesRomanBoldItalic;
                  } else if (isBoldFont) {
                    selectedFont = StandardFonts.TimesRomanBold;
                  } else if (isItalicFont) {
                    selectedFont = StandardFonts.TimesRomanItalic;
                  } else {
                    selectedFont = StandardFonts.TimesRoman;
                  }
                } else {
                  if (isBoldFont && isItalicFont) {
                    selectedFont = StandardFonts.HelveticaBoldOblique;
                  } else if (isBoldFont) {
                    selectedFont = StandardFonts.HelveticaBold;
                  } else if (isItalicFont) {
                    selectedFont = StandardFonts.HelveticaOblique;
                  } else {
                    selectedFont = StandardFonts.Helvetica;
                  }
                }
                embeddedFont = await pdfDoc.embedFont(selectedFont);
              }

              const elPdfX = el.x * width;
              const elPdfY = height - (el.y * height) - (el.fontSize * 0.95);

              page.drawText(el.text, {
                x: elPdfX,
                y: elPdfY,
                size: el.fontSize,
                font: embeddedFont,
                color: hexToRgb(el.color),
              });

              if (el.underline) {
                const textWidth = embeddedFont.widthOfTextAtSize(el.text, el.fontSize);
                const underlineY = elPdfY - (el.fontSize * 0.1);
                page.drawLine({
                  start: { x: elPdfX, y: underlineY },
                  end: { x: elPdfX + textWidth, y: underlineY },
                  thickness: Math.max(0.5, el.fontSize * 0.07),
                  color: hexToRgb(el.color),
                });
              }
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
    <div className="w-full flex flex-col gap-6 text-slate-900 dark:text-slate-100 font-sans">
      
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
          className={`border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-355 ${
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4 items-stretch transition-colors">
            
            {/* Fila 1: Acciones de Inserción y Navegación */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={addTextElement}
                  disabled={activePageDeleted}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  title="Añadir Nuevo Texto"
                >
                  <Type className="h-4 w-4" />
                  <span>Texto</span>
                </button>

                {/* Desplegable de Formas */}
                <div className="relative" ref={shapesDropdownRef}>
                  <button
                    onClick={() => setShowShapesDropdown(!showShapesDropdown)}
                    disabled={activePageDeleted}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${
                      showShapesDropdown 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                    title="Formas Básicas"
                  >
                    <Square className="h-4 w-4" />
                    <span>Formas</span>
                    <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </button>

                  {showShapesDropdown && (
                    <div className="absolute left-0 mt-1.5 w-40 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl shadow-xl p-1 z-55 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        onClick={() => {
                          addShapeElement('rect');
                          setShowShapesDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-left transition-colors"
                      >
                        <Square className="h-3.5 w-3.5" />
                        <span>Rectángulo</span>
                      </button>
                      <button
                        onClick={() => {
                          addShapeElement('circle');
                          setShowShapesDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg text-left transition-colors"
                      >
                        <Circle className="h-3.5 w-3.5" />
                        <span>Círculo</span>
                      </button>
                    </div>
                  )}
                </div>

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

                {/* Botón Deshacer */}
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 border border-slate-200 dark:border-slate-800 shadow-sm"
                  title="Deshacer última acción"
                >
                  <Undo className="h-4 w-4" />
                  <span>Deshacer</span>
                </button>

                {/* Botón Rehacer */}
                <button
                  onClick={handleRedo}
                  disabled={redoHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 border border-slate-200 dark:border-slate-800 shadow-sm"
                  title="Rehacer acción deshecha"
                >
                  <Redo className="h-4 w-4" />
                  <span>Rehacer</span>
                </button>

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                {/* Navegación de Páginas */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-750">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-all"
                    title="Página Anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  
                  <select
                    value={currentPage}
                    onChange={(e) => setCurrentPage(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-250 outline-none cursor-pointer px-1.5 py-0.5"
                  >
                    {Array.from({ length: numPages }).map((_, index) => {
                      const pageNum = index + 1;
                      const isDel = deletedPages.has(pageNum);
                      const rot = rotations[pageNum];
                      let label = `Pág. ${pageNum} / ${numPages}`;
                      if (isDel) label += ' (Eliminada)';
                      if (rot) label += ` (${rot}°)`;
                      return (
                        <option key={pageNum} value={pageNum} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                          {label}
                        </option>
                      );
                    })}
                  </select>

                  <button
                    onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                    disabled={currentPage === numPages}
                    className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-all"
                    title="Siguiente Página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Fila 2: Ajustes de Elementos Seleccionados (Condicional) */}
            {selectedElement && editingTextElementId !== selectedElement.id && (
              <div className="flex flex-wrap items-center gap-3">
                {selectedElement.type === 'text' && (
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850">
                    <span className="text-xs text-slate-400 font-bold select-none">Texto:</span>
                    <input
                      type="text"
                      value={selectedElement.text}
                      onChange={(e) => updateSelectedText(e.target.value)}
                      className="bg-white dark:bg-slate-900 text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 w-44 outline-none text-slate-850 dark:text-slate-200 font-medium"
                    />
                    
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <span className="text-[10px] text-slate-400 font-semibold select-none">Tamaño:</span>
                    <select
                      value={selectedElement.fontSize}
                      onChange={(e) => updateSelectedFontSize(Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200"
                    >
                      {Array.from(new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72, Math.round(selectedElement.fontSize)]))
                        .sort((a, b) => a - b)
                        .map((s) => (
                          <option key={s} value={s}>{s}px</option>
                        ))
                      }
                    </select>

                    <button
                      onClick={toggleSelectedBold}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg font-bold text-xs ${
                        selectedElement.fontWeight === 'bold'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Negrita"
                    >
                      N
                    </button>

                    <button
                      onClick={toggleSelectedItalic}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg italic text-xs ${
                        selectedElement.fontStyle === 'italic'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Cursiva"
                    >
                      K
                    </button>

                    <button
                      onClick={toggleSelectedUnderline}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg underline text-xs ${
                        selectedElement.underline
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Subrayado"
                    >
                      S
                    </button>

                    {/* Selector de Fuentes de Google con Vista Previa y Buscador */}
                    <div className="relative" ref={fontDropdownRef}>
                      <button
                        onClick={() => setShowFontDropdown(!showFontDropdown)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm min-w-[130px] justify-between"
                      >
                        <span style={{ fontFamily: selectedElement.fontFamily || 'sans-serif' }}>
                          {selectedElement.fontFamily || 'Sans-Serif'}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>

                      {showFontDropdown && (
                        <div className="absolute left-0 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 z-55 flex flex-col gap-2 max-h-80 animate-in fade-in slide-in-from-top-1 duration-150">
                          {/* Buscador */}
                          <input
                            type="text"
                            placeholder="Buscar fuente..."
                            value={fontSearch}
                            onChange={(e) => setFontSearch(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 text-xs rounded-lg border border-slate-200 dark:border-slate-850 outline-none text-slate-800 dark:text-slate-250 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          />

                          {/* Lista de Fuentes */}
                          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 pr-1 max-h-56">
                            {/* Fuentes Estándar */}
                            <div className="text-[10px] text-slate-400 font-bold px-2 py-1 select-none">
                              Fuentes Estándar
                            </div>
                            {['sans-serif', 'serif', 'monospace'].map((f) => {
                              const label = f === 'sans-serif' ? 'Sans-Serif' : f === 'serif' ? 'Serif' : 'Monospace';
                              if (fontSearch && !label.toLowerCase().includes(fontSearch.toLowerCase())) return null;
                              return (
                                <button
                                  key={f}
                                  onClick={() => {
                                    updateSelectedFontFamily(f);
                                    setShowFontDropdown(false);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium ${
                                    selectedElement.fontFamily === f ? 'text-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10' : 'text-slate-700 dark:text-slate-200'
                                  }`}
                                  style={{ fontFamily: f === 'serif' ? 'Georgia, serif' : f === 'monospace' ? 'Courier, monospace' : 'Helvetica, sans-serif' }}
                                >
                                  {label}
                                </button>
                              );
                            })}

                            {/* Google Fonts */}
                            <div className="text-[10px] text-slate-400 font-bold px-2 py-1 select-none border-t border-slate-100 dark:border-slate-850 mt-1">
                              Google Fonts
                            </div>
                            {GOOGLE_FONTS.filter(f => f.name.toLowerCase().includes(fontSearch.toLowerCase())).map((f) => (
                              <button
                                key={f.name}
                                onClick={() => {
                                  updateSelectedFontFamily(f.name);
                                  setShowFontDropdown(false);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                                  selectedElement.fontFamily === f.name ? 'text-emerald-500 font-bold bg-emerald-500/5 dark:bg-emerald-500/10' : 'text-slate-700 dark:text-slate-200'
                                }`}
                                style={{ fontFamily: f.name }}
                                title={`${f.name} (${f.category})`}
                              >
                                {f.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Color:</span>
                      <input
                        type="color"
                        value={selectedElement.color}
                        onChange={(e) => updateSelectedColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900"
                        title="Color del texto"
                      />
                    </div>

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <select
                      onChange={(e) => {
                        alignSelectedElement(e.target.value as any);
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200 font-semibold"
                    >
                      <option value="" disabled>Alinear...</option>
                      <option value="left">A la Izquierda</option>
                      <option value="center">Al Centro Horizontal</option>
                      <option value="right">A la Derecha</option>
                      <option value="top">Arriba</option>
                      <option value="middle">Al Centro Vertical</option>
                      <option value="bottom">Abajo</option>
                    </select>

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={() => handleStartTextEdit(selectedElement)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm"
                      title="Editar texto directamente"
                    >
                      Editar en PDF
                    </button>

                    <button
                      onClick={deleteSelectedElement}
                      className="text-red-500 hover:text-red-650 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                      title="Eliminar texto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {selectedElement.type === 'shape' && (
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850">
                    <span className="text-xs text-slate-400 font-bold select-none">Forma:</span>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Relleno:</span>
                      <input
                        type="color"
                        value={selectedElement.color}
                        onChange={(e) => updateSelectedColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold select-none">Borde:</span>
                      <input
                        type="color"
                        value={selectedElement.borderColor}
                        onChange={(e) => updateSelectedBorderColor(e.target.value)}
                        className="w-7 h-7 p-0.5 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      />
                    </div>

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

                    <select
                      onChange={(e) => {
                        alignSelectedElement(e.target.value as any);
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200 font-semibold"
                    >
                      <option value="" disabled>Alinear...</option>
                      <option value="left">A la Izquierda</option>
                      <option value="center">Al Centro Horizontal</option>
                      <option value="right">A la Derecha</option>
                      <option value="top">Arriba</option>
                      <option value="middle">Al Centro Vertical</option>
                      <option value="bottom">Abajo</option>
                    </select>

                    <button
                      onClick={deleteSelectedElement}
                      className="text-red-500 hover:text-red-650 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {selectedElement.type === 'image' && (
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850">
                    <span className="text-xs text-slate-400 font-bold select-none">Imagen:</span>
                    
                    <select
                      onChange={(e) => {
                        alignSelectedElement(e.target.value as any);
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="bg-white dark:bg-slate-900 text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200 font-semibold"
                    >
                      <option value="" disabled>Alinear...</option>
                      <option value="left">A la Izquierda</option>
                      <option value="center">Al Centro Horizontal</option>
                      <option value="right">A la Derecha</option>
                      <option value="top">Arriba</option>
                      <option value="middle">Al Centro Vertical</option>
                      <option value="bottom">Abajo</option>
                    </select>

                    <button
                      onClick={deleteSelectedElement}
                      className="text-red-500 hover:text-red-650 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                      title="Eliminar imagen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Fila 3: Zoom y Acciones del PDF */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 w-full">
              {/* Zoom */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom(Math.max(0.2, Number((zoom - 0.2).toFixed(1))))}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
                  title="Alejar Zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold text-slate-500 select-none w-14 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(Math.min(10.0, Number((zoom + 0.2).toFixed(1))))}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-350 transition-colors border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
                  title="Acercar Zoom (Hasta 1000%)"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              {/* Acciones principales de Salida y Descarga */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    if (confirm('¿Estás seguro de que deseas salir y borrar los archivos? Esta acción es irreversible.')) {
                      resetState();
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:bg-red-500/10 px-4 py-2.5 rounded-xl font-bold transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Borrar todo y Salir de forma segura</span>
                </button>

                <button
                  onClick={compileAndDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-emerald-500/20"
                >
                  <Download className="h-4 w-4" />
                  <span>Descargar PDF Editado</span>
                </button>
              </div>
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="w-full flex flex-col items-center gap-4">
              
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
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-205 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all"
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
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-450 rounded-lg text-xs font-semibold transition-all"
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
                ref={canvasWrapperRef}
                className="relative overflow-auto border border-slate-200 dark:border-slate-800 rounded-3xl max-w-full bg-slate-100 dark:bg-slate-900/30 flex justify-center items-center p-4 min-h-[400px] w-full transition-colors"
                onClick={(e) => {
                  if (wasElementClickRef.current) {
                    wasElementClickRef.current = false;
                    return;
                  }
                  if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'CANVAS') {
                    if (editingTextElementId) {
                      handleConfirmTextEdit(editingTextElementId);
                    }
                    setSelectedElementId(null);
                  }
                }}
              >
                {activePageDeleted ? (
                  <div className="text-center p-8 max-w-md">
                    <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-3" />
                    <h4 className="font-bold text-slate-800 dark:text-white mb-1">Esta página ha sido excluida</h4>
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
                            <div className="absolute top-[-16px] left-0 bg-emerald-600 text-white text-[8px] px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none select-none z-30">
                              Modificar texto (conservando formato)
                            </div>
                          </div>
                        );
                      })}

                      {/* 2. Capa de Elementos de Edición */}
                      {pageElements.map((el) => {
                        const isSel = el.id === selectedElementId;
                        const isEditing = el.id === editingTextElementId;

                        if (el.type === 'text') {
                          if (isEditing) {
                            return (
                              <React.Fragment key={el.id}>
                                {/* Campo de texto directo en la posición del PDF */}
                                <input
                                  type="text"
                                  value={tempText}
                                  onChange={(e) => setTempText(e.target.value)}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmTextEdit(el.id);
                                    if (e.key === 'Escape') handleCancelTextEdit();
                                  }}
                                  className="absolute pointer-events-auto rounded bg-transparent z-45 border-0 m-0 focus:ring-0"
                                  style={{
                                    left: `${el.x * 100}%`,
                                    top: `${el.y * 100}%`,
                                    fontSize: `${el.fontSize * (zoom / 2)}px`,
                                    color: el.color,
                                    fontFamily: getCssFontFamily(el),
                                    fontWeight: el.pdfFontName ? 'normal' : mapFontWeightToCss(el.fontWeight),
                                    fontStyle: el.pdfFontName ? 'normal' : (el.fontStyle || 'normal'),
                                    textDecoration: el.underline ? 'underline' : 'none',
                                    width: `${Math.max(120, tempText.length * el.fontSize * (zoom / 2) * 0.56 + 10)}px`,
                                    height: `${el.fontSize * (zoom / 2) * 1.1}px`,
                                    willChange: 'left, top',
                                    lineHeight: '1.1',
                                    padding: '0px',
                                    margin: '0px',
                                    border: 'none',
                                    boxSizing: 'border-box',
                                    verticalAlign: 'baseline',
                                    textIndent: '0px',
                                    backgroundColor: 'transparent',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                    outline: 'none',
                                    boxShadow: '0 0 0 2px #10b981',
                                  }}
                                />

                                {/* Panel flotante de ajustes tipográficos y de color directamente bajo el input */}
                                <div 
                                  className="absolute z-40 pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 flex flex-col gap-2.5 min-w-[280px]"
                                  style={{
                                    left: `${el.x * 100}%`,
                                    top: `${el.y * 100}%`,
                                    transform: `translate(0, ${el.fontSize * (zoom / 2) + 20}px)`, 
                                    willChange: 'left, top',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                >
                                  {/* Formato y Color */}
                                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                     <select
                                       value={el.fontSize}
                                       onChange={(e) => updateSelectedFontSize(Number(e.target.value))}
                                       className="bg-slate-50 dark:bg-slate-950 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-800 outline-none text-slate-850 dark:text-slate-200"
                                     >
                                       {Array.from(new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72, Math.round(el.fontSize)]))
                                         .sort((a, b) => a - b)
                                         .map((s) => (
                                           <option key={s} value={s}>{s}px</option>
                                         ))
                                       }
                                     </select>

                                     <button
                                       onClick={toggleSelectedBold}
                                       className={`w-7 h-7 flex items-center justify-center rounded font-bold text-xs ${
                                         el.fontWeight === 'bold'
                                           ? 'bg-emerald-500 text-white shadow-sm'
                                           : 'bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                       }`}
                                     >
                                       N
                                     </button>

                                     <button
                                       onClick={toggleSelectedItalic}
                                       className={`w-7 h-7 flex items-center justify-center rounded italic text-xs ${
                                         el.fontStyle === 'italic'
                                           ? 'bg-emerald-500 text-white shadow-sm'
                                           : 'bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                       }`}
                                     >
                                       K
                                     </button>

                                     <button
                                       onClick={toggleSelectedUnderline}
                                       className={`w-7 h-7 flex items-center justify-center rounded underline text-xs font-semibold ${
                                         el.underline
                                           ? 'bg-emerald-500 text-white shadow-sm'
                                           : 'bg-slate-100 dark:bg-slate-955 text-slate-800 dark:text-slate-200'
                                       }`}
                                       title="Subrayado"
                                     >
                                       S
                                     </button>

                                     {/* Selector de Fuentes de Google con Vista Previa y Buscador */}
                                     <div className="relative" ref={inlineFontDropdownRef}>
                                       <button
                                         onClick={() => setShowInlineFontDropdown(!showInlineFontDropdown)}
                                         className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm min-w-[130px] justify-between"
                                       >
                                         <span style={{ fontFamily: el.fontFamily || 'sans-serif' }}>
                                           {el.fontFamily || 'Sans-Serif'}
                                         </span>
                                         <ChevronDown className="h-3 w-3 opacity-60" />
                                       </button>

                                       {showInlineFontDropdown && (
                                         <div className="absolute left-0 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 z-55 flex flex-col gap-2 max-h-80 animate-in fade-in slide-in-from-top-1 duration-150">
                                           {/* Buscador */}
                                           <input
                                             type="text"
                                             placeholder="Buscar fuente..."
                                             value={inlineFontSearch}
                                             onChange={(e) => setInlineFontSearch(e.target.value)}
                                             className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 text-xs rounded-lg border border-slate-200 dark:border-slate-850 outline-none text-slate-800 dark:text-slate-250 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                             onClick={(e) => e.stopPropagation()}
                                           />

                                           {/* Lista de Fuentes */}
                                           <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 pr-1 max-h-56">
                                             {/* Fuentes Estándar */}
                                             <div className="text-[10px] text-slate-400 font-bold px-2 py-1 select-none">
                                               Fuentes Estándar
                                             </div>
                                             {['sans-serif', 'serif', 'monospace'].map((f) => {
                                               const label = f === 'sans-serif' ? 'Sans-Serif' : f === 'serif' ? 'Serif' : 'Monospace';
                                               if (inlineFontSearch && !label.toLowerCase().includes(inlineFontSearch.toLowerCase())) return null;
                                               return (
                                                 <button
                                                   key={f}
                                                   onClick={() => {
                                                     updateSelectedFontFamily(f);
                                                     setShowInlineFontDropdown(false);
                                                   }}
                                                   className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium ${
                                                     el.fontFamily === f ? 'text-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10' : 'text-slate-700 dark:text-slate-200'
                                                   }`}
                                                   style={{ fontFamily: f === 'serif' ? 'Georgia, serif' : f === 'monospace' ? 'Courier, monospace' : 'Helvetica, sans-serif' }}
                                                 >
                                                   {label}
                                                 </button>
                                               );
                                             })}

                                             {/* Google Fonts */}
                                             <div className="text-[10px] text-slate-400 font-bold px-2 py-1 select-none border-t border-slate-100 dark:border-slate-855 mt-1">
                                               Google Fonts
                                             </div>
                                             {GOOGLE_FONTS.filter(f => f.name.toLowerCase().includes(inlineFontSearch.toLowerCase())).map((f) => (
                                               <button
                                                 key={f.name}
                                                 onClick={() => {
                                                   updateSelectedFontFamily(f.name);
                                                   setShowInlineFontDropdown(false);
                                                 }}
                                                 className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                                                   el.fontFamily === f.name ? 'text-emerald-500 font-bold bg-emerald-500/5 dark:bg-emerald-500/10' : 'text-slate-700 dark:text-slate-200'
                                                 }`}
                                                 style={{ fontFamily: f.name }}
                                                 title={`${f.name} (${f.category})`}
                                               >
                                                 {f.name}
                                               </button>
                                             ))}
                                           </div>
                                         </div>
                                       )}
                                     </div>

                                     {/* Selector de Color directo en el popup */}
                                     <input
                                       type="color"
                                       value={el.color}
                                       onChange={(e) => updateSelectedColor(e.target.value)}
                                       className="w-7 h-7 p-0.5 rounded cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                                       title="Cambiar color del texto"
                                     />
                                   </div>

                                  {/* Acciones */}
                                  <div className="flex justify-between items-center text-xs">
                                    <button
                                      onClick={deleteSelectedElement}
                                      className="text-red-500 hover:bg-red-500/10 px-2 py-1 rounded transition-colors font-bold"
                                    >
                                      Eliminar
                                    </button>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={handleCancelTextEdit}
                                        className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() => handleConfirmTextEdit(el.id)}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded font-bold shadow-sm"
                                      >
                                        Aceptar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          }

                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => handleElementPointerDown(e, el)}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleStartTextEdit(el);
                              }}
                              className={`absolute cursor-move select-none pointer-events-auto rounded transition-[outline,background-color] group ${
                                isSel 
                                  ? 'outline outline-2 outline-emerald-500 bg-transparent z-30' 
                                  : 'hover:bg-slate-500/10 hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                fontSize: `${el.fontSize * (zoom / 2)}px`,
                                color: el.color,
                                fontFamily: getCssFontFamily(el),
                                fontWeight: el.pdfFontName ? 'normal' : mapFontWeightToCss(el.fontWeight),
                                fontStyle: el.pdfFontName ? 'normal' : (el.fontStyle || 'normal'),
                                textDecoration: el.underline ? 'underline' : 'none',
                                height: `${el.fontSize * (zoom / 2) * 1.1}px`,
                                transform: 'translate(0, 0)',
                                whiteSpace: 'nowrap',
                                willChange: 'left, top',
                                touchAction: 'none',
                                lineHeight: '1.1',
                                padding: '0px',
                                margin: '0px',
                                outlineOffset: '3px',
                                border: 'none',
                                boxSizing: 'border-box',
                                verticalAlign: 'baseline',
                                textIndent: '0px',
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
                              className={`absolute cursor-move pointer-events-auto transition-[outline] ${
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
                          const isWhiteout = el.id.startsWith('whiteout-orig-');
                          return (
                            <div
                              key={el.id}
                              onPointerDown={(e) => {
                                if (isWhiteout) return;
                                handleElementPointerDown(e, el);
                              }}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute ${isWhiteout ? 'pointer-events-none z-10' : 'cursor-move pointer-events-auto transition-[outline]'} ${
                                !isWhiteout && isSel 
                                  ? 'outline outline-2 outline-emerald-500 shadow-md z-30' 
                                  : isWhiteout ? '' : 'hover:outline hover:outline-1 hover:outline-slate-400'
                              }`}
                              style={{
                                left: `${el.x * 100}%`,
                                top: `${el.y * 100}%`,
                                width: `${el.width * 100}%`,
                                height: `${el.height * 100}%`,
                                backgroundColor: el.color,
                                border: !isWhiteout && el.borderWidth > 0 ? `${el.borderWidth / 2}px solid ${el.borderColor}` : 'none',
                                borderRadius: el.shapeType === 'circle' ? '50%' : '0px',
                                opacity: el.opacity,
                                willChange: 'left, top, width, height',
                                touchAction: isWhiteout ? 'none' : 'none',
                              }}
                            >
                              {isSel && !isWhiteout && (
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

                      {/* 3. Guías de alineación inteligentes */}
                      {activeGuides.x !== null && (
                        <div 
                          className="absolute top-0 bottom-0 border-l border-dashed border-purple-500 z-35 pointer-events-none"
                          style={{ left: `${activeGuides.x * 100}%` }}
                        />
                      )}
                      {activeGuides.y !== null && (
                        <div 
                          className="absolute left-0 right-0 border-t border-dashed border-purple-500 z-35 pointer-events-none"
                          style={{ top: `${activeGuides.y * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

          </div>



        </div>
      )}
    </div>
  );
}
