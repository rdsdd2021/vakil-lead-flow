import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  MessageCircle, Send, Check, CheckCheck, Clock, ExternalLink, 
  RotateCw, Sparkles, Shield, User, Bot, FileText, Scale, Paperclip
} from 'lucide-react';
import { useCRM } from '@/contexts/CRMContext';
import { maskPhoneNumber } from '@/lib/smartflo';
import { 
  WhatsAppMessage, 
  fetchWhatsAppMessages, 
  sendWhatsAppMessageApi, 
  QUICK_LEGAL_TEMPLATES 
} from '@/lib/kapso';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface WhatsAppChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  rawPhoneNumber: string;
  leadId?: string;
  ticketId?: string;
  serviceTitle?: string;
}

export const WhatsAppChatDialog: React.FC<WhatsAppChatDialogProps> = ({
  open,
  onOpenChange,
  clientName,
  rawPhoneNumber,
  leadId,
  ticketId,
  serviceTitle,
}) => {
  const { currentUser, currentRole, addActivityLog } = useCRM();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = currentRole === 'super_admin';
  const maskedPhone = maskPhoneNumber(rawPhoneNumber, isSuperAdmin);

  // Load message history from MySQL / Kapso
  const loadHistory = async (quiet: boolean = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const history = await fetchWhatsAppMessages(leadId, ticketId, rawPhoneNumber);
      setMessages(history);
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
      // Poll for incoming replies every 4 seconds while open
      const interval = setInterval(() => {
        loadHistory(true);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [open, leadId, ticketId, rawPhoneNumber]);

  // Auto-scroll to bottom on messages change
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSendMessage = async (textToSend?: string, templateName?: string) => {
    const finalContent = (textToSend || inputText).trim();
    if (!finalContent && !templateName) return;

    setIsSending(true);
    setInputText('');

    try {
      const response = await sendWhatsAppMessageApi({
        leadId,
        ticketId,
        to: rawPhoneNumber,
        text: finalContent,
        templateName,
        senderId: currentUser.id,
        senderName: currentUser.name,
      });

      if (response.success) {
        setMessages(prev => [...prev, response.message]);
        if (leadId) {
          addActivityLog(
            leadId,
            'WhatsApp Message Sent',
            `Sent WhatsApp to client: "${finalContent.slice(0, 80)}${finalContent.length > 80 ? '...' : ''}"`
          );
        }
        if (response.simulated) {
          toast.success('WhatsApp dispatched (Kapso Sandbox Mode)');
        } else {
          toast.success('WhatsApp delivered via Kapso AI Cloud API');
        }
      } else {
        toast.error('Failed to send message over WhatsApp');
      }
    } catch (err: any) {
      toast.error('Error sending message: ' + (err.message || 'Network error'));
    } finally {
      setIsSending(false);
    }
  };

  const handleApplyTemplate = (getContent: (name: string, service?: string) => string) => {
    const populated = getContent(clientName, serviceTitle);
    setInputText(populated);
  };

  const handleNativeWhatsAppFallback = () => {
    const cleanNumber = rawPhoneNumber.replace(/^\+/, '').replace(/\s/g, '');
    const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(inputText || `Hello ${clientName}, this is Vakiltech.`)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl gap-0 h-[85vh] max-h-[680px] flex flex-col bg-background border border-border shadow-2xl">
        
        {/* WhatsApp Header */}
        <DialogHeader className="p-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-base shadow-inner shrink-0">
                {clientName.charAt(0)}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-white text-sm font-semibold truncate flex items-center gap-2">
                  <span>{clientName}</span>
                  <Badge variant="outline" className="bg-emerald-500/30 text-white border-white/30 text-[10px] px-1.5 py-0 h-4">
                    Kapso WhatsApp
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-emerald-100 text-[11px] truncate flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono">{maskedPhone}</span>
                  {serviceTitle && <span>• {serviceTitle}</span>}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
                title="Refresh Conversation"
                onClick={() => loadHistory(false)}
                disabled={isLoading}
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
                title="Open in WhatsApp Web"
                onClick={handleNativeWhatsAppFallback}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Message Stream Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#efeae2]/30 dark:bg-muted/10">
          {isLoading && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 py-10">
              <RotateCw className="w-5 h-5 animate-spin text-emerald-600" />
              <span>Connecting to Kapso WhatsApp history...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2">
                <MessageCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">No WhatsApp Messages Yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Send a quick introduction or document checklist below to start communicating with {clientName} directly from the CRM.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isOutbound = msg.direction === 'outbound';
              return (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-sm relative leading-relaxed ${
                      isOutbound
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : 'bg-card text-foreground border border-border/70 rounded-bl-xs'
                    }`}
                  >
                    {!isOutbound && (
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">
                        {msg.sender_name || clientName}
                      </p>
                    )}
                    {isOutbound && (
                      <p className="text-[10px] font-medium text-emerald-200 mb-0.5">
                        {msg.sender_name || currentUser.name}
                      </p>
                    )}

                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                    <div
                      className={`flex items-center gap-1 mt-1 text-[9px] ${
                        isOutbound ? 'text-emerald-100 justify-end' : 'text-muted-foreground justify-start'
                      }`}
                    >
                      <span>
                        {msg.created_at
                          ? format(new Date(msg.created_at), 'h:mm a')
                          : 'Just now'}
                      </span>
                      {isOutbound && (
                        <span>
                          {msg.status === 'read' ? (
                            <CheckCheck className="w-3 h-3 text-cyan-300 inline" />
                          ) : msg.status === 'delivered' ? (
                            <CheckCheck className="w-3 h-3 text-emerald-200 inline" />
                          ) : (
                            <Check className="w-3 h-3 text-emerald-200 inline" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Legal Reply Templates Bar */}
        <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" /> Templates:
          </span>
          {QUICK_LEGAL_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handleApplyTemplate(tpl.getContent)}
              className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-background border border-border/80 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/40 text-foreground transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              {tpl.title}
            </button>
          ))}
        </div>

        {/* Message Composer Footer */}
        <div className="p-3 border-t bg-card shrink-0 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message ${clientName} on WhatsApp...`}
              disabled={isSending}
              className="rounded-xl h-10 text-xs flex-1 bg-background"
            />
            <Button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="rounded-xl h-10 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1.5"
            >
              {isSending ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span className="text-xs">Send</span>
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-emerald-600" /> End-to-end business messaging via Kapso AI
            </span>
            <span>Press Enter to send</span>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
};
