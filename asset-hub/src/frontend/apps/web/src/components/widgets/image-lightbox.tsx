import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, X, FileIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageLightboxProps {
  urls: string[]
}

const isImage = (val: string) => val && (val.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null)

export function LightboxModal({ 
  isOpen, 
  setIsOpen, 
  images, 
  initialIndex = 0 
}: { 
  isOpen: boolean; 
  setIsOpen: (o: boolean) => void; 
  images: string[]; 
  initialIndex?: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex)
    }
  }, [isOpen, initialIndex])

  const nextImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }

  const prevImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 bg-black border-none flex flex-col justify-center items-center shadow-2xl overflow-hidden [&>button]:hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Visor de imágenes</DialogTitle>
        <DialogDescription className="sr-only">Visor de imágenes en pantalla completa</DialogDescription>
        
        <div className="w-full h-full relative flex items-center justify-center">
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="absolute top-4 right-4 text-white hover:bg-white/20 hover:text-white z-50 rounded-full bg-black/20"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          {images.length > 1 && (
            <>
              <Button 
                type="button"
                variant="ghost" 
                size="icon" 
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white z-50 h-12 w-12 rounded-full bg-black/20"
                onClick={prevImage}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>

              <Button 
                type="button"
                variant="ghost" 
                size="icon" 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white z-50 h-12 w-12 rounded-full bg-black/20"
                onClick={nextImage}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          <div className="w-full h-full p-4 md:p-12 flex items-center justify-center relative">
            {images.length > 0 && (
              <img 
                src={images[currentIndex]} 
                alt={`Imagen ${currentIndex + 1}`} 
                className="max-w-full max-h-full object-contain animate-in fade-in zoom-in-95 duration-200"
                key={currentIndex}
              />
            )}
          </div>
          
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/90 text-sm bg-black/60 px-4 py-1.5 rounded-full font-medium shadow-lg backdrop-blur-sm">
              {currentIndex + 1} de {images.length}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ImageLightbox({ urls }: ImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [clickedIndex, setClickedIndex] = useState(0)

  // Separar imágenes de otros tipos de archivos
  const imageList = urls.filter(u => typeof u === 'string' && u.startsWith('http') && isImage(u))
  const otherFiles = urls.filter(u => typeof u === 'string' && u.startsWith('http') && !isImage(u))

  const openLightbox = (index: number) => {
    setClickedIndex(index)
    setIsOpen(true)
  }

  if (urls.length === 0) return null

  return (
    <div className="mt-2 flex flex-col gap-3">
      {/* Botón para abrir carrusel */}
      {imageList.length > 0 && (
        <Button 
          type="button"
          variant="outline" 
          size="sm" 
          onClick={() => openLightbox(0)}
          className="w-fit"
        >
          <ImageIcon className="h-4 w-4 mr-2 text-muted-foreground" />
          Ver {imageList.length} {imageList.length === 1 ? 'imagen' : 'imágenes'}
        </Button>
      )}

      {/* Otros archivos */}
      {otherFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          {otherFiles.map((url, index) => (
            <div key={index} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30 w-fit">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                {url.split('/').pop() || 'Archivo adjunto'}
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      <LightboxModal isOpen={isOpen} setIsOpen={setIsOpen} images={imageList} initialIndex={clickedIndex} />
    </div>
  )
}
