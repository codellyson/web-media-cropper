import { useCallback, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { cropBoxFromFocalPoint, type FocalPoint } from '@/lib/smartCrop'
import type { CropBox } from '@/lib/crop'

type CropStageProps = {
  imageUrl: string
  sourceWidth: number
  sourceHeight: number
  aspect: number
  focalPoint: FocalPoint
  onChange: (box: CropBox) => void
}

export function CropStage({
  imageUrl,
  sourceWidth,
  sourceHeight,
  aspect,
  focalPoint,
  onChange,
}: CropStageProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  const initialCroppedAreaPixels = useMemo(
    () => cropBoxFromFocalPoint(sourceWidth, sourceHeight, aspect, focalPoint),
    [sourceWidth, sourceHeight, aspect, focalPoint],
  )

  const handleComplete = useCallback(
    (_area: Area, pixels: Area) => {
      onChange({
        x: pixels.x,
        y: pixels.y,
        width: pixels.width,
        height: pixels.height,
      })
    },
    [onChange],
  )

  const key = `${aspect}-${focalPoint.x.toFixed(3)}-${focalPoint.y.toFixed(3)}`

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black/80">
      <Cropper
        key={key}
        image={imageUrl}
        crop={crop}
        zoom={zoom}
        aspect={aspect}
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleComplete}
        initialCroppedAreaPixels={initialCroppedAreaPixels}
        showGrid
        restrictPosition
        objectFit="contain"
      />
    </div>
  )
}
