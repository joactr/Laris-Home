import React from 'react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { useVoiceStore } from '../store/voice';
import { t } from '../i18n';
import './VoiceAssistantUI.css';

export default function VoiceAssistantUI() {
  const { onResult, placeholder, isEnabled } = useVoiceStore();
  const { isListening, isProcessing, transcript, error, startListening, stopListening } = useVoiceAssistant();

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
    </>
  );
}
