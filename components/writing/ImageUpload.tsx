"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  part: number;
  value?: string; // base64 or URL
  onChange: (imageData: string | null) => void;
  label?: string;
}

export default function ImageUpload({
  part,
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

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPreview(base64String);
      onChange(base64String);
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

  return (
    <Card className="bg-slate-50 border border-slate-200 mb-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="h-4 w-4 text-slate-600" />
          <label className="text-sm font-semibold text-slate-900">
            {label}
          </label>
        </div>
        
        {preview ? (
          <div className="relative">
            <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
              <Image
                src={preview}
                alt="Uploaded image"
                fill
                className="object-contain"
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
            onClick={handleClick}
            className={cn(
              "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
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
      </CardContent>
    </Card>
  );
}
