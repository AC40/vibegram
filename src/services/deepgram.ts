import { createClient, DeepgramClient } from '@deepgram/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client: DeepgramClient | null = null;

function getClient(): DeepgramClient {
  if (!client) {
    if (!config.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY is not configured');
    }
    client = createClient(config.DEEPGRAM_API_KEY);
  }
  return client;
}

export async function transcribeVoice(buffer: Buffer): Promise<string | null> {
  const deepgram = getClient();

  try {
    const { result } = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: 'nova-3',
      smart_format: true,
      mimetype: 'audio/ogg',
    });

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return transcript ?? null;
  } catch (error) {
    logger.error({ error }, 'Deepgram transcription error');
    throw error;
  }
}
