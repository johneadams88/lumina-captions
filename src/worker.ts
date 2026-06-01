/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { pipeline, env } from '@xenova/transformers';

// Configuration for Transformers.js
env.allowLocalModels = false;

let transcriber: any = null;

async function getTranscriber() {
  if (!transcriber) {
    self.postMessage({ status: 'loading', message: 'Downloading Whisper model (~40MB)...', progress: 0 });
    
    const progressTracker = new Map();
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (d: any) => {
        if (d.status === 'progress' && d.total) {
          progressTracker.set(d.file, { loaded: d.loaded, total: d.total });
          let currentLoaded = 0;
          let currentTotal = 0;
          progressTracker.forEach((val) => {
            currentLoaded += val.loaded;
            currentTotal += val.total;
          });
          const p = (currentLoaded / currentTotal) * 100;
          self.postMessage({ status: 'progress', message: `Downloading model (${Math.round(p)}%)...`, progress: p });
        } else if (d.status === 'ready') {
          self.postMessage({ status: 'progress', message: 'Model downloaded', progress: 100 });
        }
      }
    });
    self.postMessage({ status: 'ready' });
  }
  return transcriber;
}

self.onmessage = async (event) => {
  const { audioData } = event.data;
  
  try {
    const pipe = await getTranscriber();
    
    self.postMessage({ status: 'processing', message: 'Transcribing audio...', progress: 100 });
    
    const SAMPLE_RATE = 16000;
    const MAX_CHUNK_SIZE = 30 * SAMPLE_RATE;
    const allChunks: any[] = [];
    const totalChunksEstimate = Math.ceil(audioData.length / MAX_CHUNK_SIZE);
    let chunkIndex = 0;

    // Helper to find a quiet point in the audio to avoid cutting words in half
    function findQuietCutPoint(audio: Float32Array, currentOffset: number): number {
      if (currentOffset + MAX_CHUNK_SIZE >= audio.length) {
        return audio.length - currentOffset; // Last chunk, just take the rest
      }

      // Search for a quiet spot in the last 5 seconds of the 30s chunk
      const searchSearchSamples = 5 * SAMPLE_RATE;
      const windowSize = Math.floor(0.2 * SAMPLE_RATE); // 200ms window
      let minEnergy = Infinity;
      let bestCutPoint = MAX_CHUNK_SIZE;

      for (let i = MAX_CHUNK_SIZE - windowSize; i >= MAX_CHUNK_SIZE - searchSearchSamples && i >= 0; i -= Math.floor(windowSize / 2)) {
        let energy = 0;
        for (let j = 0; j < windowSize; j++) {
          energy += Math.abs(audio[currentOffset + i + j]);
        }
        if (energy < minEnergy) {
          minEnergy = energy;
          bestCutPoint = i + Math.floor(windowSize / 2); // Cut in the middle of the quietest window
        }
      }
      return bestCutPoint;
    }

    // Manually chunk because Transformers.js word timestamps logic drops chunks > 30s
    for (let offset = 0; offset < audioData.length;) {
      const progress = Math.min(99, Math.round((chunkIndex / totalChunksEstimate) * 100));
      self.postMessage({ 
        status: 'processing', 
        message: `Transcribing audio (${progress}%)...`, 
        progress 
      });

      const actualChunkSize = findQuietCutPoint(audioData, offset);
      const chunkAudio = audioData.slice(offset, offset + actualChunkSize);
      const timeOffset = offset / SAMPLE_RATE;
      const actualChunkDuration = actualChunkSize / SAMPLE_RATE;
      
      const chunkResult = await pipe(chunkAudio, {
        return_timestamps: 'word',
      });
      
      if (chunkResult.chunks) {
        for (const c of chunkResult.chunks) {
          const start = c.timestamp[0];
          let end = c.timestamp[1];

          // Whisper pads chunkAudio to 30s. Ignore words hallucinated in the pad.
          if (start !== null && start >= actualChunkDuration) {
            continue;
          }

          // Clamp the end time of the last word to the exact cut point
          if (end !== null && end > actualChunkDuration) {
            end = actualChunkDuration;
          }

          allChunks.push({
            text: c.text,
            timestamp: [
              start !== null ? start + timeOffset : null,
              end !== null ? end + timeOffset : null
            ]
          });
        }
      }

      offset += actualChunkSize;
      chunkIndex++;
    }

    const result = { 
      text: allChunks.map(c => c.text).join('').trim(), 
      chunks: allChunks 
    };

    self.postMessage({ status: 'done', result });
  } catch (error: any) {
    self.postMessage({ status: 'error', message: error.message });
  }
};
