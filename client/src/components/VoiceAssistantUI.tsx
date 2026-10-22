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
        type="button"
        className={`icon-button voice-button ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
        onClick={handleToggle}
        aria-label={t('voice.accessibility.toggle')}
        aria-pressed={isListening}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <span className="spinner spinner-sm" aria-hidden="true" />
        ) : isListening ? (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </button>

      {(isListening || isProcessing) && (
        <div className="voice-status-overlay" role="status">
          <div className="voice-status-header">
            {isProcessing ? t('voice.processing') : t('voice.listening')}
          </div>
          <div className="voice-status-transcript">
            {transcript || placeholder || t('voice.placeholder.generic')}
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
