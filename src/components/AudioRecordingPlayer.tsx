import React, { useState } from 'react';
import { Download, Volume2, ExternalLink } from 'lucide-react';
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
  const [useDirectFallback, setUseDirectFallback] = useState(false);

  const proxyUrl = formatPlayableAudioUrl(recordingUrl);
  const activeSrc = useDirectFallback ? recordingUrl : proxyUrl;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = proxyUrl || recordingUrl;
    a.download = `smartflo-call-${callId || 'recording'}.mp3`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className={`mt-2 p-2.5 bg-card/80 hover:bg-card border border-border/80 rounded-xl space-y-2 shadow-xs transition-colors ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
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

      {/* Native browser audio player using normalized /api/recording proxy with direct fallback */}
      <audio
        controls
        preload="metadata"
        src={activeSrc}
        onError={() => {
          if (!useDirectFallback && recordingUrl && activeSrc !== recordingUrl) {
            setUseDirectFallback(true);
          }
        }}
        className="w-full h-9 rounded-lg"
      >
        Your browser does not support audio playback.
      </audio>
    </div>
  );
};
