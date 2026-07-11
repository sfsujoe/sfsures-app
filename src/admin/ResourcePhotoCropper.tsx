import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import styles from './AdminApp.module.css'

const OUTPUT_SIZE = 1200
const OUTPUT_QUALITY = 0.86

export interface CroppedResourcePhoto {
  file: File
  byteSize: number
  previewUrl: string
}

interface ResourcePhotoCropperProps {
  imageUrl: string
  onCancel: () => void
  onUsePhoto: (photo: CroppedResourcePhoto) => void
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The selected image could not be loaded.'))
    image.src = src
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('The cropped image preview could not be prepared.'))
    }
    reader.onerror = () => reject(new Error('The cropped image preview could not be read.'))
    reader.onabort = () => reject(new Error('Preparing the cropped image preview was canceled.'))
    reader.readAsDataURL(blob)
  })
}

async function cropImage(imageUrl: string, crop: Area): Promise<CroppedResourcePhoto> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Image cropping is not available in this browser.')
  }

  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob)
          return
        }

        reject(new Error('The cropped image could not be prepared.'))
      },
      'image/jpeg',
      OUTPUT_QUALITY
    )
  })

  return {
    file: new File([blob], 'resource-photo.jpg', { type: 'image/jpeg' }),
    byteSize: blob.size,
    previewUrl: await readBlobAsDataUrl(blob),
  }
}

export default function ResourcePhotoCropper({
  imageUrl,
  onCancel,
  onUsePhoto,
}: ResourcePhotoCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const handleCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels)
  }, [])

  async function handleUsePhoto() {
    if (!croppedAreaPixels) {
      setError('Choose a crop area before using the photo.')
      return
    }

    setProcessing(true)
    setError('')

    try {
      onUsePhoto(await cropImage(imageUrl, croppedAreaPixels))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The cropped image could not be prepared.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className={styles.resourcePhotoCropperPanel}>
      <div className={styles.resourcePhotoCropperCanvas}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onCropComplete={handleCropComplete}
          onZoomChange={setZoom}
          onMediaLoaded={() => setError('')}
          mediaProps={{
            alt: 'Selected resource photo to crop',
            onError: () =>
              setError('The selected image could not be displayed. Try a JPG or PNG file.'),
          }}
          showGrid={false}
        />
      </div>

      <label className={styles.resourcePhotoZoomControl}>
        <span>Zoom</span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      <div className={styles.resourcePhotoCropperActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Cancel Crop
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={processing}
          onClick={() => void handleUsePhoto()}
        >
          {processing ? 'Preparing...' : 'Use Photo'}
        </button>
      </div>
    </div>
  )
}
