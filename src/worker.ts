/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
    
    const result = await pipe(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
    });

    self.postMessage({ status: 'done', result });
  } catch (error: any) {
    self.postMessage({ status: 'error', message: error.message });
  }
};
