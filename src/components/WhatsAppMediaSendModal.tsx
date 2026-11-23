import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Paperclip, Image as ImageIcon, FileText, Music, Video, 
  Send, UploadCloud, Link as LinkIcon, RotateCw, X, CheckCircle 
} from 'lucide-react';
import { sendWhatsAppMessageApi, uploadWhatsAppMediaApi } from '@/lib/kapso';
import { toast } from 'sonner';

interface WhatsAppMediaSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPhone: string;
  clientName: string;
  leadId?: string;
  ticketId?: string;
  senderId?: string;
  senderName?: string;
  onMediaSent?: (message: any) => void;
}

type MediaCategory = 'image' | 'document' | 'audio' | 'video';

export const WhatsAppMediaSendModal: React.FC<WhatsAppMediaSendModalProps> = ({
  open,
  onOpenChange,
  recipientPhone,
  clientName,
  leadId,
  ticketId,
  senderId,
  senderName,
  onMediaSent,
}) => {
  const [mediaCategory, setMediaCategory] = useState<MediaCategory>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sample quick legal templates / documents
  const sampleLegalAssets = [
    {
      title: 'Vakiltech Legal Notice Draft (PDF)',
      category: 'document' as MediaCategory,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      filename: 'Legal_Notice_Draft.pdf',
    },
    {
      title: 'Advocate Vakalatnama & Retainer Form',
      category: 'document' as MediaCategory,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      filename: 'Vakalatnama_Retainer.pdf',
    },
    {
      title: 'Vakiltech Verified Seal & Firm Letterhead',
      category: 'image' as MediaCategory,
      url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80',
      filename: 'firm_letterhead.jpg',
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setDirectMediaUrl('');

    // Determine category from mime type
    if (file.type.startsWith('image/')) setMediaCategory('image');
    else if (file.type.startsWith('audio/')) setMediaCategory('audio');
    else if (file.type.startsWith('video/')) setMediaCategory('video');
    else setMediaCategory('document');

    // Create local preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleSelectSample = (sample: typeof sampleLegalAssets[0]) => {
    setSelectedFile(null);
    setMediaCategory(sample.category);
    setDirectMediaUrl(sample.url);
    setPreviewUrl(sample.url);
    setCaption(`Sharing: ${sample.title}`);
  };

  const handleSend = async () => {
    if (!selectedFile && !directMediaUrl.trim()) {
      toast.error('Please select a file or provide a media URL');
      return;
    }

    setIsUploading(true);

    try {
      let finalMediaUrl = directMediaUrl.trim();
      let finalFilename = selectedFile?.name || directMediaUrl.split('/').pop()?.split('?')[0] || 'document.pdf';

      // If local file selected, upload to serverless storage
      if (selectedFile) {
        toast.info('Uploading media to Meta WhatsApp cloud gateway...');
        const uploadRes = await uploadWhatsAppMediaApi(selectedFile);
        if (!uploadRes.success || !uploadRes.media_url) {
          toast.error(uploadRes.error || 'Failed to upload media file');
          setIsUploading(false);
          return;
        }
        finalMediaUrl = uploadRes.media_url;
        finalFilename = uploadRes.filename || selectedFile.name;
      }

      // Dispatch via Kapso Meta Cloud API
      const sendRes = await sendWhatsAppMessageApi({
        leadId,
        ticketId,
        to: recipientPhone,
        mediaType: mediaCategory,
        mediaUrl: finalMediaUrl,
        filename: finalFilename,
        caption: caption.trim() || undefined,
        senderId,
        senderName,
      });

      if (sendRes.success) {
        toast.success(`WhatsApp ${mediaCategory} dispatched to ${clientName}!`);
        if (onMediaSent) onMediaSent(sendRes.message);
        onOpenChange(false);
      } else {
        toast.error(sendRes.error || 'Meta WhatsApp rejected the media dispatch');
      }
    } catch (err: any) {
      toast.error('Error sending media: ' + (err.message || 'Network error'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl p-5 bg-card border border-border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Paperclip className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Send WhatsApp Media & Documents
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Send PDFs, legal drafts, photos, audio clips, and notices via Meta Cloud API.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          
          {/* Media Type Tabs */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'image', label: 'Photo', icon: ImageIcon },
              { id: 'document', label: 'Document / PDF', icon: FileText },
              { id: 'audio', label: 'Audio / Voice', icon: Music },
              { id: 'video', label: 'Video', icon: Video },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMediaCategory(tab.id as MediaCategory);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                    mediaCategory === tab.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'bg-muted/30 border-border/70 text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] truncate max-w-full">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* File Picker & Upload Box */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-emerald-500/50 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept={
                mediaCategory === 'image' ? 'image/*' :
                mediaCategory === 'audio' ? 'audio/*' :
                mediaCategory === 'video' ? 'video/*' :
                '.pdf,.doc,.docx,.xlsx,.txt'
              }
              className="hidden"
            />
            <UploadCloud className="w-8 h-8 mx-auto text-emerald-500/80 mb-1" />
            <p className="text-xs font-semibold text-foreground">
              {selectedFile ? selectedFile.name : `Click to browse ${mediaCategory} from your computer`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Supports JPEG, PNG, PDF, Word, MP3, MP4 up to 10MB
            </p>
          </div>

          {/* Direct URL Input Fallback */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5" />
                Or Paste Public Media URL:
              </span>
            </label>
            <Input
              value={directMediaUrl}
              onChange={e => {
                setDirectMediaUrl(e.target.value);
                setSelectedFile(null);
                setPreviewUrl(e.target.value);
              }}
              placeholder="https://example.com/document.pdf or image link"
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Quick Legal Sample Library */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Legal Document Presets:
            </p>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {sampleLegalAssets.map(sample => (
                <button
                  key={sample.title}
                  onClick={() => handleSelectSample(sample)}
                  className="px-2.5 py-1.5 rounded-lg border border-border/80 text-[11px] bg-card hover:bg-emerald-500/10 hover:border-emerald-500/40 text-muted-foreground hover:text-foreground shrink-0 text-left transition-colors font-medium flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{sample.filename}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview Area */}
          {previewUrl && (
            <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                Ready to Send Preview:
              </p>
              {mediaCategory === 'image' && (
                <img src={previewUrl} alt="Preview" className="max-h-40 object-contain mx-auto rounded-lg" />
              )}
              {mediaCategory === 'document' && (
                <div className="flex items-center gap-2 p-2 bg-card rounded-lg border border-border text-xs">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span className="font-semibold truncate flex-1">
                    {selectedFile?.name || directMediaUrl.split('/').pop() || 'Legal_Document.pdf'}
                  </span>
                </div>
              )}
              {mediaCategory === 'audio' && (
                <audio controls src={previewUrl} className="w-full h-8" />
              )}
              {mediaCategory === 'video' && (
                <video controls src={previewUrl} className="max-h-40 mx-auto rounded-lg" />
              )}
            </div>
          )}

          {/* Caption Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Caption / Accompanying Message</label>
            <Input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Add an optional caption for the client..."
              className="h-8 text-xs"
            />
          </div>

        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isUploading || (!selectedFile && !directMediaUrl.trim())}
            className="h-9 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
          >
            {isUploading ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading & Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send via WhatsApp</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
