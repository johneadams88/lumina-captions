/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Settings, 
  Download, 
  Type, 
  Trash2, 
  Plus, 
  Play, 
  Pause, 
  Loader2,
  CheckCircle2,
  Sparkles,
  SkipBack,
  SkipForward,
  RotateCcw,
  Palette,
  Pipette,
  Save,
  Edit2
  , Coffee, Scissors, Zap, FileVideo, Github
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Caption, CaptionStyle, FONT_OPTIONS, PRESETS } from './types';
import { extractAudioFromVideo } from './utils/audio';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'extracting' | 'loading_model' | 'transcribing' | 'editing' | 'exporting'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(PRESETS.modern);
  const [userPresets, setUserPresets] = useState<Record<string, CaptionStyle>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hideNonSpeech, setHideNonSpeech] = useState(true);
  const [removePunctuation, setRemovePunctuation] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(true); // Mobile drawer state
  const [rawWords, setRawWords] = useState<any[]>([]);
  
  const [activePage, setActivePage] = useState<'app' | 'about' | 'privacy' | 'terms'>('app');
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'save' | 'rename' | 'delete';
    targetKey?: string;
    inputValue?: string;
  }>({ isOpen: false, type: 'save' });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const isEditor = status === 'editing' || status === 'exporting';

  useEffect(() => {
    const stored = localStorage.getItem('userPresets');
    if (stored) {
      try {
        setUserPresets(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse user presets", e);
      }
    }
  }, []);

  const handleSavePreset = () => {
    setModalState({ isOpen: true, type: 'save', inputValue: 'My Preset' });
  };

  const confirmSavePreset = () => {
    const name = modalState.inputValue?.trim();
    if (!name) return;
    const newPresets = { ...userPresets, [name]: style };
    setUserPresets(newPresets);
    localStorage.setItem('userPresets', JSON.stringify(newPresets));
    setModalState({ isOpen: false, type: 'save' });
  };

  const handleDeletePreset = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalState({ isOpen: true, type: 'delete', targetKey: name });
  };

  const confirmDeletePreset = () => {
    if (!modalState.targetKey) return;
    const newPresets = { ...userPresets };
    delete newPresets[modalState.targetKey];
    setUserPresets(newPresets);
    localStorage.setItem('userPresets', JSON.stringify(newPresets));
    setModalState({ isOpen: false, type: 'save' });
  };

  const handleRenamePreset = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalState({ isOpen: true, type: 'rename', targetKey: key, inputValue: key });
  };

  const confirmRenamePreset = () => {
    const newName = modalState.inputValue?.trim();
    const oldKey = modalState.targetKey;
    if (!newName || !oldKey || newName === oldKey) {
        setModalState({ isOpen: false, type: 'save' });
        return;
    }
    const newPresets = { ...userPresets };
    newPresets[newName] = newPresets[oldKey];
    delete newPresets[oldKey];
    setUserPresets(newPresets);
    localStorage.setItem('userPresets', JSON.stringify(newPresets));
    setModalState({ isOpen: false, type: 'save' });
  };

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (event) => {
      const { status: workerStatus, message: workerMessage, result, progress: workerProgress } = event.data;
      
      if (workerStatus === 'loading') {
        setStatus('loading_model');
        setMessage(workerMessage);
        if (workerProgress !== undefined) setProgress(workerProgress);
      } else if (workerStatus === 'progress') {
        if (workerMessage) setMessage(workerMessage);
        if (workerProgress !== undefined) setProgress(workerProgress);
      } else if (workerStatus === 'ready') {
        // Ready to transcribe
        setProgress(100);
      } else if (workerStatus === 'processing') {
        setStatus('transcribing');
        setMessage(workerMessage);
        setProgress(100); // Indeterminate or just complete for transcribing step
      } else if (workerStatus === 'done') {
        const words = result.chunks.map((chunk: any) => ({
          text: chunk.text.trim(),
          start: chunk.timestamp[0],
          end: chunk.timestamp[1] || chunk.timestamp[0] + 0.3,
        })).filter((w: any) => w.text.length > 0);

        setRawWords(words);
        setStatus('editing');
      } else if (workerStatus === 'error') {
        alert('Error: ' + workerMessage);
        setStatus('idle');
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  // Process raw words into captions based on settings
  useEffect(() => {
    if (rawWords.length === 0) return;

    let filteredWords = rawWords;
    if (hideNonSpeech) {
      // More robust filtering for bracketed content
      filteredWords = rawWords.filter(w => {
        const text = w.text.trim();
        return !(text.startsWith('[') || text.endsWith(']') || text.includes('[') || text.includes(']'));
      });
    }

    const grouped: Caption[] = [];
    let currentGroup: any[] = [];
    
    filteredWords.forEach((word: any, index: number) => {
      // Keep original text for grouping logic
      currentGroup.push(word);
      if (currentGroup.length >= 6 || word.text.match(/[.!?]$/) || index === filteredWords.length - 1) {
        
        let finalGroupWords = [...currentGroup];
        if (removePunctuation) {
          finalGroupWords = finalGroupWords.map(w => ({
            ...w,
            text: w.text.replace(/[.,!?]+$/, '')
          }));
        }

        grouped.push({
          id: grouped.length.toString(),
          start: currentGroup[0].start,
          end: currentGroup[currentGroup.length - 1].end,
          text: finalGroupWords.map(w => w.text).join(' '),
          words: finalGroupWords,
        });
        currentGroup = [];
      }
    });

    setCaptions(grouped);
  }, [rawWords, hideNonSpeech, removePunctuation]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setStatus('extracting');
    setMessage('Extracting audio from video...');

    try {
      const audioData = await extractAudioFromVideo(file);
      workerRef.current?.postMessage({ audioData });
    } catch (err: any) {
      alert('Failed to process video audio: ' + err.message);
      setStatus('idle');
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  // Export Logic
  const handleExport = async (format: 'mp4' | 'webm' = 'mp4') => {
    if (!videoRef.current || !videoUrl) return;
    
    // Pause main video so it doesn't distract the user
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    
    setStatus('exporting');
    setProgress(0);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a hidden video element specifically for export
    const exportVideo = document.createElement('video');
    exportVideo.src = videoUrl;
    exportVideo.crossOrigin = 'anonymous';
    // Mute visual output and append to DOM so browser doesn't throttle it
    exportVideo.style.position = 'absolute';
    exportVideo.style.opacity = '0';
    exportVideo.style.pointerEvents = 'none';
    exportVideo.muted = true; // Initially muted so it can auto-play if needed, but we intercept audio below

    await new Promise((resolve) => {
      exportVideo.onloadeddata = resolve;
    });

    document.body.appendChild(exportVideo);

    canvas.width = exportVideo.videoWidth;
    canvas.height = exportVideo.videoHeight;

    const stream = canvas.captureStream(30);
    
    // Intercept audio and add to stream WITHOUT sending to speakers
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Important: we need to ensure the exportVideo is not muted if we want to capture its audio via Web Audio API. 
    // Muted video tags sometimes route 0s to createMediaElementSource in some browsers. 
    // Since we DON'T connect the source to audioCtx.destination, it remains silent to the user!
    exportVideo.muted = false; 
    
    const source = audioCtx.createMediaElementSource(exportVideo);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    // Do NOT connect to audioCtx.destination, keeping it completely silent.
    
    // Add audio track to stream
    dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));

    let mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9';
    let outputFormat = format;
    if (format === 'mp4' && !MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/webm;codecs=vp9';
      outputFormat = 'webm';
      alert('MP4 export is not natively supported in this browser. Falling back to WebM.');
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: format === 'mp4' && outputFormat === 'mp4' ? 'video/mp4' : 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `captioned-video.${outputFormat}`;
      a.click();
      setStatus('editing');
      setProgress(100);
      exportVideo.remove();
      audioCtx.close();
    };

    // Start recording
    exportVideo.currentTime = 0;
    exportVideo.play();
    recorder.start();

    const renderFrame = () => {
      if (exportVideo.paused || exportVideo.ended) {
        recorder.stop();
        return;
      }

      ctx.drawImage(exportVideo, 0, 0, canvas.width, canvas.height);
      
      // Draw Captions
      const activeCaption = captions.find(c => exportVideo.currentTime >= c.start && exportVideo.currentTime <= c.end);
      if (activeCaption) {
        drawCaption(ctx, activeCaption, exportVideo.currentTime, canvas.width, canvas.height, style);
      }
      
      if (exportVideo.duration) {
         setProgress((exportVideo.currentTime / exportVideo.duration) * 100);
      }

      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  };

  const handleReset = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setCaptions([]);
    setRawWords([]);
    setProgress(0);
    setStatus('idle');
  };

  const drawCaption = (ctx: CanvasRenderingContext2D, caption: Caption, time: number, w: number, h: number, style: CaptionStyle) => {
    ctx.textAlign = 'center';
    ctx.font = `${style.bold ? 'bold ' : ''}${style.fontSize * (w / 1080)}px ${style.fontFamily}`;
    ctx.textBaseline = 'middle';

    const words = caption.words || [];
    const activeWordIndex = words.findIndex(w => time >= w.start && time <= w.end);

    let y = h / 2;
    if (style.position === 'top') y = h / 6;
    if (style.position === 'bottom') y = 5 * h / 6;

    if (style.displayMode === 'word') {
      const activeWord = words[activeWordIndex] || words[0];
      const text = style.uppercase ? activeWord.text.toUpperCase() : activeWord.text;
      
      const metrics = ctx.measureText(text);
      const padding = style.fontSize * 0.4 * (w / 1080);
      
      if (style.backgroundColor !== 'transparent') {
        ctx.fillStyle = style.backgroundColor;
        const rectX = w/2 - metrics.width/2 - padding;
        const rectY = y - style.fontSize*(w/1080)/2 - padding;
        const rectW = metrics.width + padding*2;
        const rectH = style.fontSize*(w/1080) + padding*2;
        const radius = (style.borderRadius || 0) * (w / 1080);
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, radius);
        ctx.fill();
      }
      ctx.fillStyle = style.color;
      ctx.fillText(text, w / 2, y);
      return;
    }

    // Default or sentence mode with possible highlighting
    const maxWidth = w * 0.85;
    const lineHeight = style.fontSize * (w / 1080) * 1.2;
    const padding = style.fontSize * 0.4 * (w / 1080);
    const radius = (style.borderRadius || 0) * (w / 1080);
    const spaceWidth = ctx.measureText(' ').width;

    const lines: { text: string, width: number, words: { text: string, isHighlighted: boolean, width: number, spaceWidth: number }[] }[] = [];
    let currentLineWords: { text: string, isHighlighted: boolean, width: number, spaceWidth: number }[] = [];
    let currentLineWidth = 0;

    const sourceWords = words.length > 0 ? words : caption.text.split(' ').map(t => ({ text: t, start: 0, end: 0 }));

    sourceWords.forEach((wordObj, i) => {
      const isHighlighted = words.length > 0 ? (i === activeWordIndex) : false;
      const wordText = style.uppercase ? wordObj.text.toUpperCase() : wordObj.text;
      
      const wordWidth = ctx.measureText(wordText).width;
      const addition = currentLineWords.length === 0 ? wordWidth : spaceWidth + wordWidth;

      if (currentLineWords.length > 0 && currentLineWidth + addition > maxWidth) {
         lines.push({ text: currentLineWords.map(w => w.text).join(' '), width: currentLineWidth, words: currentLineWords });
         currentLineWords = [{ text: wordText, isHighlighted, width: wordWidth, spaceWidth: 0 }];
         currentLineWidth = wordWidth;
      } else {
         currentLineWords.push({ text: wordText, isHighlighted, width: wordWidth, spaceWidth: currentLineWords.length === 0 ? 0 : spaceWidth });
         currentLineWidth += addition;
      }
    });

    if (currentLineWords.length > 0) {
      lines.push({ text: currentLineWords.map(w => w.text).join(' '), width: currentLineWidth, words: currentLineWords });
    }

    const totalHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(...lines.map(l => l.width));
    const startY = y - totalHeight / 2;

    if (style.backgroundColor !== 'transparent') {
      ctx.fillStyle = style.backgroundColor;
      const rectX = w / 2 - maxLineWidth / 2 - padding;
      const rectY = startY - padding;
      const rectW = maxLineWidth + padding * 2;
      const rectH = totalHeight + padding * 2;
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, radius);
      ctx.fill();
    }

    lines.forEach((line, lineIndex) => {
      // align vertically to middle for each line
      const lineY = startY + lineIndex * lineHeight + lineHeight / 2;
      
      if (!style.highlightColor) {
        ctx.fillStyle = style.color;
        ctx.textAlign = 'center';
        ctx.fillText(line.text, w / 2, lineY);
      } else {
        let currentX = w / 2 - line.width / 2;
        line.words.forEach(word => {
          currentX += word.spaceWidth;
          ctx.fillStyle = word.isHighlighted ? style.highlightColor : style.color;
          ctx.textAlign = 'left';
          ctx.fillText(word.text, currentX, lineY);
          currentX += word.width;
        });
        ctx.textAlign = 'center';
      }
    });
  };



  return (
    <div className="h-screen bg-brand-charcoal text-brand-white font-sans selection:bg-brand-orange overflow-hidden flex flex-col">
      <header className="h-16 flex items-center justify-between px-8 border-b border-brand-orange/20 shrink-0 sticky top-0 z-50 bg-brand-header-black/90 backdrop-blur-md">
        <button onClick={() => setActivePage('app')} className="flex items-center gap-4 group">
          <div className="w-8 h-8 bg-brand-orange rounded flex items-center justify-center group-hover:scale-105 transition-transform">
            <Scissors className="w-5 h-5 text-brand-black" />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase italic text-brand-white flex gap-1">Lumina<span className="text-brand-orange">Captions</span></h1>
        </button>
        <a
          href="https://buymeacoffee.com/john.adams"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center justify-center gap-2 rounded bg-brand-orange px-5 py-2 text-sm font-semibold text-brand-header-black shadow-[0_0_18px_rgba(243,121,27,0.25)] transition hover:bg-brand-600"
        >
          <Coffee className="w-4 h-4" />
          <span>Buy Me A Coffee</span>
        </a>
      </header>

      <div className={`flex-1 w-full ${isEditor ? 'overflow-hidden flex flex-col' : 'overflow-y-auto flex flex-col'}`}>
      <AnimatePresence mode="wait">
        {status === 'idle' && activePage === 'app' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-6 py-20 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(243,121,27,0.16),transparent_42%)] pointer-events-none" />

            <div className="relative z-10 max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-grey/70 border border-brand-orange/25 text-brand-orange text-sm font-medium mb-4">
                <Zap className="w-4 h-4" />
                <span>100% Local, Browser-by-Browser Processing</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold text-brand-white tracking-tight leading-tight">
                Lumina Captions. <br />
                <span className="text-brand-orange italic">Pro captions.</span>
              </h1>
              
              <p className="text-lg md:text-xl text-brand-white/70 max-w-2xl mx-auto leading-relaxed">
                Transform your videos with on-device AI. Pure privacy, professional styles, zero server lag.
              </p>

              <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <label
                  className="group relative cursor-pointer overflow-hidden rounded-lg bg-brand-orange px-8 py-4 text-brand-white font-bold uppercase tracking-widest transition shadow-[0_0_30px_rgba(243,121,27,0.3)] w-full sm:w-auto flex items-center gap-2 justify-center text-lg"
                >
                  <Upload className="w-6 h-6" />
                  <span>Upload Video</span>
                  <input type="file" className="hidden" accept="video/*" onChange={handleFileUpload} />
                </label>

                <a
                  href="https://github.com/Fr0z3nRebel/lumina-captions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-8 py-4 bg-brand-grey hover:bg-brand-grey/80 text-brand-white font-bold uppercase tracking-widest rounded-lg transition border border-brand-orange/20 w-full sm:w-auto justify-center text-lg"
                >
                  <Github className="w-6 h-6" />
                  <span>View on GitHub</span>
                </a>
              </div>
            </div>

            {/* Feature section */}
            <div id="features" className="relative z-10 mt-32 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto w-full text-left">
              <div className="bg-brand-grey/55 border border-brand-orange/15 rounded-2xl p-8 hover:bg-brand-grey/75 transition">
                <div className="w-12 h-12 bg-brand-orange/20 rounded-xl flex items-center justify-center mb-6 text-brand-orange">
                  <FileVideo className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-white mb-3">1. Upload Video</h3>
                <p className="text-brand-white/65">Load any MP4 video directly into your browser. Your files never leave your computer.</p>
              </div>
              
              <div className="bg-brand-grey/55 border border-brand-orange/15 rounded-2xl p-8 hover:bg-brand-grey/75 transition">
                <div className="w-12 h-12 bg-brand-orange/20 rounded-xl flex items-center justify-center mb-6 text-brand-orange">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-white mb-3">2. Auto-Detect</h3>
                <p className="text-brand-white/65">Our audio analyzer pinpoints exact moments of speech for accurate captions.</p>
              </div>

              <div className="bg-brand-grey/55 border border-brand-orange/15 rounded-2xl p-8 hover:bg-brand-grey/75 transition">
                <div className="w-12 h-12 bg-brand-orange/20 rounded-xl flex items-center justify-center mb-6 text-brand-orange">
                  <Type className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-white mb-3">3. Export & Download</h3>
                <p className="text-brand-white/65">Preview and export captioned video or subtitle files without server uploads.</p>
              </div>
            </div>
          </motion.div>
        )}

        {status === 'idle' && activePage === 'about' && (
          <motion.div
            key="about"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-[calc(100vh-64px)] bg-brand-charcoal text-brand-white px-6 py-12 md:px-12"
          >
            <div className="max-w-3xl mx-auto">
              <button
                onClick={() => setActivePage('app')}
                className="mb-8 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-orange text-brand-orange bg-transparent hover:bg-brand-orange hover:text-brand-white transition-colors w-fit"
              >
                <span aria-hidden="true">&larr;</span>
                <span>Back to App</span>
              </button>

              <h1 className="text-4xl font-medium mb-8 tracking-tight">About Me</h1>

              <div className="space-y-6 text-brand-white/80 leading-relaxed">
                <p className="text-lg">
                  Hi, I'm <strong className="text-brand-white">John Adams</strong>, the creator of Lumina Captions.
                </p>

                <p>
                  I built this software because I was tired of seeing creators and small business owners
                  get price-gouged by big, greedy corporations charging an arm and a leg for simple video captioning.
                  Tools like this shouldn't be locked behind expensive monthly subscriptions.
                </p>
                <p>
                  That's why Lumina Captions is fully free, runs directly on your device, respects your privacy,
                  and has absolutely no watermarks.
                </p>

                <p>
                  I run{' '}
                  <a
                    href="https://leftystudios.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-orange hover:text-brand-200 underline"
                  >
                    Lefty Studios
                  </a>
                  , where my mission is to help you create better images and videos to drive better sales.
                </p>

                <p>
                  Lumina Captions is part of that larger idea: software should empower creators, not exploit them.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 pt-4 mt-8">
                  <a
                    href="https://buymeacoffee.com/john.adams"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#FFDD00] text-brand-black px-6 py-3 rounded-full font-medium inline-flex items-center justify-center hover:bg-[#FFDD00]/90 transition-colors shadow-lg"
                  >
                    Buy me a coffee
                  </a>
                  <a
                    href="https://leftystudios.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-brand-grey text-brand-white border border-brand-orange/20 px-6 py-3 rounded-full font-medium inline-flex items-center justify-center hover:bg-brand-grey/80 transition-colors"
                  >
                    Visit Lefty Studios
                  </a>
                  <a
                    href="https://www.linkedin.com/in/johneadams88/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#0A66C2] text-white px-6 py-3 rounded-full font-medium inline-flex items-center justify-center hover:bg-[#0A66C2]/90 transition-colors"
                  >
                    Connect on LinkedIn
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {status === 'idle' && activePage === 'privacy' && (
          <motion.div
            key="privacy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-[calc(100vh-64px)] bg-brand-charcoal text-brand-white px-6 py-12 md:px-12"
          >
            <div className="max-w-3xl mx-auto">
              <button
                onClick={() => setActivePage('app')}
                className="mb-8 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-orange text-brand-orange bg-transparent hover:bg-brand-orange hover:text-brand-white transition-colors w-fit"
              >
                <span aria-hidden="true">&larr;</span>
                <span>Back to App</span>
              </button>

              <h1 className="text-3xl font-bold text-brand-white mb-8 tracking-tight">Privacy Policy</h1>
              
              <div className="space-y-6 text-brand-white/75 leading-relaxed">
                <p>Effective Date: {new Date().toLocaleDateString()}</p>
                
                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">1. Information We Collect</h2>
                <p>
                  We do not collect or store your videos. All processing happens locally within your browser using WebAssembly.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">2. Processing of Media</h2>
                <p>
                  When you upload a video, the analysis and rendering operations run directly on your device. We do not upload, share, or store your original or processed files on any external servers.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">3. Local Storage</h2>
                <p>
                  We use your browser's local storage to save your custom caption presets. This data remains on your device and is not synchronized with any cloud service.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">4. Changes to this Policy</h2>
                <p>
                  We may update our Privacy Policy periodically. We encourage you to review this page occasionally for any changes.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {status === 'idle' && activePage === 'terms' && (
          <motion.div
            key="terms"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-[calc(100vh-64px)] bg-brand-charcoal text-brand-white px-6 py-12 md:px-12"
          >
            <div className="max-w-3xl mx-auto">
              <button
                onClick={() => setActivePage('app')}
                className="mb-8 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-orange text-brand-orange bg-transparent hover:bg-brand-orange hover:text-brand-white transition-colors w-fit"
              >
                <span aria-hidden="true">&larr;</span>
                <span>Back to App</span>
              </button>

              <h1 className="text-3xl font-bold text-brand-white mb-8 tracking-tight">Terms of Service</h1>
              
              <div className="space-y-6 text-brand-white/75 leading-relaxed">
                <p>Effective Date: {new Date().toLocaleDateString()}</p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">2. Use of Service</h2>
                <p>
                  This service provides browser-based video captioning. Because processing happens locally on your device, performance may vary depending on your hardware. We provide the service "as is", without any warranties.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">3. User Responsibilities</h2>
                <p>
                  You are solely responsible for the media you process. You agree not to use the service for any illegal or unauthorized purpose.
                </p>

                <h2 className="text-xl font-bold text-brand-white mt-8 mb-4">4. Intellectual Property</h2>
                <p>
                  We claim no intellectual property rights over the media you provide to the service. Your material remains yours.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {(status === 'extracting' || status === 'loading_model' || status === 'transcribing') && (
          <motion.div 
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black flex flex-col items-center justify-center p-6"
          >
            <div className="relative mb-12">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="w-32 h-32 rounded-full border-t-2 border-orange-500"
              />
            </div>
            <h2 className="text-2xl font-display mb-2">{status === 'transcribing' ? 'Transcribing...' : 'Initializing...'}</h2>
            <p className="text-white/40 mb-8">{message}</p>
          </motion.div>
        )}

        {(status === 'editing' || status === 'exporting') && (
          <motion.div 
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col lg:flex-row h-screen bg-black overflow-hidden"
          >
            {/* Main Preview Area */}
            <div className="flex-1 relative flex flex-col items-center justify-center bg-neutral-950 p-4 lg:p-12 overflow-hidden gap-6">
              <div 
                style={{ containerType: 'inline-size' }}
                className="relative aspect-[9/16] h-full max-h-[85vh] bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 group"
              >
                <video 
                  ref={videoRef}
                  src={videoUrl || ''} 
                  className="w-full h-full object-cover"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onClick={togglePlay}
                />
                
                {/* Active Caption Overlay */}
                <div className="absolute inset-0 pointer-events-none px-8">
                  {captions.find(c => currentTime >= c.start && currentTime <= c.end) && (
                    <motion.div 
                      key={captions.find(c => currentTime >= c.start && currentTime <= c.end)?.id}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.1 }}
                      className={cn(
                        "absolute left-8 right-8 text-center p-4 rounded-xl -translate-y-1/2 flex items-center justify-center",
                        style.position === 'top' && 'top-[16.6%]',
                        style.position === 'middle' && 'top-[50%]',
                        style.position === 'bottom' && 'top-[83.3%]'
                      )}
                    >
                      <div 
                        style={{ 
                          fontSize: `${(style.fontSize / 1080) * 100}cqw`,
                          fontFamily: style.fontFamily,
                          backgroundColor: style.backgroundColor,
                          padding: style.backgroundColor !== 'transparent' ? '0.2em 0.4em' : '0',
                          borderRadius: style.backgroundColor !== 'transparent' ? `${((style.borderRadius || 0) / 1080) * 100}cqw` : '0',
                        }}
                        className="leading-tight"
                      >
                        {(() => {
                          const activeCap = captions.find(c => currentTime >= c.start && currentTime <= c.end)!;
                          if (style.displayMode === 'word') {
                            const activeWord = activeCap.words?.find(w => currentTime >= w.start && currentTime <= w.end) || activeCap.words?.[0];
                            return (
                              <span style={{ color: style.color }}>
                                {style.uppercase ? activeWord?.text.toUpperCase() : activeWord?.text}
                              </span>
                            );
                          }

                          const wordsToDisplay = activeCap.words || [];
                          if (wordsToDisplay.length === 0) {
                             return <span style={{ color: style.color }}>{style.uppercase ? activeCap.text.toUpperCase() : activeCap.text}</span>;
                          }

                          return wordsToDisplay.map((word, idx) => {
                            const isHighlighted = currentTime >= word.start && currentTime <= word.end;
                            return (
                              <span 
                                key={idx} 
                                style={{ 
                                  color: isHighlighted && style.highlightColor ? style.highlightColor : style.color,
                                  fontWeight: (isHighlighted && style.highlightColor) ? 'bold' : style.bold ? 'bold' : 'normal'
                                }}
                              >
                                {style.uppercase ? word.text.toUpperCase() : word.text}{' '}
                              </span>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Video Controls Overlay */}
                <div className={cn(
                  "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 transition-opacity duration-300",
                  isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                )}>
                  {/* Progress Bar Container */}
                  <div className="flex flex-col gap-4">
                    <div className="relative w-full h-8 flex items-center group/seeker cursor-pointer">
                      <input 
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => handleSeek(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-orange-500 hover:h-1.5 transition-all"
                      />
                      <div className="absolute -top-6 left-0 text-[10px] font-mono text-white/60">
                        {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')} 
                        <span className="mx-1">/</span>
                        {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6">
                      <button 
                        onClick={() => handleSeek(0)}
                        className="p-2 border border-orange-500 text-orange-500 rounded-full hover:bg-orange-500 hover:text-white transition-colors"
                        title="Restart"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                      
                      <button 
                        onClick={togglePlay}
                        className="bg-transparent border border-orange-500 text-orange-500 p-4 rounded-full shadow-lg hover:bg-orange-500 hover:text-white hover:scale-110 active:scale-90 transition-transform"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                      </button>

                      <button 
                        onClick={() => handleSeek(duration)}
                        className="p-2 border border-orange-500 text-orange-500 rounded-full hover:bg-orange-500 hover:text-white transition-colors"
                        title="Skip to End"
                      >
                        <SkipForward className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buy Me A Coffee Button under video */}
              <div className="flex flex-col items-center gap-2 pt-6">
                <span className="text-sm text-brand-white/60 italic">If you enjoyed this app</span>
                <a 
                  href="https://buymeacoffee.com/john.adams" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-transparent border border-brand-orange text-brand-orange px-6 py-2.5 rounded-full font-medium flex items-center gap-2 hover:bg-brand-orange hover:text-brand-black transition shadow-lg"
                >
                  <span>Buy me a coffee</span>
                </a>
              </div>

              <button 
                onClick={() => setIsEditorOpen(!isEditorOpen)}
                className={cn(
                  "lg:hidden fixed bottom-8 right-8 z-50 p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center gap-2 border border-orange-500",
                  isEditorOpen ? "bg-orange-500 text-white" : "bg-black text-orange-500"
                )}
              >
                <Settings className={cn("w-6 h-6 transition-transform duration-500", isEditorOpen && "rotate-180")} />
                <span className="font-medium text-sm">{isEditorOpen ? 'Close Editor' : 'Open Editor'}</span>
              </button>
            </div>

            {/* Sidebar Editor */}
            <motion.div 
              initial={false}
              animate={{ 
                x: (typeof window !== 'undefined' && window.innerWidth < 1024) 
                  ? (isEditorOpen ? 0 : '100%') 
                  : 0 
              }}
              className={cn(
                "fixed inset-y-0 right-0 z-40 w-full lg:w-[400px] bg-black border-l border-white/10 flex flex-col h-full transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-0 shadow-2xl lg:shadow-none",
                !isEditorOpen && "pointer-events-none lg:pointer-events-auto"
              )}
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-medium text-lg">Editor</h3>
                  <div className="lg:hidden text-xs text-white/40 border border-white/10 px-2 py-0.5 rounded-full">Mobile</div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleReset}
                    className="bg-transparent border border-white/20 text-white/80 px-4 py-2 rounded-full text-sm font-medium flex items-center hover:bg-white/10 transition-colors shrink-0"
                  >
                    Start Over
                  </button>
                  <button 
                    onClick={() => handleExport('mp4')}
                    disabled={status === 'exporting'}
                    className="bg-transparent border border-orange-500 text-orange-500 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-orange-500 hover:text-white transition-colors disabled:opacity-50 shrink-0"
                  >
                    {status === 'exporting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {status === 'exporting' ? 'Exporting...' : 'Export MP4'}
                  </button>
                </div>
              </div>

              {/* Tabs / Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Presets */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-medium text-white/40 uppercase tracking-widest block">Style Presets</span>
                    <button onClick={handleSavePreset} className="text-white hover:text-orange-500 p-1 rounded flex items-center justify-center transition-colors" title="Save Preset"><Save className="w-4 h-4"/></button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(PRESETS).map(([key, s]) => (
                      <div 
                        role="button"
                        tabIndex={0}
                        key={key}
                        onClick={() => setStyle(s)}
                        onKeyDown={(e) => e.key === 'Enter' && setStyle(s)}
                        className={cn(
                          "aspect-[2/1] rounded-2xl border-2 transition-all flex flex-col items-center justify-center p-2 relative group cursor-pointer",
                          JSON.stringify(style) === JSON.stringify(s) 
                            ? "border-orange-500 bg-transparent text-orange-500" 
                            : "border-orange-500/30 bg-transparent text-orange-500/70 hover:border-orange-500"
                        )}
                      >
                        <span className="capitalize text-[10px] mb-2 w-full text-center opacity-80 leading-none">{key}</span>
                        <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
                          <span 
                            className="text-lg leading-none whitespace-nowrap"
                            style={{ 
                              fontFamily: s.fontFamily, 
                              color: s.color, 
                              backgroundColor: s.backgroundColor !== 'transparent' ? s.backgroundColor : 'transparent',
                              padding: s.backgroundColor !== 'transparent' ? '2px 4px' : '0',
                              borderRadius: s.backgroundColor !== 'transparent' ? '2px' : '0',
                              fontWeight: s.bold ? 'bold' : 'normal',
                              textTransform: s.uppercase ? 'uppercase' : 'none'
                             }}
                          >
                            Aa
                          </span>
                        </div>
                      </div>
                    ))}
                    {Object.entries(userPresets).map(([key, preset]) => {
                      const s = preset as CaptionStyle;
                      return (
                      <div 
                        role="button"
                        tabIndex={0}
                        key={key}
                        onClick={() => setStyle(s)}
                        onKeyDown={(e) => e.key === 'Enter' && setStyle(s)}
                        className={cn(
                          "aspect-[2/1] rounded-2xl border-2 transition-all flex flex-col items-center justify-center p-2 relative group cursor-pointer",
                          JSON.stringify(style) === JSON.stringify(s) 
                            ? "border-orange-500 bg-transparent text-orange-500" 
                            : "border-orange-500/30 bg-transparent text-orange-500/70 hover:border-orange-500"
                        )}
                      >
                        <span className="capitalize text-[10px] mb-2 w-full text-center opacity-80 leading-none">{key}</span>
                        <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
                          <span 
                            className="text-lg leading-none whitespace-nowrap"
                            style={{ 
                              fontFamily: s.fontFamily, 
                              color: s.color, 
                              backgroundColor: s.backgroundColor !== 'transparent' ? s.backgroundColor : 'transparent',
                              padding: s.backgroundColor !== 'transparent' ? '2px 4px' : '0',
                              borderRadius: s.backgroundColor !== 'transparent' ? '2px' : '0',
                              fontWeight: s.bold ? 'bold' : 'normal',
                              textTransform: s.uppercase ? 'uppercase' : 'none'
                             }}
                          >
                            Aa
                          </span>
                        </div>
                        <div className="absolute top-1 right-1 flex flex-col gap-1">
                          <div 
                            role="button"
                            className="bg-neutral-800 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity transition-transform hover:scale-110 z-10 cursor-pointer"
                            onClick={(e) => handleRenamePreset(key, e)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </div>
                        </div>
                        <div 
                          role="button"
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity transition-transform hover:scale-110 z-10 cursor-pointer"
                          onClick={(e) => handleDeletePreset(key, e)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </div>
                      </div>
                    )})}
                  </div>
                </div>

                {/* Customization */}
                <div className="px-6 py-4 space-y-6">
                  <div className="space-y-4">
                    <span className="text-xs font-medium text-white/40 uppercase tracking-widest block">Text Settings</span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-white/40">Font Size</label>
                        <input 
                          type="number" 
                          value={style.fontSize} 
                          onChange={(e) => setStyle({...style, fontSize: parseInt(e.target.value)})}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-white/40 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-white/40">Uppercase</label>
                        <button 
                          onClick={() => setStyle({...style, uppercase: !style.uppercase})}
                          className={cn(
                            "w-full px-3 py-2 rounded-lg text-sm transition-colors border",
                            style.uppercase ? "bg-orange-500 text-white border-orange-500" : "bg-transparent border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
                          )}
                        >
                          Aa
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-white/40">Display Mode</label>
                        <div className="flex gap-1 p-1 bg-transparent rounded-lg border border-orange-500 h-[38px]">
                          {(['sentence', 'word'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => setStyle({...style, displayMode: mode})}
                              className={cn(
                                "flex-1 flex items-center justify-center rounded-md text-[10px] uppercase tracking-wider transition-all h-full",
                                style.displayMode === mode ? "bg-orange-500 text-white" : "bg-transparent text-orange-500 hover:bg-orange-500 hover:text-white"
                              )}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-white/40">Font Family</label>
                        <select 
                          value={style.fontFamily}
                          onChange={(e) => setStyle({...style, fontFamily: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-white/40 outline-none"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value} className="bg-neutral-900 text-white">
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-white/40 flex items-center justify-between">
                        Highlight Color
                        <button 
                          onClick={async () => {
                            try {
                              // @ts-ignore
                              const eyeDropper = new EyeDropper();
                              const result = await eyeDropper.open();
                              setStyle({...style, highlightColor: result.sRGBHex});
                            } catch (e) {
                              console.log("Eyedropper cancelled");
                            }
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          title="Pick from video"
                        >
                          <Pipette className="w-3 h-3" />
                        </button>
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 flex-wrap flex-1">
                          {['', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff8800', '#00ff88'].map(color => (
                            <button
                              key={color}
                              onClick={() => setStyle({...style, highlightColor: color})}
                              className={cn(
                                "w-6 h-6 rounded-full border border-white/20 transition-transform hover:scale-110 shrink-0",
                                style.highlightColor === color && "ring-2 ring-white ring-offset-2 ring-offset-black",
                                color === '' ? "bg-neutral-800 flex items-center justify-center text-[10px]" : ""
                              )}
                              style={color ? { backgroundColor: color } : {}}
                            >
                              {color === '' && '×'}
                            </button>
                          ))}
                        </div>
                        <div className="relative w-6 h-6 rounded-full overflow-hidden border border-white/20 shrink-0">
                          <input 
                            type="color" 
                            value={style.highlightColor || '#ffffff'} 
                            onChange={(e) => setStyle({...style, highlightColor: e.target.value})}
                            className="absolute inset-[-50%] w-[200%] h-[200%] cursor-pointer p-0 border-none"
                          />
                          <Palette className="absolute inset-0 m-auto w-3 h-3 pointer-events-none mix-blend-difference" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-white/40 flex items-center justify-between">
                        Background Color
                        <button 
                          onClick={async () => {
                            try {
                              // @ts-ignore
                              const eyeDropper = new EyeDropper();
                              const result = await eyeDropper.open();
                              setStyle({...style, backgroundColor: result.sRGBHex});
                            } catch (e) {
                              console.log("Eyedropper cancelled");
                            }
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <Pipette className="w-3 h-3" />
                        </button>
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 flex-wrap flex-1">
                          {['transparent', '#000000', 'rgba(0,0,0,0.5)', '#ffffff', '#ff0000'].map(color => (
                            <button
                              key={color}
                              onClick={() => setStyle({...style, backgroundColor: color})}
                              className={cn(
                                "w-6 h-6 rounded-full border border-white/20 transition-transform hover:scale-110 shrink-0",
                                style.backgroundColor === color && "ring-2 ring-white ring-offset-2 ring-offset-black",
                                color === 'transparent' ? "bg-neutral-800 flex items-center justify-center text-[10px]" : ""
                              )}
                              style={color !== 'transparent' ? { backgroundColor: color } : {}}
                            >
                              {color === 'transparent' && '×'}
                            </button>
                          ))}
                        </div>
                        <div className="relative w-6 h-6 rounded-full overflow-hidden border border-white/20 shrink-0">
                          <input 
                            type="color" 
                            value={style.backgroundColor.startsWith('#') ? style.backgroundColor : '#000000'} 
                            onChange={(e) => setStyle({...style, backgroundColor: e.target.value})}
                            className="absolute inset-[-50%] w-[200%] h-[200%] cursor-pointer p-0 border-none"
                          />
                          <Palette className="absolute inset-0 m-auto w-3 h-3 pointer-events-none mix-blend-difference" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-white/40">Corner Radius</label>
                        <span className="text-xs font-mono text-white/60">{style.borderRadius || 0}px</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="32"
                        step="2"
                        value={style.borderRadius || 0}
                        onChange={(e) => setStyle({...style, borderRadius: parseInt(e.target.value)})}
                        className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-orange-500 hover:h-1.5 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-white/40">Position</label>
                      <div className="flex gap-2">
                        {(['top', 'middle', 'bottom'] as const).map((pos) => (
                          <button 
                            key={pos}
                            onClick={() => setStyle({...style, position: pos})}
                            className={cn(
                              "flex-1 items-center justify-center py-2 rounded-lg border text-xs capitalize transition-all",
                              style.position === pos ? "bg-orange-500 text-white border-orange-500" : "bg-transparent border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
                            )}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-3 cursor-pointer group mb-4">
                        <div 
                          onClick={() => setHideNonSpeech(!hideNonSpeech)}
                          className={cn(
                            "w-10 h-5 rounded-full relative transition-colors duration-200 border border-white/10",
                            hideNonSpeech ? "bg-orange-500" : "bg-white/5"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 bottom-0.5 w-4 rounded-full transition-all duration-200",
                            hideNonSpeech ? "left-[22px] bg-black" : "left-0.5 bg-white"
                          )} />
                        </div>
                        <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                          Hide non-speech labels (e.g. music)
                        </span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div 
                          onClick={() => setRemovePunctuation(!removePunctuation)}
                          className={cn(
                            "w-10 h-5 rounded-full relative transition-colors duration-200 border border-white/10",
                            removePunctuation ? "bg-orange-500" : "bg-white/5"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 bottom-0.5 w-4 rounded-full transition-all duration-200",
                            removePunctuation ? "left-[22px] bg-black" : "left-0.5 bg-white"
                          )} />
                        </div>
                        <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                          Remove ending punctuation
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Captions List */}
                  <div className="space-y-4 pb-12">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white/40 uppercase tracking-widest">Transcript</span>
                      <button 
                        onClick={() => {
                          const newCaption: Caption = {
                            id: Math.random().toString(),
                            start: currentTime,
                            end: currentTime + 2,
                            text: "New caption"
                          };
                          setCaptions([...captions, newCaption].sort((a, b) => a.start - b.start));
                        }}
                        className="p-1 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-full transition-colors flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {captions.map((caption, idx) => (
                        <div 
                          key={caption.id}
                          className={cn(
                            "p-3 rounded-xl border transition-all group",
                            currentTime >= caption.start && currentTime <= caption.end 
                              ? "bg-orange-500/10 border-orange-500/40" 
                              : "bg-neutral-900 border-white/5"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-white/40">
                              {caption.start.toFixed(1)}s — {caption.end.toFixed(1)}s
                            </span>
                            <button 
                              onClick={() => setCaptions(captions.filter(c => c.id !== caption.id))}
                              className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-400/10 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <textarea 
                            value={caption.text}
                            onChange={(e) => {
                              const newCaptions = [...captions];
                              const updatedText = e.target.value;
                              newCaptions[idx].text = updatedText;
                              
                              // Redistribute words timing
                              const duration = newCaptions[idx].end - newCaptions[idx].start;
                              const words = updatedText.split(/\s+/).filter(w => w.length > 0);
                              const wordDuration = duration / words.length;
                              
                              newCaptions[idx].words = words.map((w, i) => ({
                                text: w,
                                start: newCaptions[idx].start + (i * wordDuration),
                                end: newCaptions[idx].start + ((i + 1) * wordDuration)
                              }));

                              setCaptions(newCaptions);
                            }}
                            className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 resize-none h-12 outline-none"
                            placeholder="Caption text..."
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {!isEditor && (
          <footer className="border-t border-brand-orange/20 py-8 px-8 mt-auto box-border">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-brand-white/55">
              <div>
                &copy; {new Date().getFullYear()} Lefty Studios, LLC. All rights reserved.
              </div>
              <div className="flex items-center gap-6">
                <button onClick={() => setActivePage('about')} className="hover:text-brand-orange transition">About</button>
                <button onClick={() => setActivePage('privacy')} className="hover:text-brand-orange transition">Privacy Policy</button>
                <button onClick={() => setActivePage('terms')} className="hover:text-brand-orange transition">Terms of Service</button>
              </div>
            </div>
          </footer>
        )}

      {/* Preset Modal Overlay */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative">
            <h3 className="font-display text-xl mb-4 text-white">
              {modalState.type === 'save' && 'Save Preset'}
              {modalState.type === 'rename' && 'Rename Preset'}
              {modalState.type === 'delete' && 'Delete Preset'}
            </h3>
            
            {modalState.type === 'delete' ? (
              <p className="text-sm text-white/60 mb-6">
                Are you sure you want to delete preset "{modalState.targetKey}"?
              </p>
            ) : (
              <div className="mb-6">
                <input
                  type="text"
                  autoFocus
                  value={modalState.inputValue || ''}
                  onChange={(e) => setModalState({ ...modalState, inputValue: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      modalState.type === 'save' ? confirmSavePreset() : confirmRenamePreset();
                    }
                  }}
                  placeholder="Preset name..."
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 outline-none"
                />
              </div>
            )}
            
            <div className="flex justify-end gap-3 mt-2 text-sm font-medium">
              <button 
                onClick={() => setModalState({ isOpen: false, type: 'save' })}
                className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (modalState.type === 'save') confirmSavePreset();
                  if (modalState.type === 'rename') confirmRenamePreset();
                  if (modalState.type === 'delete') confirmDeletePreset();
                }}
                className={cn(
                  "px-5 py-2 rounded-lg transition-colors border",
                  modalState.type === 'delete' 
                    ? "bg-transparent border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                    : "bg-transparent border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
                )}
              >
                {modalState.type === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Exporting Overlay */}
      {status === 'exporting' && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[120] backdrop-blur-md p-4">
          <div className="relative mb-6">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="w-32 h-32 rounded-full border-t-2 border-orange-500"
            />
          </div>
          <h2 className="text-3xl font-display font-medium text-white mb-4">Rendering Video... {Math.round(progress)}%</h2>
          <p className="text-white/60 text-center max-w-md leading-relaxed">
            Please keep this tab open and active. 
            Browsers automatically pause background processes to save resources, 
            so minimizing the window or switching tabs will stop the rendering.
          </p>
        </div>
      )}
    </div>
  </div>
  );
}

