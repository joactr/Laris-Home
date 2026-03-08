import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';

interface VoiceAssistantState {
  isListening: boolean;
  transcript: string;
  isProcessing: boolean;
  error: string | null;
}

export function useVoiceAssistant() {
  const [state, setState] = useState<VoiceAssistantState>({
    isListening: false,
    transcript: '',
    isProcessing: false,
    error: null,
  });

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const finalTranscriptRef = useRef<string>('');

  const cleanup = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.close();
    }
    if (audioContext.current) {
      audioContext.current.close();
    }
    setState(prev => ({ ...prev, isListening: false }));
  }, []);

  const startListening = useCallback(async (
    onFinalTranscript: (transcript: string) => void
  ) => {
    try {
      setState({ isListening: true, transcript: '', isProcessing: false, error: null });
      finalTranscriptRef.current = '';

      // Fetch config
      const config = await api.voice.getConfig();
      if (!config.apiKey) {
        throw new Error('API Key de Deepgram no encontrada');
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup WebSocket
      socket.current = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=${config.language}&punctuate=true&interim_results=true&endpointing=${config.endpointing}`,
        ['token', config.apiKey]
      );

      socket.current.onopen = () => {
        mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.current.addEventListener('dataavailable', async (event) => {
          if (event.data.size > 0 && socket.current?.readyState === WebSocket.OPEN) {
            socket.current.send(event.data);
          }
        });

        mediaRecorder.current.start(250);
      };

      socket.current.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.channel?.alternatives?.[0]) {
          const alternative = data.channel.alternatives[0];
          const text = alternative.transcript;
          
          if (data.is_final) {
             if (text) {
                finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + text;
             }
             setState(prev => ({ ...prev, transcript: finalTranscriptRef.current }));
          } else {
             if (text) {
                setState(prev => ({ ...prev, transcript: (finalTranscriptRef.current ? finalTranscriptRef.current + ' ' : '') + text }));
             }
          }

          if (data.speech_final) {
             const finalResult = finalTranscriptRef.current;
             if (finalResult.trim()) {
                 setState(prev => ({ ...prev, isProcessing: true }));
                 cleanup();
                 Promise.resolve(onFinalTranscript(finalResult)).finally(() => {
                     setState(prev => ({ ...prev, isProcessing: false, transcript: '' }));
                 });
             } else {
                 cleanup();
             }
          }
        }
      };

      socket.current.onerror = (error) => {
        console.error('Deepgram WebSocket Error:', error);
        setState(prev => ({ ...prev, error: 'Revisa conexión a internet o configuración' }));
        cleanup();
      };

      socket.current.onclose = () => {
        cleanup();
      };

    } catch (err: any) {
      console.error('Error starting voice assistant:', err);
      // specific microphone error
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
         setState(prev => ({ ...prev, error: 'Activa el micrófono en tu navegador', isListening: false }));
      } else {
         setState(prev => ({ ...prev, error: err.message || 'Error al conectar', isListening: false }));
      }
      cleanup();
    }
  }, [cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    ...state,
    startListening,
    stopListening
  };
}
