'use client';

import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const EditorWorkspace = dynamic(() => import('../components/EditorWorkspace'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-screen gap-4 text-zinc-400 bg-zinc-950">
      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span>Loading editor workspace...</span>
    </div>
  ),
});
import { 
  Upload, 
  FileText, 
  Sparkles, 
  ShieldCheck, 
  Trash2, 
  Zap, 
  MousePointerClick,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate a random session ID on load
  const sessionId = useRef<string>('');
  useEffect(() => {
    sessionId.current = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }, []);

  // Minimal 1-page valid PDF bytes to load in Demo Mode
  const getDemoPdfBytes = (): Uint8Array => {
    return new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a,
      0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67,
      0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x65, 0x6e,
      0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x32, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f,
      0x54, 0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2f, 0x4b, 0x69, 0x64, 0x73, 0x5b,
      0x33, 0x20, 0x30, 0x20, 0x52, 0x5d, 0x2f, 0x43, 0x6f, 0x75, 0x6e, 0x74, 0x20, 0x31, 0x3e, 0x3e,
      0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x33, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c,
      0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x2f, 0x50, 0x61, 0x72, 0x65,
      0x6e, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x2f, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6f,
      0x78, 0x5b, 0x30, 0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32, 0x5d, 0x2f, 0x52,
      0x65, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x73, 0x3c, 0x3c, 0x2f, 0x46, 0x6f, 0x6e, 0x74, 0x3c,
      0x3c, 0x2f, 0x46, 0x31, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x46, 0x6f, 0x6e, 0x74,
      0x2f, 0x53, 0x75, 0x62, 0x74, 0x79, 0x70, 0x65, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x31, 0x2f, 0x42,
      0x61, 0x73, 0x65, 0x46, 0x6f, 0x6e, 0x74, 0x2f, 0x48, 0x65, 0x6c, 0x76, 0x65, 0x74, 0x69, 0x63,
      0x61, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x3e, 0x2f, 0x43, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x73,
      0x20, 0x34, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x34,
      0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x4c, 0x65, 0x6e, 0x67, 0x74, 0x68,
      0x20, 0x35, 0x30, 0x3e, 0x3e, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d, 0x0a, 0x42, 0x54, 0x0a, 0x2f,
      0x46, 0x31, 0x20, 0x32, 0x34, 0x20, 0x54, 0x66, 0x0a, 0x31, 0x30, 0x30, 0x20, 0x36, 0x30, 0x30,
      0x20, 0x54, 0x64, 0x0a, 0x28, 0x44, 0x45, 0x4d, 0x4f, 0x20, 0x50, 0x44, 0x46, 0x20, 0x43, 0x4f,
      0x4e, 0x54, 0x52, 0x41, 0x43, 0x54, 0x20, 0x2d, 0x20, 0x45, 0x64, 0x69, 0x74, 0x20, 0x4d, 0x65,
      0x21, 0x29, 0x20, 0x54, 0x6a, 0x0a, 0x45, 0x54, 0x0a, 0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65,
      0x61, 0x6d, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x30, 0x20,
      0x35, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35,
      0x33, 0x35, 0x20, 0x66, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x39, 0x20,
      0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x37, 0x34, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x30, 0x30, 0x31, 0x34, 0x34, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x0a, 0x30, 0x30,
      0x30, 0x30, 0x30, 0x30, 0x30, 0x33, 0x33, 0x35, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e,
      0x0a, 0x74, 0x72, 0x61, 0x69, 0x6c, 0x65, 0x72, 0x0a, 0x3c, 0x3c, 0x2f, 0x53, 0x69, 0x7a, 0x65,
      0x20, 0x35, 0x2f, 0x52, 0x6f, 0x6f, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x0a,
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x34, 0x33, 0x38, 0x0a, 0x25, 0x25,
      0x45, 0x4f, 0x46, 0x0a
    ]);
  };

  const handleTryDemo = () => {
    const bytes = getDemoPdfBytes();
    const demoFile = new File([bytes as any], 'demo_contract.pdf', { type: 'application/pdf' });
    setFile(demoFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
      } else {
        alert('Please upload a PDF document.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
      } else {
        alert('Please drop a valid PDF file.');
      }
    }
  };

  // If a file is uploaded, transition into the EditorWorkspace
  if (file) {
    return (
      <EditorWorkspace
        initialFile={file}
        sessionId={sessionId.current}
        onLeave={() => setFile(null)}
      />
    );
  }

  return (
    <div className="flex-1 bg-[#09090b] text-[#f4f4f5] flex flex-col justify-between overflow-x-hidden relative min-h-screen">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-mesh opacity-80 pointer-events-none z-0" />
      
      {/* Header bar */}
      <header className="w-full h-20 flex items-center justify-between px-8 md:px-16 border-b border-white/5 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-500 animate-pulse" />
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
            Antigravity PDF
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-xs text-zinc-500 hidden sm:inline-block font-medium">
            🔒 Zero-Storage Session
          </span>
        </div>
      </header>

      {/* Hero section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-24 text-center z-10 max-w-5xl mx-auto w-full">
        {/* Animated Badge */}
        <div className="inline-flex items-center gap-2 bg-primary-950/20 border border-primary-500/20 px-3.5 py-1.5 rounded-full text-xs text-primary-400 font-medium mb-8 animate-float">
          <Sparkles className="w-3.5 h-3.5" />
          Now powered by Gemini 1.5 Flash
        </div>

        {/* Title */}
        <h2 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500 leading-tight">
          Edit Any PDF Using AI
        </h2>

        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Upload your PDF, tell the AI exactly what you want, review the changes, manually edit anything if needed, download your finished PDF, and leave. No login. No storage. Complete privacy.
        </p>

        {/* File Upload Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full max-w-lg glass rounded-3xl p-10 border transition-all duration-300 flex flex-col items-center justify-center cursor-pointer shadow-2xl relative group ${
            isDragOver 
              ? 'border-primary-500 bg-primary-950/5 scale-102' 
              : 'border-white/5 hover:border-white/10 bg-zinc-950/40'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="application/pdf"
            className="hidden" 
          />
          
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <Upload className="w-6 h-6 text-zinc-400 group-hover:text-primary-400 transition-colors" />
          </div>

          <span className="font-semibold text-lg text-white mb-2">
            Drag & drop PDF here
          </span>
          <p className="text-xs text-zinc-500 mb-6">
            or click to browse your local files
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <span className="bg-zinc-900 text-zinc-400 text-[10px] px-2.5 py-1 rounded-md border border-white/5 font-mono">
              PDF
            </span>
            <span className="bg-zinc-900 text-zinc-400 text-[10px] px-2.5 py-1 rounded-md border border-white/5 font-mono">
              Scanned OCR
            </span>
            <span className="bg-zinc-900 text-zinc-400 text-[10px] px-2.5 py-1 rounded-md border border-white/5 font-mono">
              Password-protected
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 w-full">
          <button
            onClick={handleTryDemo}
            className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 px-6 py-3 rounded-2xl text-sm font-semibold transition-all w-full sm:w-auto"
          >
            <MousePointerClick className="w-4 h-4" />
            Try Demo Contract
          </button>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-24">
          <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-start text-left gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-bold text-white text-base">AI-First Editing</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Correct grammar, translate, redact, swap logos, or summarize text pages using simple conversational commands.
            </p>
          </div>

          <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-start text-left gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center">
              <MousePointerClick className="w-5 h-5 text-indigo-500" />
            </div>
            <h3 className="font-bold text-white text-base">Professional Markup</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Add custom text layers, draw shapes, highlight sentences, add sticky annotations, or lock layers with high-fidelity canvas support.
            </p>
          </div>

          <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-start text-left gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="font-bold text-white text-base">Absolute Privacy</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              No logins, tracking, or temporary disk saves. Your files are processed entirely in browser memory/sessions and deleted instantly.
            </p>
          </div>
        </div>
      </main>

      {/* Privacy Banner Footer */}
      <footer className="w-full border-t border-white/5 bg-zinc-950/60 p-6 md:p-8 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4 text-center md:text-left justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-bold">
              Privacy First architecture
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-normal font-medium max-w-xl md:max-w-2xl">
            "Your privacy comes first. Your files are never stored. Your conversations are never saved. Every document is processed securely during your session and permanently deleted immediately after you finish or leave the website."
          </p>
        </div>
      </footer>
    </div>
  );
}
