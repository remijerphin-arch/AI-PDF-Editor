'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, Textbox, Rect, Circle, util } from 'fabric';
import * as pdfjs from 'pdfjs-dist';
import { Toolbar } from './Toolbar';
import { ClientPDFEditor, PageLayoutData } from '../utils/pdfEditorHelper';
import { createWorker } from 'tesseract.js';
import { 
  Sparkles, 
  Send, 
  Settings, 
  RefreshCw, 
  Layers, 
  LayoutList, 
  Bot, 
  User, 
  Eye, 
  Check, 
  X,
  FileText,
  RotateCw,
  Copy,
  Trash2,
  FileCode,
  Shield,
  Download,
  AlertCircle
} from 'lucide-react';

interface EditorWorkspaceProps {
  initialFile: File;
  sessionId: string;
  onLeave: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AIEditPlan {
  page: number;
  find: string;
  replace: string;
  explanation: string;
  applied?: boolean;
}

export default function EditorWorkspace({ initialFile, sessionId, onLeave }: EditorWorkspaceProps) {
  // Document state
  const [file, setFile] = useState<File>(initialFile);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pagesData, setPagesData] = useState<PageLayoutData[]>([]);
  const [metadata, setMetadata] = useState<any>({ title: '', author: '', pages: 0 });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Editor states
  const [activeTool, setActiveTool] = useState('select');
  const [color, setColor] = useState('#ef4444'); // Default red for editing/markup
  const [fontSize, setFontSize] = useState(16);
  const [opacity, setOpacity] = useState(1.0);
  const [zoom, setZoom] = useState(1.0);
  const [isSaving, setIsSaving] = useState(false);

  // AI Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', content: 'Hi! I am your AI PDF Assistant. I have analyzed your document. Tell me what edits you want to make, or ask me any questions about it!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [isEditPlanning, setIsEditPlanning] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);

  // AI Proposed Edits
  const [proposedEdits, setProposedEdits] = useState<AIEditPlan[]>([]);

  // Export Settings
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportWatermark, setExportWatermark] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [exportCompress, setExportCompress] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  // Refs for rendering
  const canvasContainersRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pdfCanvasesRef = useRef<Record<number, HTMLCanvasElement | null>>({});
  const fabricCanvasesRef = useRef<Record<number, Canvas | null>>({});
  const fileArrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Keep track of drawings/overlays state in JSON per page (1-indexed)
  const [fabricHistory, setFabricHistory] = useState<Record<number, any[]>>({});
  const fabricUndoStack = useRef<Record<number, string[]>>({});
  const fabricRedoStack = useRef<Record<number, string[]>>({});

  // Backend url
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Load PDF and setup workspace
  useEffect(() => {
    async function loadPDF() {
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        fileArrayBufferRef.current = buffer.slice(0); // Clone buffer

        // 1. Client-side parse for metadata & structure
        const result = await ClientPDFEditor.parsePDF(file);
        setMetadata(result.metadata);
        setPagesData(result.pages);

        // 2. Load PDF.js doc object for rendering
        const loadingTask = pdfjs.getDocument({ data: buffer });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);

        // Notify backend of session upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);
        fetch(`${BACKEND_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        }).catch(err => console.error('Backend upload warning:', err));

      } catch (e) {
        console.error('Error loading PDF:', e);
        alert('Failed to load PDF. Please make sure it is a valid, unencrypted document.');
      } finally {
        setLoading(false);
      }
    }
    loadPDF();
  }, [file]);

  // Handle PDF and Fabric rendering per visible page
  useEffect(() => {
    if (!pdfDoc || loading) return;

    // Render all pages
    pagesData.forEach((pageData) => {
      renderPage(pageData.page);
    });

    // Clean up function to dispose of fabric canvases on unmount
    return () => {
      Object.values(fabricCanvasesRef.current).forEach((fc) => {
        if (fc) fc.dispose();
      });
      fabricCanvasesRef.current = {};
    };
  }, [pdfDoc, loading, zoom, pagesData.length]);

  // Synchronize tools with Fabric Canvases
  useEffect(() => {
    Object.values(fabricCanvasesRef.current).forEach((fCanvas) => {
      if (!fCanvas) return;
      
      // Reset interactive behaviors
      fCanvas.isDrawingMode = false;
      fCanvas.selection = activeTool === 'select';
      fCanvas.forEachObject((obj) => {
        obj.selectable = activeTool === 'select';
        obj.evented = activeTool === 'select';
      });

      if (activeTool === 'draw' || activeTool === 'highlight') {
        fCanvas.isDrawingMode = true;
        if (fCanvas.freeDrawingBrush) {
          fCanvas.freeDrawingBrush.color = activeTool === 'highlight' ? '#ffeb3b' : color;
          fCanvas.freeDrawingBrush.width = activeTool === 'highlight' ? 24 : 4;
          // Make highlight brush transparent
          if (activeTool === 'highlight') {
            fCanvas.freeDrawingBrush.color = 'rgba(255, 235, 59, 0.4)';
          }
        }
      }
      fCanvas.requestRenderAll();
    });
  }, [activeTool, color, zoom]);

  // Render PDF.js page onto background canvas, and setup Fabric overlay canvas
  const renderPage = async (pageNum: number) => {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom });

      const pdfCanvas = pdfCanvasesRef.current[pageNum];
      const container = canvasContainersRef.current[pageNum];
      if (!pdfCanvas || !container) return;

      // 1. Render PDF.js background
      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      const renderContext = {
        canvasContext: pdfCanvas.getContext('2d')!,
        viewport: viewport
      };
      await page.render(renderContext).promise;

      // 2. Setup or resize Fabric.js interactive overlay
      let fCanvas = fabricCanvasesRef.current[pageNum];
      
      if (!fCanvas) {
        // Create fabric canvas overlaying pdfCanvas
        const fabricCanvasElement = container.querySelector('.fabric-overlay') as HTMLCanvasElement;
        if (fabricCanvasElement) {
          fCanvas = new Canvas(fabricCanvasElement, {
            width: viewport.width,
            height: viewport.height,
            selection: activeTool === 'select',
          });
          fabricCanvasesRef.current[pageNum] = fCanvas;
          
          // Setup canvas state changes tracker
          const saveState = () => {
            if (fCanvas) {
              const objects = fCanvas.getObjects().map(obj => obj.toObject());
              setFabricHistory(prev => ({
                ...prev,
                [pageNum]: objects
              }));
            }
          };

          fCanvas.on('object:added', saveState);
          fCanvas.on('object:modified', saveState);
          fCanvas.on('object:removed', saveState);

          // Handle manual shape creation clicks
          setupCanvasInteraction(fCanvas, pageNum);
        }
      } else {
        // Resize existing Fabric canvas
        fCanvas.setDimensions({ width: viewport.width, height: viewport.height });
        fCanvas.calcOffset();
      }

      // Restore saved drawings if any
      if (fCanvas && fabricHistory[pageNum]) {
        // Only load if canvas is empty of drawn items (to prevent duplicates)
        if (fCanvas.getObjects().length === 0) {
          fCanvas.loadFromJSON({ objects: fabricHistory[pageNum] }, () => {
            fCanvas?.requestRenderAll();
          });
        }
      }

    } catch (err) {
      console.error('Error rendering page:', pageNum, err);
    }
  };

  // Add click handlers on Fabric canvas to create shapes/texts manually
  const setupCanvasInteraction = (fCanvas: Canvas, pageNum: number) => {
    fCanvas.on('mouse:down', (options) => {
      if (activeTool === 'select' || fCanvas.isDrawingMode) return;

      const pointer = (fCanvas as any).getPointer(options.e);
      let newObject: any = null;

      if (activeTool === 'text') {
        newObject = new Textbox('Type something...', {
          left: pointer.x,
          top: pointer.y,
          width: 150,
          fontSize: fontSize,
          fill: color,
          opacity: opacity,
        });
      } else if (activeTool === 'rect') {
        newObject = new Rect({
          left: pointer.x,
          top: pointer.y,
          width: 80,
          height: 50,
          fill: color,
          opacity: opacity,
        });
      } else if (activeTool === 'circle') {
        newObject = new Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 35,
          fill: color,
          opacity: opacity,
        });
      } else if (activeTool === 'comment') {
        newObject = new Textbox('Sticky Note 💬', {
          left: pointer.x,
          top: pointer.y,
          width: 120,
          fontSize: 14,
          fill: '#000000',
          backgroundColor: '#ffeb3b',
          opacity: 0.9,
          padding: 8,
          borderColor: '#fbc02d',
          hasControls: true
        });
      }

      if (newObject) {
        fCanvas.add(newObject);
        fCanvas.setActiveObject(newObject);
        fCanvas.requestRenderAll();
        // Reset tool back to select
        setActiveTool('select');
      }
    });
  };

  // History operations (Undo/Redo per page)
  const handleUndo = () => {
    const fCanvas = fabricCanvasesRef.current[currentPage];
    if (!fCanvas) return;
    
    const objects = fCanvas.getObjects();
    if (objects.length > 0) {
      const lastObj = objects[objects.length - 1];
      // Save for redo
      if (!fabricRedoStack.current[currentPage]) fabricRedoStack.current[currentPage] = [];
      fabricRedoStack.current[currentPage].push(JSON.stringify(lastObj.toObject()));
      
      fCanvas.remove(lastObj);
      fCanvas.requestRenderAll();
    }
  };

  const handleRedo = () => {
    const fCanvas = fabricCanvasesRef.current[currentPage];
    if (!fCanvas || !fabricRedoStack.current[currentPage]?.length) return;
    
    const rawObj = fabricRedoStack.current[currentPage].pop();
    if (rawObj) {
      util.enlivenObjects([JSON.parse(rawObj)]).then((objects) => {
        objects.forEach((obj) => {
          fCanvas.add(obj as any);
        });
        fCanvas.requestRenderAll();
      });
    }
  };

  const handleClearCanvas = () => {
    const fCanvas = fabricCanvasesRef.current[currentPage];
    if (fCanvas) {
      fCanvas.clear();
      setFabricHistory(prev => ({
        ...prev,
        [currentPage]: []
      }));
    }
  };

  // Page level operations
  const handleRotatePage = async (pageNum: number) => {
    if (!fileArrayBufferRef.current) return;
    setLoading(true);
    try {
      const resBytes = await ClientPDFEditor.applyPageOperations(fileArrayBufferRef.current, [
        { type: 'rotate', page: pageNum, angle: 90 }
      ]);
      fileArrayBufferRef.current = resBytes.buffer as ArrayBuffer;
      
      // Update File object to trigger reload
      const newFile = new File([resBytes as any], file.name, { type: 'application/pdf' });
      setFile(newFile);
    } catch (e) {
      console.error(e);
      alert('Error rotating page');
      setLoading(false);
    }
  };

  const handleDuplicatePage = async (pageNum: number) => {
    if (!fileArrayBufferRef.current) return;
    setLoading(true);
    try {
      const resBytes = await ClientPDFEditor.applyPageOperations(fileArrayBufferRef.current, [
        { type: 'duplicate', page: pageNum }
      ]);
      fileArrayBufferRef.current = resBytes.buffer as ArrayBuffer;
      
      // Shift fabric histories for duplicated page
      const newHistory: Record<number, any[]> = {};
      Object.keys(fabricHistory).forEach((pStr) => {
        const p = parseInt(pStr);
        if (p <= pageNum) {
          newHistory[p] = fabricHistory[p];
        } else {
          newHistory[p + 1] = fabricHistory[p];
        }
      });
      // Set duplicated page history as clone of original
      newHistory[pageNum + 1] = [...(fabricHistory[pageNum] || [])];
      setFabricHistory(newHistory);

      const newFile = new File([resBytes as any], file.name, { type: 'application/pdf' });
      setFile(newFile);
    } catch (e) {
      console.error(e);
      alert('Error duplicating page');
      setLoading(false);
    }
  };

  const handleDeletePage = async (pageNum: number) => {
    if (metadata.pages <= 1) {
      alert('Cannot delete the last page of a PDF.');
      return;
    }
    if (!fileArrayBufferRef.current) return;
    setLoading(true);
    try {
      const resBytes = await ClientPDFEditor.applyPageOperations(fileArrayBufferRef.current, [
        { type: 'delete', page: pageNum }
      ]);
      fileArrayBufferRef.current = resBytes.buffer as ArrayBuffer;
      
      // Shift fabric histories down
      const newHistory: Record<number, any[]> = {};
      Object.keys(fabricHistory).forEach((pStr) => {
        const p = parseInt(pStr);
        if (p < pageNum) {
          newHistory[p] = fabricHistory[p];
        } else if (p > pageNum) {
          newHistory[p - 1] = fabricHistory[p];
        }
      });
      setFabricHistory(newHistory);

      const newFile = new File([resBytes as any], file.name, { type: 'application/pdf' });
      setFile(newFile);
      setCurrentPage(Math.max(1, pageNum - 1));
    } catch (e) {
      console.error(e);
      alert('Error deleting page');
      setLoading(false);
    }
  };

  const handleRunOCR = async () => {
    const canvas = pdfCanvasesRef.current[currentPage];
    if (!canvas) return;
    
    setIsOcrRunning(true);
    try {
      const worker = await createWorker('eng');
      const image = canvas.toDataURL('image/png');
      const recognizeRes = await worker.recognize(image);
      const data = recognizeRes.data as any;
      
      const fCanvas = fabricCanvasesRef.current[currentPage];
      if (fCanvas && data && data.words && data.words.length > 0) {
        fCanvas.clear();
        
        data.words.forEach((word: any) => {
          const text = new Textbox(word.text, {
            left: word.bbox.x0,
            top: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            fontSize: (word.bbox.y1 - word.bbox.y0) * 0.8,
            fill: '#000000',
            hasControls: true
          });
          fCanvas.add(text);
        });
        fCanvas.requestRenderAll();
        alert('OCR complete! Text blocks detected and made editable.');
      } else {
        alert('No text detected on this page.');
      }
      await worker.terminate();
    } catch (e) {
      console.error(e);
      alert('OCR failed. Check your network connection.');
    } finally {
      setIsOcrRunning(false);
    }
  };

  // Compile manual overlay canvases and prompt export options
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Compile drawings and manual overlays on client-side first
      if (fileArrayBufferRef.current) {
        const compiledBytes = await ClientPDFEditor.compileCanvasOverlays(
          fileArrayBufferRef.current,
          fabricHistory
        );
        fileArrayBufferRef.current = compiledBytes.buffer as ArrayBuffer;
        
        // Sync compiled PDF to backend session storage
        const syncFile = new File([compiledBytes as any], file.name, { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', syncFile);
        formData.append('sessionId', sessionId);
        await fetch(`${BACKEND_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        });
      }
      
      // Open the export settings dialog
      setShowExportModal(true);
    } catch (e) {
      console.error(e);
      alert('Failed to pre-compile annotations.');
    } finally {
      setIsSaving(false);
    }
  };

  // Process export request (sends configuration details to FastAPI backend)
  const triggerExport = async () => {
    setIsSaving(true);
    setShowExportModal(false);
    try {
      const response = await fetch(`${BACKEND_URL}/api/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          format: exportFormat,
          watermark: exportWatermark || null,
          password: exportPassword || null,
          compression: exportCompress
        }),
      });

      if (!response.ok) {
        throw new Error('Export service returned an error.');
      }

      // Download file stream
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      let ext = exportFormat;
      if (exportFormat === 'images') ext = 'zip';
      if (exportFormat === 'excel') ext = 'xlsx';
      
      a.download = `edited_${file.name.replace(/\.pdf$/i, '')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // Enforce security cleanup on download
      alert('Document exported successfully! In accordance with our security policies, all session files are now permanently deleted.');
      onLeave();
    } catch (e) {
      console.error(e);
      alert('Failed to export document. Check your server connection.');
    } finally {
      setIsSaving(false);
    }
  };

  // AI assistant chat query
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
    };
    
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatSending(true);

    try {
      // 1. Determine if instruction is a QA question or a PDF editing request
      // If it starts with commands like "replace", "fix spelling", "correct", "change", "delete page"
      const isEditingCommand = /replace|change|edit|fix|correct|delete|rotate|add watermark|translate/i.test(userMsg.content);

      if (isEditingCommand) {
        // Run edit planning API
        setIsEditPlanning(true);
        const response = await fetch(`${BACKEND_URL}/api/plan-edits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-Gemini-API-Key': apiKey } : {}),
          },
          body: JSON.stringify({
            sessionId,
            instruction: userMsg.content,
          }),
        });
        const result = await response.json();
        
        if (result.success && result.plans && result.plans.length > 0) {
          setProposedEdits(result.plans);
          
          const assistantMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `I have planned **${result.plans.length} edits** based on your instruction. You can review them in the planned edits section below and click "Apply" to make them permanent.`,
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else {
          // If empty plan but was structural command
          if (userMsg.content.toLowerCase().includes('delete page')) {
            const pageNum = parseInt(userMsg.content.replace(/\D/g, ''));
            if (pageNum) {
              handleDeletePage(pageNum);
              const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Done! Page ${pageNum} has been deleted.`,
              };
              setMessages(prev => [...prev, assistantMsg]);
            }
          } else {
            const assistantMsg: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `I couldn't identify any matching text in the document for your instruction. Try specifying the exact sentence or word.`,
            };
            setMessages(prev => [...prev, assistantMsg]);
          }
        }
        setIsEditPlanning(false);
      } else {
        // Run standard Q&A chat
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-Gemini-API-Key': apiKey } : {}),
          },
          body: JSON.stringify({
            sessionId,
            message: userMsg.content,
            history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          }),
        });
        const result = await response.json();

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.response,
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e) {
      console.error(e);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error: Failed to fetch AI response. Please make sure the Python server is running and check your API key.',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsChatSending(false);
    }
  };

  // Apply AI proposed replacements client-side using pdf-lib
  const applyAIEdit = async (edit: AIEditPlan, index: number) => {
    if (!fileArrayBufferRef.current) return;
    setLoading(true);
    try {
      const resBytes = await ClientPDFEditor.applyTextReplacements(
          fileArrayBufferRef.current,
          [edit],
          pagesData
        );
        fileArrayBufferRef.current = resBytes.buffer as ArrayBuffer;

      // Update current edit state to applied
      const updatedEdits = [...proposedEdits];
      updatedEdits[index].applied = true;
      setProposedEdits(updatedEdits);

      // Reload File to render the changes
      const newFile = new File([resBytes as any], file.name, { type: 'application/pdf' });
      setFile(newFile);
      
      // Update text data layouts
      const parseRes = await ClientPDFEditor.parsePDF(newFile);
      setPagesData(parseRes.pages);
      
    } catch (e) {
      console.error(e);
      alert('Error applying text replacement overlay.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-[#f4f4f5] overflow-hidden">
      {/* Header bar */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-primary-500" />
          <h1 className="font-semibold text-lg bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
            Antigravity PDF AI Workspace
          </h1>
          <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono">
            Session: {sessionId.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowApiSettings(!showApiSettings)}
            title="Gemini API settings"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <button 
            onClick={onLeave}
            className="text-sm font-medium text-zinc-400 hover:text-red-400 border border-white/5 hover:border-red-500/20 px-3.5 py-1.5 rounded-xl transition-all"
          >
            Exit Workspace
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL: Document Thumbnails */}
        <aside className="w-60 border-r border-white/5 bg-zinc-950/20 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2 text-zinc-400 font-semibold text-xs uppercase tracking-wider">
            <LayoutList className="w-4 h-4" />
            Document Pages
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pagesData.map((page) => (
              <div 
                key={page.page} 
                className={`relative group rounded-xl p-2 cursor-pointer transition-all duration-200 border ${
                  currentPage === page.page 
                    ? 'bg-zinc-800/40 border-primary-500' 
                    : 'bg-zinc-900/30 border-transparent hover:border-white/10 hover:bg-zinc-900/50'
                }`}
                onClick={() => setCurrentPage(page.page)}
              >
                <div className="aspect-[3/4] bg-zinc-950/80 rounded-lg flex items-center justify-center overflow-hidden border border-white/5 shadow-inner">
                  {/* Miniature text placeholder representing layout */}
                  <FileText className="w-8 h-8 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-xs text-zinc-500 font-mono">Page {page.page}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRotatePage(page.page); }}
                      title="Rotate Page"
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicatePage(page.page); }}
                      title="Duplicate Page"
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePage(page.page); }}
                      title="Delete Page"
                      className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER PANEL: Live PDF & Canvas manual editor */}
        <main className="flex-1 flex flex-col bg-zinc-900/40 overflow-hidden relative">
          
          {/* Top toolbar */}
          <div className="p-4 bg-zinc-950/40 backdrop-blur-sm border-b border-white/5 z-20">
            <Toolbar
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              color={color}
              setColor={setColor}
              fontSize={fontSize}
              setFontSize={setFontSize}
              opacity={opacity}
              setOpacity={setOpacity}
              zoom={zoom}
              setZoom={setZoom}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClearCanvas}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </div>

          {/* Central PDF workspace viewport */}
          <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-gradient-mesh">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
                <span>Processing document layout...</span>
              </div>
            ) : (
              <div 
                className="relative bg-zinc-950 shadow-2xl border border-white/5 rounded-lg select-none"
                style={{
                  width: (pagesData[currentPage - 1]?.width || 612) * zoom,
                  height: (pagesData[currentPage - 1]?.height || 792) * zoom,
                }}
              >
                {/* PDFjs Render Page Background */}
                <div 
                  ref={(el) => { canvasContainersRef.current[currentPage] = el; }}
                  className="absolute inset-0 z-0"
                >
                  <canvas 
                    ref={(el) => { pdfCanvasesRef.current[currentPage] = el; }}
                    className="absolute inset-0"
                  />
                  {/* Fabric Overlay */}
                  <canvas className="fabric-overlay absolute inset-0 z-10" />
                </div>
              </div>
            )}
          </div>
          
          {/* Page Indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-950/80 border border-white/5 text-xs font-mono px-4 py-2 rounded-full flex items-center gap-3 backdrop-blur shadow-2xl z-20">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            <span className="text-zinc-300">
              Page {currentPage} of {metadata.pages}
            </span>
            <button 
              disabled={currentPage === metadata.pages}
              onClick={() => setCurrentPage(prev => Math.min(metadata.pages, prev + 1))}
              className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              Next
            </button>
            <span className="text-zinc-700">|</span>
            {isOcrRunning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary-500" />
            ) : (
              <button 
                onClick={handleRunOCR}
                title="Detect and make text editable (OCR)"
                className="text-zinc-500 hover:text-primary-400 transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-primary-500" />
                OCR Page
              </button>
            )}
          </div>
        </main>

        {/* RIGHT PANEL: AI Chat Assistant */}
        <aside className="w-96 border-l border-white/5 bg-zinc-950/40 flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Sparkles className="w-4 h-4 text-primary-500" />
              AI Assistant
            </div>
          </div>

          {/* Settings Box (API configuration) */}
          {showApiSettings && (
            <div className="p-4 border-b border-white/5 bg-zinc-900/40 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <Shield className="w-4 h-4 text-indigo-400" />
                Session Privacy Options
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                To chat, provide a custom Gemini API Key (saved only in browser memory), or use server defaults if configured.
              </p>
              <input
                type="password"
                placeholder="Paste Gemini API Key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          )}

          {/* Proposed Edits Section */}
          {proposedEdits.length > 0 && (
            <div className="max-h-48 border-b border-white/5 bg-primary-950/10 overflow-y-auto p-4 space-y-2">
              <div className="text-xs font-bold text-primary-400 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Planned AI Edits ({proposedEdits.filter(e => !e.applied).length})
              </div>
              {proposedEdits.map((edit, idx) => (
                <div key={idx} className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="flex-1 space-y-1">
                    <div className="text-zinc-500 flex items-center gap-2">
                      <span>Page {edit.page}</span>
                      <span>•</span>
                      <span>{edit.explanation}</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-1 font-mono text-[10px]">
                      <span className="text-red-400 line-through">"{edit.find}"</span>
                      <span className="text-zinc-500">→</span>
                      <span className="text-green-400 font-semibold">"{edit.replace}"</span>
                    </div>
                  </div>
                  
                  {edit.applied ? (
                    <span className="bg-green-500/10 border border-green-500/20 text-green-400 p-1 rounded-md">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <button
                      onClick={() => applyAIEdit(edit, idx)}
                      className="bg-primary-600 hover:bg-primary-500 text-white p-1 rounded-md transition-colors"
                    >
                      Apply
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div 
                key={m.id} 
                className={`flex gap-3 text-sm ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center text-primary-400 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                
                <div className={`rounded-2xl px-4 py-3 max-w-[80%] leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-primary-600 text-white rounded-tr-none' 
                    : 'bg-zinc-900 border border-white/5 rounded-tl-none text-zinc-300'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/5 flex items-center justify-center text-zinc-400 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            
            {(isChatSending || isEditPlanning) && (
              <div className="flex gap-3 text-sm justify-start">
                <div className="w-8 h-8 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center text-primary-400 shrink-0">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="bg-zinc-900 border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 text-zinc-500 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary-500" />
                  <span>{isEditPlanning ? 'Analyzing document to plan edits...' : 'Thinking...'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Typing Area */}
          <div className="p-4 border-t border-white/5 bg-zinc-950/80 backdrop-blur-md">
            <div className="flex gap-2 bg-black/40 border border-white/5 rounded-xl p-1.5 focus-within:border-primary-500 transition-colors">
              <textarea
                rows={1}
                placeholder="Ask or tell AI to edit..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                className="flex-1 bg-transparent resize-none focus:outline-none border-0 text-sm px-2.5 py-1.5 text-white max-h-24 min-h-[38px] placeholder:text-zinc-600"
              />
              <button
                onClick={sendChatMessage}
                disabled={isChatSending || !chatInput.trim()}
                className="bg-primary-600 hover:bg-primary-500 text-white p-2.5 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:hover:bg-primary-600"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            
            {/* Privacy tagline */}
            <p className="text-[10px] text-zinc-600 text-center mt-2.5">
              Secure Session. Conversations and files are never stored.
            </p>
          </div>
        </aside>
      </div>

      {/* EXPORT CONFIGURATION MODAL OVERLAY */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass max-w-md w-full rounded-3xl p-6 border border-white/5 shadow-2xl flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-lg text-white">
                <Download className="w-5 h-5 text-primary-500" />
                Export Settings
              </div>
              <button 
                onClick={() => setShowExportModal(false)} 
                className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Format selection */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium">Export Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="pdf">Portable Document Format (PDF)</option>
                  <option value="docx">Microsoft Word (DOCX)</option>
                  <option value="pptx">Microsoft PowerPoint (PPTX)</option>
                  <option value="excel">Microsoft Excel tables (XLSX)</option>
                  <option value="txt">Text Outline (TXT)</option>
                  <option value="markdown">Markdown summary (MD)</option>
                  <option value="images">Zip Archive of Images (ZIP)</option>
                </select>
              </div>

              {/* PDF Settings (only displayed if export format is PDF) */}
              {exportFormat === 'pdf' && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  {/* Watermark */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium">Add Watermark (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. CONFIDENTIAL, DRAFT"
                      value={exportWatermark}
                      onChange={(e) => setExportWatermark(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {/* Password protection */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium">Password Protection (Optional)</label>
                    <input
                      type="password"
                      placeholder="Leave blank for unencrypted"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {/* Compression toggles */}
                  <div className="flex items-center justify-between py-1 bg-black/10 px-3.5 rounded-xl border border-white/5">
                    <span className="text-xs text-zinc-400">Compress PDF Output</span>
                    <input
                      type="checkbox"
                      checked={exportCompress}
                      onChange={(e) => setExportCompress(e.target.checked)}
                      className="accent-primary-500 cursor-pointer h-4 w-4"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Warning Info box */}
            <div className="bg-primary-950/20 border border-primary-500/10 rounded-2xl p-4 flex gap-3 text-xs text-zinc-400 leading-relaxed items-start">
              <AlertCircle className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white">Privacy Reminder:</span> To respect complete privacy, downloading your document will automatically terminate your session. All session files and conversations will be deleted permanently.
              </div>
            </div>

            <button
              onClick={triggerExport}
              disabled={isSaving}
              className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-medium text-sm py-3 rounded-xl shadow-lg hover:shadow-primary-500/10 transition-all duration-200 flex items-center justify-center gap-2"
            >
              Confirm and Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
