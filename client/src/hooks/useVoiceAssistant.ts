import { useState, useRef, useCallback } from 'react';
import { api, ApiClientError } from '../api';

interface VoiceAssistantState {
  isListening: boolean;
  transcript: string;
  pendingTranscript: string;
  isProcessing: boolean;
  error: string | null;
}

export function useVoiceAssistant() {
  const [state, setState] = useState<VoiceAssistantState>({
    isListening: false,
    transcript: '',
    pendingTranscript: '',
    isProcessing: false,
    error: null,
  });

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const onFinalTranscriptRef = useRef<((transcript: string) => void | Promise<void>) | null>(null);

  const stopTracks = useCallback(() => {
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = null;
  }, []);

  const cleanupRecorder = useCallback(() => {
    mediaRecorder.current = null;
    chunksRef.current = [];
    setState((prev) => ({ ...prev, isListening: false }));
  }, []);

  const processRecording = useCallback(async (chunks: BlobPart[], mimeType: string) => {
    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
    if (!blob.size) {
      setState((prev) => ({ ...prev, isProcessing: false, error: 'No se detecto audio en la grabacion.' }));
      return;
    }

    try {
      const result = await api.voice.transcribe(blob);
      setState((prev) => ({
        ...prev,
        transcript: '',
        pendingTranscript: result.transcript,
        isProcessing: false,
      }));
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'No se pudo transcribir el audio.';
      setState((prev) => ({ ...prev, isProcessing: false, error: message, transcript: '', pendingTranscript: '' }));
    }
  }, []);

  const startListening = useCallback(async (
    onFinalTranscript: (transcript: string) => void | Promise<void>
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      onFinalTranscriptRef.current = onFinalTranscript;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const chunks = chunksRef.current;
        const recordedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        chunksRef.current = [];
        mediaRecorder.current = null;
        stopTracks();
        setState((prev) => ({ ...prev, isListening: false, isProcessing: true }));
        void processRecording(chunks, recordedMimeType);
      });

      recorder.start();
      setState({ isListening: true, transcript: '', pendingTranscript: '', isProcessing: false, error: null });
    } catch (error: any) {
      const message = error?.name === 'NotAllowedError' || error?.name === 'NotFoundError'
        ? 'Activa el microfono en tu navegador'
        : error?.message || 'Error al iniciar la grabacion';
      stopTracks();
      cleanupRecorder();
      setState((prev) => ({ ...prev, error: message, isListening: false }));
    }
  }, [cleanupRecorder, processRecording, stopTracks]);

  const stopListening = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      return;
    }
    stopTracks();
    cleanupRecorder();
  }, [cleanupRecorder, stopTracks]);

  const submitTranscript = useCallback(async (nextTranscript: string) => {
    const cleaned = nextTranscript.trim();
    if (!cleaned) {
      setState((prev) => ({ ...prev, pendingTranscript: '' }));
      return;
    }
    setState((prev) => ({ ...prev, isProcessing: true, pendingTranscript: cleaned, error: null }));
    try {
      await Promise.resolve(onFinalTranscriptRef.current?.(cleaned));
      setState((prev) => ({ ...prev, isProcessing: false, pendingTranscript: '', transcript: '' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo procesar la transcripcion.';
      setState((prev) => ({ ...prev, isProcessing: false, error: message }));
    }
  }, []);

  const clearPendingTranscript = useCallback(() => {
    setState((prev) => ({ ...prev, pendingTranscript: '' }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    submitTranscript,
    clearPendingTranscript,
  };
}
