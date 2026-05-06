import { Globe } from 'lucide-react'

const ICON_PATHS: Record<string, string> = {
  YouTube: '/socialmedia-icons/youtube.png',
  X: '/socialmedia-icons/twitter.png',
  Instagram: '/socialmedia-icons/instagram.png',
  LinkedIn: '/socialmedia-icons/linkedin.png',
  TikTok: '/socialmedia-icons/tik-tok.png',
  Facebook: '/socialmedia-icons/facebook.png',
}

type PlatformIconProps = {
  platform: string
  size?: number
  className?: string
}

export function PlatformIcon({ platform, size = 16, className }: PlatformIconProps) {
  const src = ICON_PATHS[platform]
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <Globe size={size} />
      )}
    </span>
  )
}
