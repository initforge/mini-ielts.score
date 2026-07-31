import DOMPurify from 'dompurify';

interface DirectionsPanelProps {
  heading: string;
  html: string;
  onNext: () => void;
  nextDisabled?: boolean;
}

export function DirectionsPanel({ heading, html, onNext, nextDisabled }: DirectionsPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-wide">{heading}</h1>
        </div>
        <div
          className="prose prose-slate max-w-none leading-relaxed text-slate-700 text-[15px]"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
        <div className="flex justify-end mt-10">
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="inline-flex items-center gap-1 text-white bg-orange-500 hover:bg-orange-600 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}
