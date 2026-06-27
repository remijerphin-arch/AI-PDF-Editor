import React from 'react';
import { 
  Pointer, 
  Pencil, 
  Type, 
  Square, 
  Circle as CircleIcon, 
  Highlighter, 
  Trash2, 
  MessageSquare, 
  ZoomIn, 
  ZoomOut, 
  Undo2, 
  Redo2, 
  Save, 
  Download, 
  Sparkles,
  Sliders
} from 'lucide-react';

interface ToolbarProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  color: string;
  setColor: (color: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
  isSaving?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setActiveTool,
  color,
  setColor,
  fontSize,
  setFontSize,
  opacity,
  setOpacity,
  zoom,
  setZoom,
  onUndo,
  onRedo,
  onClear,
  onSave,
  isSaving = false,
}) => {
  const tools = [
    { id: 'select', label: 'Select', icon: Pointer },
    { id: 'draw', label: 'Draw', icon: Pencil },
    { id: 'text', label: 'Add Text', icon: Type },
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: CircleIcon },
    { id: 'highlight', label: 'Highlight', icon: Highlighter },
    { id: 'comment', label: 'Comment', icon: MessageSquare },
  ];

  const colors = [
    '#000000', // Black
    '#ffffff', // White
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Yellow
    '#8b5cf6', // Purple
  ];

  return (
    <div className="w-full glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-white/5 shadow-2xl">
      {/* Tools Section */}
      <div className="flex items-center gap-1 bg-black/20 p-1.5 rounded-xl border border-white/5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
              className={`p-2.5 rounded-lg transition-all duration-200 flex items-center justify-center ${
                isActive 
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Formatting controls (Color, Font Size, Opacity) */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Colors */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">Color</span>
          <div className="flex items-center gap-1.5 bg-black/10 p-1 rounded-lg border border-white/5">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-md border transition-all duration-200 ${
                  color === c 
                    ? 'border-white scale-110 shadow-md' 
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#ddd' : 'transparent' }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 p-0 rounded-md border-0 bg-transparent cursor-pointer hover:scale-105 transition-all"
            />
          </div>
        </div>

        {/* Font size */}
        {(activeTool === 'text' || activeTool === 'select') && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Font Size</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="8"
                max="72"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value) || 12)}
                className="w-16 bg-black/20 border border-white/5 rounded-lg px-2 py-1 text-sm text-center text-white focus:outline-none focus:border-primary-500"
              />
              <span className="text-xs text-zinc-600">px</span>
            </div>
          </div>
        )}

        {/* Opacity slider */}
        <div className="flex items-center gap-3">
          <Sliders className="w-4 h-4 text-zinc-500" />
          <span className="text-xs text-zinc-500 font-medium">Opacity</span>
          <input
            type="range"
            min="10"
            max="100"
            value={opacity * 100}
            onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
            className="w-24 accent-primary-500 bg-zinc-800 h-1 rounded-lg cursor-pointer"
          />
          <span className="text-xs text-zinc-400 w-8">{Math.round(opacity * 100)}%</span>
        </div>
      </div>

      {/* Viewport and History Actions (Undo, Redo, Zoom, Save) */}
      <div className="flex items-center gap-4">
        {/* Undo Redo */}
        <div className="flex items-center gap-1 bg-black/10 p-1 rounded-lg border border-white/5">
          <button
            onClick={onUndo}
            title="Undo"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            title="Redo"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClear}
            title="Clear canvas modifications"
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-black/10 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            title="Zoom Out"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-300 font-mono px-1 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
            title="Zoom In"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Save/Download Button */}
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-lg hover:shadow-primary-500/10 transition-all duration-200 disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download
        </button>
      </div>
    </div>
  );
};
