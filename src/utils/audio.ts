/**
 * @license
 * SPDX-License-Identifier: MIT
 */

export async function extractAudioFromVideo(videoBlob: Blob): Promise<Float32Array> {
  const audioContext = new AudioContext();
  const arrayBuffer = await videoBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // We need mono audio at 16000Hz for Whisper
  const offlineContext = new OfflineAudioContext(
    1,
    audioBuffer.duration * 16000,
    16000
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();

  const renderedBuffer = await offlineContext.startRendering();
  return renderedBuffer.getChannelData(0);
}
