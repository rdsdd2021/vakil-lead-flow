import React, { useState } from 'react';
import { WhatsAppMessage } from '@/lib/kapso';
import { 
  FileText, Download, ExternalLink, Play, Pause, 
  Volume2, Eye, Image as ImageIcon, Video, Music 
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WhatsAppMediaBubbleProps {
  message: WhatsAppMessage;
  isOutbound: boolean;
}

export const WhatsAppMediaBubble: React.FC<WhatsAppMediaBubbleProps> = ({ message, isOutbound }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const { message_type, media_url, media_filename, content } = message;

  if (!media_url && message_type === 'text') {
    return null;
  }

  // 1. IMAGE RENDERING
  if (message_type === 'image' || (media_url && (media_url.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) || media_filename?.match(/\.(jpeg|jpg|png|webp|gif)$/i)))) {
    return (
      <div className="space-y-1.5 max-w-full">
        <div 
          onClick={() => media_url && window.open(media_url, '_blank')}
          className="relative group cursor-pointer overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5"
        >
          <img 
            src={media_url || ''} 
            alt={media_filename || 'WhatsApp Image'} 
            className="w-full max-h-64 object-cover rounded-xl transition-transform duration-200 group-hover:scale-102"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
            <Eye className="w-4 h-4" />
            <span>Click to View Full Size</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. DOCUMENT RENDERING (PDF, DOCX, etc.)
  if (message_type === 'document' || (media_url && (media_url.match(/\.(pdf|docx?|xlsx?|txt|csv)($|\?)/i) || media_filename?.match(/\.(pdf|docx?|xlsx?|txt|csv)$/i)))) {
    const isPdf = (media_filename || media_url || '').toLowerCase().includes('.pdf');
    const docName = media_filename || (media_url ? media_url.split('/').pop()?.split('?')[0] : 'Legal_Document.pdf');

    return (
      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
        isOutbound 
          ? 'bg-emerald-700/60 border-emerald-500/30 text-white' 
          : 'bg-muted/40 border-border text-foreground'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isPdf ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
          }`}>
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate leading-tight">{docName}</p>
            <p className="text-[10px] opacity-75 uppercase tracking-wider font-mono">
              {isPdf ? 'PDF Document' : 'Attachment'}
            </p>
          </div>
        </div>

        {media_url && (
          <a
            href={media_url}
            target="_blank"
            rel="noopener noreferrer"
            download={docName}
            className={`p-1.5 rounded-lg shrink-0 transition-colors ${
              isOutbound 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                : 'bg-primary/10 hover:bg-primary/20 text-primary'
            }`}
            title="Download / View Document"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  }

  // 3. AUDIO / VOICE NOTE RENDERING
  if (message_type === 'audio' || (media_url && (media_url.match(/\.(mp3|ogg|wav|m4a|aac)($|\?)/i) || media_filename?.match(/\.(mp3|ogg|wav|m4a|aac)$/i)))) {
    return (
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 min-w-[220px] ${
        isOutbound 
          ? 'bg-emerald-700/60 border-emerald-500/30 text-white' 
          : 'bg-muted/40 border-border text-foreground'
      }`}>
        <div className="flex items-center gap-2 text-xs font-medium">
          <Music className="w-3.5 h-3.5 text-emerald-300" />
          <span>Voice Note / Audio Clip</span>
        </div>
        {media_url && (
          <audio controls className="w-full h-8 max-w-full rounded-md mt-0.5">
            <source src={media_url} />
            Your browser does not support audio playback.
          </audio>
        )}
      </div>
    );
  }

  // 4. VIDEO RENDERING
  if (message_type === 'video' || (media_url && (media_url.match(/\.(mp4|webm|ogv|mov)($|\?)/i) || media_filename?.match(/\.(mp4|webm|ogv|mov)$/i)))) {
    return (
      <div className="space-y-1.5 max-w-full">
        {media_url && (
          <video 
            controls 
            className="w-full max-h-64 rounded-xl border border-black/10 dark:border-white/10 bg-black"
          >
            <source src={media_url} />
            Your browser does not support video playback.
          </video>
        )}
      </div>
    );
  }

  return null;
};
