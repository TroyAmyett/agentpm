import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, X, Send, Volume2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event & { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

export interface VoiceInputProps {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  placeholder?: string
  className?: string
  showWaveform?: boolean
}

export function VoiceInput({
  onTranscript,
  onError,
  placeholder = 'Tap to speak...',
  className = '',
  showWaveform = true,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const [volume, setVolume] = useState(0)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Check for browser support
  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      setIsSupported(false)
      onError?.('Speech recognition is not supported in this browser')
    }
  }, [onError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Volume monitoring for waveform visualization
  const startVolumeMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      const updateVolume = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setVolume(average / 255)
        animationFrameRef.current = requestAnimationFrame(updateVolume)
      }

      updateVolume()
    } catch {
      // Microphone access denied or not available
      console.warn('Could not access microphone for volume monitoring')
    }
  }, [])

  const stopVolumeMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setVolume(0)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) return

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognitionAPI()

    const recognition = recognitionRef.current
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      setTranscript('')
      setInterimTranscript('')
      if (showWaveform) {
        startVolumeMonitoring()
      }
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript)
      }
      setInterimTranscript(interimText)
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      if (event.error !== 'aborted') {
        onError?.(event.error)
      }
      setIsListening(false)
      stopVolumeMonitoring()
    }

    recognition.onend = () => {
      setIsListening(false)
      stopVolumeMonitoring()
    }

    recognition.start()
  }, [isSupported, showWaveform, startVolumeMonitoring, stopVolumeMonitoring, onError])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    stopVolumeMonitoring()
  }, [stopVolumeMonitoring])

  const handleSubmit = useCallback(() => {
    const finalText = (transcript + interimTranscript).trim()
    if (finalText) {
      setIsProcessing(true)
      onTranscript(finalText)
      setTimeout(() => {
        setTranscript('')
        setInterimTranscript('')
        setIsProcessing(false)
      }, 500)
    }
  }, [transcript, interimTranscript, onTranscript])

  const handleClear = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    if (isListening) {
      stopListening()
    }
  }, [isListening, stopListening])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  if (!isSupported) {
    return (
      <div className={`flex items-center gap-2 ${className}`} style={{ color: 'var(--fl-color-text-muted)' }}>
        <MicOff className="w-5 h-5" />
        <span className="text-sm">Voice input not supported</span>
      </div>
    )
  }

  const displayText = transcript + interimTranscript
  const hasText = displayText.trim().length > 0

  return (
    <div className={`relative ${className}`}>
      {/* Main input area */}
      <div
        className="flex items-center gap-2 rounded-lg p-2"
        style={{
          background: 'var(--fl-color-bg-surface)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        {/* Microphone button */}
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`p-3 rounded-full transition-all ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{
            background: isListening ? '#ef4444' : 'var(--fl-color-bg-elevated)',
            color: isListening ? 'white' : 'var(--fl-color-text-secondary)',
          }}
          title={isListening ? 'Stop recording' : 'Start recording'}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isListening ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* Waveform visualization */}
        <AnimatePresence>
          {isListening && showWaveform && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1 h-8"
            >
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full"
                  style={{ background: 'var(--fl-color-primary)' }}
                  animate={{
                    height: `${Math.max(4, volume * 32 * (1 + Math.sin(Date.now() / 100 + i) * 0.5))}px`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              ))}
              <Volume2 className="w-4 h-4 ml-1" style={{ color: 'var(--fl-color-primary)' }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript display / placeholder */}
        <div className="flex-1 min-w-0">
          {hasText ? (
            <p className="text-sm truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
              {transcript}
              <span style={{ color: 'var(--fl-color-text-muted)' }}>{interimTranscript}</span>
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
              {isListening ? 'Listening...' : placeholder}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {hasText && (
            <>
              <button
                onClick={handleClear}
                className="p-2 rounded transition-colors"
                style={{ color: 'var(--fl-color-text-muted)' }}
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing}
                className="p-2 rounded transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--fl-color-primary)',
                  color: 'white',
                }}
                title="Submit"
              >
                <Send className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded transcript view (when there's more text) */}
      <AnimatePresence>
        {displayText.length > 50 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 right-0 top-full mt-2 rounded-lg p-3 z-10 max-h-32 overflow-y-auto"
            style={{
              background: 'var(--fl-color-bg-surface)',
              border: '1px solid var(--fl-color-border)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>
              {transcript}
              <span style={{ color: 'var(--fl-color-text-muted)' }}>{interimTranscript}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default VoiceInput
