import { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImageUploadProps {
  label: string;
  hint?: string;
  currentUrl?: string;
  storagePath: string; // e.g. "logo.png" or "background.jpg"
  onUploaded: (publicUrl: string) => void;
  previewClass?: string;
}

export function ImageUpload({ label, hint, currentUrl, storagePath, onUploaded, previewClass = "h-24 w-full object-cover" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione apenas arquivos de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máximo 5MB).");
      return;
    }

    setUploading(true);
    try {
      // Generate unique filename
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${storagePath}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("site-assets")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("site-assets")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      setPreview(publicUrl);
      onUploaded(publicUrl);
      toast.success("Imagem enviada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar imagem.");
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const displayUrl = preview || currentUrl;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50 cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : displayUrl ? (
          <div className="w-full">
            <img
              src={displayUrl}
              alt="Preview"
              className={`rounded-md ${previewClass}`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">Clique ou arraste para substituir</p>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Clique ou arraste uma imagem</p>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WebP · máx. 5MB</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {displayUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setPreview(null);
            onUploaded("");
          }}
        >
          <X className="h-3 w-3 mr-1" /> Remover imagem
        </Button>
      )}
    </div>
  );
}
