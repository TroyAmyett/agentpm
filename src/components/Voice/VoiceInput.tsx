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
      <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
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
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg border border-gray-700 p-2">
        {/* Microphone button */}
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`p-3 rounded-full transition-all ${
            isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  className="w-1 bg-cyan-500 rounded-full"
                  animate={{
                    height: `${Math.max(4, volume * 32 * (1 + Math.sin(Date.now() / 100 + i) * 0.5))}px`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              ))}
              <Volume2 className="w-4 h-4 text-cyan-500 ml-1" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript display / placeholder */}
        <div className="flex-1 min-w-0">
          {hasText ? (
            <p className="text-sm text-white truncate">
              {transcript}
              <span className="text-gray-400">{interimTranscript}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
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
                className="p-2 text-gray-400 hover:text-white rounded transition-colors"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing}
                className="p-2 bg-cyan-600 text-white rounded hover:bg-cyan-500 transition-colors disabled:opacity-50"
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
            className="absolute left-0 right-0 top-full mt-2 bg-gray-800 border border-gray-700 rounded-lg p-3 z-10 max-h-32 overflow-y-auto"
          >
            <p className="text-sm text-white">
              {transcript}
              <span className="text-gray-400">{interimTranscript}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default VoiceInput
