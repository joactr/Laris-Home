import { ApiError } from '../lib/api-error';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_LANGUAGE || 'es';
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || 'nova-2';

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
};

export class SpeechService {
  static isConfigured() {
    return Boolean(DEEPGRAM_API_KEY);
  }

  static async transcribe(audio: Buffer, mimeType: string) {
    if (!DEEPGRAM_API_KEY) {
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'La transcripcion de voz no esta configurada.');
    }

    if (!audio.length) {
      throw new ApiError(400, 'BAD_REQUEST', 'El audio enviado esta vacio.');
    }

    const response = await fetch(
      `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(DEEPGRAM_MODEL)}&language=${encodeURIComponent(DEEPGRAM_LANGUAGE)}&smart_format=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': mimeType || 'audio/webm',
        },
        body: audio,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new ApiError(502, 'PROVIDER_UNAVAILABLE', `Deepgram error: ${response.status}`, message);
    }

    const data = await response.json() as DeepgramResponse;
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

    if (!transcript) {
      throw new ApiError(422, 'INVALID_RESPONSE', 'No se pudo obtener una transcripcion valida.');
    }

    return { transcript };
  }
}
