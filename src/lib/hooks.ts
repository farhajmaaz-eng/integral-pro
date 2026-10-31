import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    listener()
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

export function useClock(): string {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 20000)
    return () => window.clearInterval(timer)
  }, [])
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
