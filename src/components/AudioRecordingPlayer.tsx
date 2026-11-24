import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Download, Loader2, RotateCcw, Volume2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPlayableAudioUrl } from '@/lib/smartflo';

interface AudioRecordingPlayerProps {
  recordingUrl: string;
  callDuration?: string;
  callId?: string;
  className?: string;
}

export const AudioRecordingPlayer: React.FC<AudioRecordingPlayerProps> = ({
  recordingUrl,
  callDuration,
  callId,
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => {
    if (callDuration) {
      const parts = callDuration.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      }
    }
    return 0;
  });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const arrayBufferRef = useRef<ArrayBuffer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const isWebAudioRef = useRef<boolean>(false);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const loadAudio = useCallback(async () => {
    if (!recordingUrl) return;
    setIsLoading(true);
    setLoadError(null);

    const targetUrl = formatPlayableAudioUrl(recordingUrl);

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Call recording not available or call was missed');
        }
        throw new Error(`Failed to load audio (${response.status})`);
      }

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength < 256) {
        throw new Error('No audio recorded (call was missed or unanswered)');
      }

      arrayBufferRef.current = buffer;
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const newBlobUrl = URL.createObjectURL(blob);
      setBlobUrl(newBlobUrl);

      // Try decoding with Web Audio Context to inspect exact length
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const testCtx = new AudioContextClass();
          const decoded = await testCtx.decodeAudioData(buffer.slice(0));
          if (decoded && decoded.duration > 0) {
            setDuration(decoded.duration);
          }
          await testCtx.close();
        }
      } catch (decodeErr) {
        // Fallback to callDuration or metadata
      }
    } catch (err: any) {
      console.warn('Audio pre-load error:', err);
      setLoadError(err.message || 'Unable to load recording');
    } finally {
      setIsLoading(false);
    }
  }, [recordingUrl]);

  useEffect(() => {
    loadAudio();
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, [loadAudio]);

  const togglePlay = async () => {
    if (loadError) return;

    if (!blobUrl && !arrayBufferRef.current) {
      await loadAudio();
    }

    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  const playAudio = async () => {
    try {
      if (audioRef.current && blobUrl && !isWebAudioRef.current) {
        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        await playViaWebAudio();
      }
    } catch (err) {
      console.warn('HTML5 play failed, falling back to Web Audio API:', err);
      await playViaWebAudio();
    }
  };

  const pauseAudio = () => {
    if (audioRef.current && !isWebAudioRef.current) {
      audioRef.current.pause();
    }
    if (sourceNodeRef.current && audioCtxRef.current) {
      try {
        sourceNodeRef.current.stop();
        pausedAtRef.current = audioCtxRef.current.currentTime - startedAtRef.current;
      } catch (e) {}
    }
    setIsPlaying(false);
  };

  const playViaWebAudio = async () => {
    if (!arrayBufferRef.current) return;
    try {
      isWebAudioRef.current = true;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBufferRef.current.slice(0));
      if (duration === 0) {
        setDuration(decodedBuffer.duration);
      }

      const source = audioCtxRef.current.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(audioCtxRef.current.destination);

      const offset = pausedAtRef.current % decodedBuffer.duration;
      source.start(0, offset);
      startedAtRef.current = audioCtxRef.current.currentTime - offset;
      sourceNodeRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        pausedAtRef.current = 0;
      };
    } catch (webAudioErr: any) {
      console.error('Web Audio error:', webAudioErr);
      setLoadError('Audio player failed. Please download the recording.');
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (audioRef.current && !isWebAudioRef.current) {
      audioRef.current.currentTime = target;
    } else if (isWebAudioRef.current && audioCtxRef.current) {
      pausedAtRef.current = target;
      if (isPlaying) {
        if (sourceNodeRef.current) {
          try { sourceNodeRef.current.stop(); } catch (e) {}
        }
        playViaWebAudio();
      }
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const activeUrl = blobUrl || formatPlayableAudioUrl(recordingUrl);
      const a = document.createElement('a');
      a.href = activeUrl;
      a.download = `smartflo-call-${callId || 'recording'}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(formatPlayableAudioUrl(recordingUrl), '_blank');
    }
  };

  return (
    <div className={`mt-2 p-2.5 bg-card/80 hover:bg-card border border-border/80 rounded-xl space-y-2 shadow-xs transition-colors ${className}`}>
      {/* Hidden HTML5 Audio Element */}
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
              setDuration(audioRef.current.duration);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onError={() => {
            isWebAudioRef.current = true;
          }}
          className="hidden"
        />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
        <span className="flex items-center gap-1.5 text-primary font-semibold">
          <Volume2 className="w-3.5 h-3.5 text-primary" />
          Call Recording {callDuration ? `(${callDuration})` : ''}
        </span>
        <div className="flex items-center gap-2.5">
          {recordingUrl.startsWith('http') && (
            <a
              href={recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
              title="Open raw Tata telecom recording link"
            >
              Raw Stream <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
            title="Download recording as MP3"
          >
            <Download className="w-3 h-3" /> Download MP3
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="flex items-center justify-between p-2 bg-destructive/10 text-destructive rounded-lg text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{loadError}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs rounded text-destructive hover:bg-destructive/20 gap-1 shrink-0"
            onClick={loadAudio}
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          {/* Big Play / Pause Button */}
          <Button
            type="button"
            size="icon"
            variant="default"
            onClick={togglePlay}
            disabled={isLoading}
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs shrink-0"
            title={isPlaying ? 'Pause' : 'Play call audio'}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </Button>

          {/* Scrubber & Time */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 10}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              disabled={duration === 0 && !blobUrl}
              className="w-full h-1.5 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{duration > 0 ? formatTime(duration) : (callDuration || '0:00')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
