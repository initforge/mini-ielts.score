import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeImageData } from "@/lib/sanitize";

interface ImageUploadProps {
  part: number;
  value?: string; // base64 or URL
  onChange: (imageData: string | null) => void;
  label?: string;
}

export default function ImageUpload({
  part: _part,
  value,
  onChange,
  label = "Upload Image",
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be less than 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Sanitize the image data
      const clean = sanitizeImageData(base64String);
      setPreview(clean);
      onChange(clean);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    setPreview(null);
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onChange]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Only accept image types, reject HTML/text content
      if (item.type.startsWith('image/') && !item.type.includes('html') && !item.type.includes('text')) {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) {
          handleFile(file);
          return;
        }
      }
    }
  }, [handleFile]);

  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Only handle if clicking on upload area
      const target = e.target as HTMLElement;
      if (!target.closest('.image-upload-area')) return;
      
      e.preventDefault();
      e.stopPropagation();
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Only accept image types, reject HTML/text content
        if (item.type.startsWith('image/') && !item.type.includes('html') && !item.type.includes('text')) {
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) {
            handleFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste, true);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste, true);
    };
  }, [handleFile]);

  // Nếu label rỗng (dùng trong CollapsibleImageUpload) → không render Card wrapper
  const hasLabel = label && label.trim();
  
  const content = (
    <>
      {/* Chỉ hiển thị label nếu có giá trị (để tránh duplicate khi dùng trong CollapsibleImageUpload) */}
      {hasLabel && (
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="h-4 w-4 text-slate-600" />
          <label className="text-sm font-semibold text-slate-900">
            {label}
          </label>
        </div>
      )}
      
      {preview ? (
        <div className="relative">
          <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
            <img
              src={preview}
              alt="Uploaded image"
              className="h-full w-full object-contain"
            />
          </div>
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 rounded-full bg-error p-2 text-white hover:bg-error/90 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onClick={handleClick}
          tabIndex={0}
          className={cn(
            "image-upload-area relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500",
            isDragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-300 bg-slate-100 hover:border-indigo-400 hover:bg-slate-50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <p className="text-slate-700 font-medium mb-2">
            Click to upload or drag and drop
          </p>
          <p className="text-sm text-slate-500">
            PNG, JPG, GIF up to 10MB
          </p>
        </div>
      )}
    </>
  );

  // Nếu không có label → không render Card wrapper (dùng trong CollapsibleImageUpload)
  if (!hasLabel) {
    return <div className="mb-4">{content}</div>;
  }

  // Có label → render Card wrapper (dùng trực tiếp)
  return (
    <Card className="bg-slate-50 border border-slate-200 mb-4">
      <CardContent className="p-4">
        {content}
      </CardContent>
    </Card>
  );
}
