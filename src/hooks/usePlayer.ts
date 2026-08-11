import { useEffect, useRef, useState } from 'react'
import type { Track } from '../../shared/types'
import { isPlayInterruptedError } from '../lib/playback'

const VOLUME_KEY = 'sourney.volume'

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw == null) return 0.85
    const value = Number(raw)
    if (!Number.isFinite(value)) return 0.85
    return Math.min(1, Math.max(0, value))
  } catch {
    return 0.85
  }
}

export function usePlayer(tracks: Track[], onAudioError?: (message: string) => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentIdRef = useRef<string | null>(null)
  const tracksRef = useRef(tracks)
  const playRequestRef = useRef(0)
  const onAudioErrorRef = useRef(onAudioError)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(readStoredVolume)

  tracksRef.current = tracks
  currentIdRef.current = currentId
  onAudioErrorRef.current = onAudioError

  const currentTrack = tracks.find((track) => track.id === currentId) ?? null

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = volume
    audioRef.current = audio

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onEnded = () => {
      void playNextRef.current()
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onError = () => {
      setIsPlaying(false)
      onAudioErrorRef.current?.('Could not play this file. It may be missing or unsupported.')
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      playRequestRef.current += 1
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      audioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!currentId) return
    if (!tracks.some((track) => track.id === currentId)) {
      stop()
    }
  }, [tracks, currentId])

  const safePlay = async (audio: HTMLAudioElement) => {
    const requestId = ++playRequestRef.current
    try {
      await audio.play()
    } catch (error) {
      if (isPlayInterruptedError(error) || requestId !== playRequestRef.current) {
        return
      }
      setIsPlaying(false)
      throw error
    }
  }

  const loadAndPlay = async (track: Track) => {
    const audio = audioRef.current
    if (!audio) return

    if (!track.playUrl) {
      throw new Error('Track has no playable URL.')
    }

    if (currentIdRef.current !== track.id) {
      setCurrentId(track.id)
      currentIdRef.current = track.id
      setCurrentTime(0)
      setDuration(track.duration ?? 0)
      audio.src = track.playUrl
      audio.load()
    }

    await safePlay(audio)
  }

  const playNextRef = useRef(async () => {
    const list = tracksRef.current
    if (!list.length) return
    const id = currentIdRef.current
    if (!id) {
      await loadAndPlay(list[0])
      return
    }
    const index = list.findIndex((track) => track.id === id)
    const next = list[(index + 1) % list.length]
    if (next) await loadAndPlay(next)
  })

  playNextRef.current = async () => {
    const list = tracksRef.current
    if (!list.length) return
    const id = currentIdRef.current
    if (!id) {
      await loadAndPlay(list[0])
      return
    }
    const index = list.findIndex((track) => track.id === id)
    const next = list[(index + 1) % list.length]
    if (next) await loadAndPlay(next)
  }

  const playTrack = async (track: Track) => {
    await loadAndPlay(track)
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (!currentTrack) {
      if (tracks[0]) await loadAndPlay(tracks[0])
      return
    }

    if (audio.paused) await safePlay(audio)
    else {
      playRequestRef.current += 1
      audio.pause()
    }
  }

  const pause = () => {
    playRequestRef.current += 1
    audioRef.current?.pause()
  }

  const resume = async () => {
    if (!audioRef.current) return
    await safePlay(audioRef.current)
  }

  const stop = () => {
    const audio = audioRef.current
    if (!audio) return
    playRequestRef.current += 1
    audio.pause()
    audio.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
    setCurrentId(null)
    currentIdRef.current = null
  }

  const seek = (time: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(time)) return

    const max =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : duration || time
    const clamped = Math.max(0, Math.min(time, max))

    try {
      if (typeof audio.fastSeek === 'function') {
        audio.fastSeek(clamped)
      } else {
        audio.currentTime = clamped
      }
      setCurrentTime(clamped)
    } catch (error) {
      console.error('[sourney] seek failed:', error)
    }
  }

  const setVolume = (value: number) => {
    const next = Math.min(1, Math.max(0, value))
    setVolumeState(next)
    if (audioRef.current) audioRef.current.volume = next
    try {
      localStorage.setItem(VOLUME_KEY, String(next))
    } catch {
      // ignore
    }
  }

  const playNext = async () => {
    await playNextRef.current()
  }

  const playPrevious = async () => {
    if (!tracks.length) return
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      seek(0)
      return
    }
    if (!currentId) {
      await loadAndPlay(tracks[0])
      return
    }
    const index = tracks.findIndex((track) => track.id === currentId)
    const prev = tracks[(index - 1 + tracks.length) % tracks.length]
    if (prev) await loadAndPlay(prev)
  }

  return {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    playTrack,
    togglePlay,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    playNext,
    playPrevious,
  }
}
