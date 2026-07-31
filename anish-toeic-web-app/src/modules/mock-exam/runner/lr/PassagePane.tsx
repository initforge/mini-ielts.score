import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  MousePointer2,
  Pen,
  Highlighter,
  Eraser,
  Trash2,
  Eye,
  EyeOff,
  Undo2,
  Save,
  X,
} from 'lucide-react';

type AnnotationTool = 'browse' | 'draw' | 'highlight' | 'eraser';

interface Stroke {
  tool: Exclude<AnnotationTool, 'browse'>;
  color: string;
  width: number;
  points: Array<[number, number]>;
}

const STROKE_LS_PREFIX = 'lr-annotations:';
const STROKE_LS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STROKE_WIDTHS = [2, 4, 6];

function loadStrokes(key: string): Stroke[] {
  try {
    const raw = localStorage.getItem(STROKE_LS_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { savedAt: number; strokes: Stroke[] };
    if (Date.now() - parsed.savedAt > STROKE_LS_TTL_MS) return [];
    return Array.isArray(parsed.strokes) ? parsed.strokes : [];
  } catch {
    return [];
  }
}

function saveStrokes(key: string, strokes: Stroke[]): void {
  try {
    localStorage.setItem(STROKE_LS_PREFIX + key, JSON.stringify({ savedAt: Date.now(), strokes }));
  } catch {
    // storage unavailable: drawing works for the session only
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
  }
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.lineWidth = stroke.width;
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = stroke.tool === 'highlight' ? 0.35 : 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

interface PassagePaneProps {
  html: string;
  annotationKey: string; // attemptId:questionId so strokes survive reload
  annotationOpen: boolean;
  bilingual: boolean;
}

export function PassagePane({ html, annotationKey, annotationOpen, bilingual }: PassagePaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => loadStrokes(annotationKey));
  const strokesRef = useRef<Stroke[]>(strokes);
  const [tool, setTool] = useState<AnnotationTool>('browse');
  const [color, setColor] = useState('#111827');
  const [widthIndex, setWidthIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const drawingRef = useRef<{ stroke: Stroke } | null>(null);
  const prevKeyRef = useRef(annotationKey);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // Reset strokes when switching passage/question.
  useEffect(() => {
    if (prevKeyRef.current !== annotationKey) {
      prevKeyRef.current = annotationKey;
      setStrokes(loadStrokes(annotationKey));
    }
  }, [annotationKey]);

  useEffect(() => {
    saveStrokes(annotationKey, strokes);
  }, [annotationKey, strokes]);

  // Size the canvas to its container.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [annotationOpen]);

  // Full redraw when committed strokes change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) drawStroke(ctx, stroke);
  }, [strokes, hidden]);

  const liveRedraw = (live: Stroke | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    if (live) drawStroke(ctx, live);
  };

  const canvasEvents = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'browse' || !canvasRef.current) return;
      e.preventDefault();
      canvasRef.current.setPointerCapture(e.pointerId);
      const rect = canvasRef.current.getBoundingClientRect();
      drawingRef.current = {
        stroke: {
          tool: tool as Exclude<AnnotationTool, 'browse'>,
          color,
          width: tool === 'highlight' ? 18 : STROKE_WIDTHS[widthIndex],
          points: [[e.clientX - rect.left, e.clientY - rect.top]],
        },
      };
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drawing = drawingRef.current;
      if (!drawing || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      drawing.stroke.points.push([e.clientX - rect.left, e.clientY - rect.top]);
      liveRedraw(drawing.stroke);
    },
    onPointerUp: () => {
      const drawing = drawingRef.current;
      drawingRef.current = null;
      if (!drawing) return;
      setStrokes((prev) => [...prev, drawing.stroke]);
    },
    onPointerCancel: () => {
      drawingRef.current = null;
      liveRedraw(null);
    },
  };

  const showSavedFlash = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const toolbarButton = (active: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
      active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div ref={containerRef} className="relative h-full min-h-0">
      <div
        className="h-full overflow-y-auto prose prose-slate max-w-none text-[15px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />

      {annotationOpen && (
        <>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10"
            style={{
              display: hidden ? 'none' : 'block',
              pointerEvents: tool === 'browse' ? 'none' : 'auto',
              touchAction: 'none',
              cursor: tool === 'browse' ? 'default' : 'crosshair',
            }}
            {...canvasEvents}
          />

          {/* Floating annotation toolbar (reference: exam-lr-annotation-tools) */}
          <div className="absolute left-2 top-2 z-20 flex flex-col items-center gap-1.5 bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-2">
            <button className={toolbarButton(tool === 'browse')} onClick={() => setTool('browse')} title="Browse Mode (D / Esc)">
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button className={toolbarButton(tool === 'draw')} onClick={() => setTool('draw')} title="Bút (P)">
              <Pen className="w-4 h-4" />
            </button>
            <button className={toolbarButton(tool === 'highlight')} onClick={() => setTool('highlight')} title="Highlight (H)">
              <Highlighter className="w-4 h-4" />
            </button>
            <button className={toolbarButton(tool === 'eraser')} onClick={() => setTool('eraser')} title="Tẩy (E)">
              <Eraser className="w-4 h-4" />
            </button>
            <label className={`${toolbarButton(false)} cursor-pointer`} title="Chọn màu">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-0 h-0 opacity-0 absolute"
                aria-label="Chọn màu"
              />
              <span className="w-4 h-4 rounded-full border border-slate-300" style={{ background: color }} />
            </label>
            <button
              className={toolbarButton(false)}
              onClick={() => setWidthIndex((widthIndex + 1) % STROKE_WIDTHS.length)}
              title="Độ dày nét"
            >
              <span className="text-[11px] font-bold text-slate-700 leading-none">{STROKE_WIDTHS[widthIndex]}</span>
            </button>
            <button
              className={toolbarButton(false)}
              onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              className={toolbarButton(false)}
              onClick={() => setStrokes([])}
              title="Xoá hết"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              className={toolbarButton(false)}
              onClick={showSavedFlash}
              title="Lưu"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              className={toolbarButton(false)}
              onClick={() => setHidden((v) => !v)}
              title={hidden ? 'Hiện chú thích' : 'Ẩn chú thích'}
            >
              {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <div className="w-8 border-t border-slate-200 my-1" />
            <button
              className={toolbarButton(false)}
              onClick={() => setTool('browse')}
              title="Đóng công cụ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {savedFlash && (
            <div className="absolute right-3 top-3 z-20 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
              Đã lưu chú thích
            </div>
          )}
        </>
      )}

      {bilingual && (
        <div className="sr-only">Song ngữ: hiển thị bản dịch trong câu hỏi và đáp án</div>
      )}
    </div>
  );
}
