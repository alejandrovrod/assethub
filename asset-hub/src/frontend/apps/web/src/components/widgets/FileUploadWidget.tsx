import { WidgetProps } from '@rjsf/utils'
import { ChangeEvent, useRef, useState } from 'react'
import { Loader2, UploadCloud, X, FileIcon } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { LightboxModal } from './image-lightbox'

export const FileUploadWidget = (props: WidgetProps) => {
  const { id, value, required, disabled, readonly, onChange, schema } = props
  const [isUploading, setIsUploading] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    try {
      const uploadedUrls: string[] = [];
      
      // Upload files sequentially or in parallel. Let's do sequentially for simplicity and stability.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        
        uploadedUrls.push(response.data.url);
      }
      
      if (isMultiple) {
        const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
        onChange([...currentValues, ...uploadedUrls]);
      } else {
        onChange(uploadedUrls[0]); // Only take the first one if not multiple
      }
      
      toast.success(files.length > 1 ? 'Los archivos se guardaron correctamente.' : 'El archivo se guardó correctamente.');
    } catch (err: any) {
      console.error('Error uploading file', err);
      toast.error('Hubo un problema al subir los archivos.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  const handleClear = (urlToRemove?: string) => {
    if (props.multiple) {
      const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
      const newValues = currentValues.filter(v => v !== urlToRemove);
      onChange(newValues.length > 0 ? newValues : undefined);
    } else {
      onChange(undefined);
    }
  }

  const isImage = (val: string) => val && (val.match(/\.(jpeg|jpg|gif|png)$/i) != null)

  const isMultiple = props.multiple || schema.type === 'array';
  const valuesArray: string[] = Array.isArray(value) ? value : (value ? [value] : []);

  return (
    <div className="flex flex-col gap-2">
      <input
        id={id}
        type="file"
        ref={fileInputRef}
        className="hidden"
        disabled={disabled || readonly || isUploading}
        onChange={handleFileChange}
        multiple={isMultiple}
        // Could be improved to read accept types from schema.
        accept={(schema as any).format === 'data-url' || (schema as any).items?.format === 'data-url' ? 'image/*,application/pdf' : '*/*'}
      />
      
      {(valuesArray.length === 0 || isMultiple) && (
        <div 
          className={`flex flex-row items-center justify-center gap-2 p-2 border-2 border-dashed rounded-md transition-colors
            ${disabled || readonly || isUploading ? 'opacity-50 cursor-not-allowed bg-muted/50' : 'cursor-pointer hover:bg-muted/50 bg-background'}
            ${isMultiple && valuesArray.length > 0 ? 'mt-1' : ''}`}
          onClick={() => {
            if (!disabled && !readonly && !isUploading) {
              fileInputRef.current?.click()
            }
          }}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <UploadCloud className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-foreground">
              {isUploading ? 'Subiendo...' : (isMultiple && valuesArray.length > 0 ? 'Subir otro archivo' : 'Subir archivo')}
            </span>
            <span className="text-xs text-muted-foreground">
              {required && valuesArray.length === 0 ? '(Requerido)' : '(Opcional)'}
            </span>
          </div>
        </div>
      )}

      {valuesArray.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {valuesArray.map((url, index) => (
            <div key={index} className="relative group h-12 w-12 shrink-0 bg-background border rounded flex items-center justify-center overflow-visible">
              <div 
                className={`h-full w-full rounded overflow-hidden flex items-center justify-center ${isImage(url) ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-pointer hover:bg-muted/50'}`}
                onClick={() => {
                  if (isImage(url)) {
                    setLightboxIndex(valuesArray.filter(isImage).indexOf(url));
                    setIsLightboxOpen(true);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                title={url.split('/').pop() || 'Archivo adjunto'}
              >
                {isImage(url) ? (
                  <img src={url} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              
              {!readonly && !disabled && (
                <button
                  type="button"
                  className="absolute -top-2 -right-2 bg-background border shadow-sm rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear(url);
                  }}
                  title="Eliminar archivo"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visor de imágenes para edición */}
      {valuesArray.filter(isImage).length > 0 && (
        <LightboxModal 
          isOpen={isLightboxOpen} 
          setIsOpen={setIsLightboxOpen} 
          images={valuesArray.filter(isImage)} 
          initialIndex={lightboxIndex} 
        />
      )}
    </div>
  )
}
