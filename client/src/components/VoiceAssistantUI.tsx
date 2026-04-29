import React, { useEffect, useState } from 'react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { useVoiceStore } from '../store/voice';
import { t } from '../i18n';
import './VoiceAssistantUI.css';

export default function VoiceAssistantUI() {
  const { onResult, placeholder, isEnabled } = useVoiceStore();
  const {
    isListening,
    isProcessing,
    transcript,
    pendingTranscript,
    error,
    startListening,
    stopListening,
    submitTranscript,
    clearPendingTranscript,
  } = useVoiceAssistant();
  const [draftTranscript, setDraftTranscript] = useState('');

  useEffect(() => {
    setDraftTranscript(pendingTranscript);
  }, [pendingTranscript]);

  if (!isEnabled || !onResult) return null;

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(onResult);
    }
  };

  return (
    <>
      <button 
        className={`voice-fab ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
        onClick={handleToggle}
        aria-label={t('voice.accessibility.toggle', 'Alternar asistente de voz')}
      >
        {isProcessing ? '⏳' : isListening ? '⏹' : '🎤'}
      </button>

      {(isListening || isProcessing) && (
        <div className="voice-status-overlay">
          <div className="voice-status-header">
            {isProcessing ? t('voice.processing') : t('voice.listening')}
          </div>
          <div className="voice-status-transcript">
            {transcript || placeholder || t('voice.placeholder.generic', 'Di algo...')}
          </div>
        </div>
      )}

      {error && (
        <div className="voice-error-toast" role="alert">
          {error}
        </div>
      )}

      {pendingTranscript ? (
        <div className="modal-overlay" onClick={clearPendingTranscript}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('voice.reviewTranscript')}</span>
              <button className="modal-close touch-target" onClick={clearPendingTranscript} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="muted-inline">{t('voice.reviewTranscriptHint')}</p>
              <textarea
                className="input"
                rows={4}
                value={draftTranscript}
                onChange={(event) => setDraftTranscript(event.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => startListening(onResult)}>
                  {t('common.retry')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearPendingTranscript}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void submitTranscript(draftTranscript)}>
                  {t('voice.processTranscript')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
