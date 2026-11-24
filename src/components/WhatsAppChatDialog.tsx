import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  MessageCircle, Send, Check, CheckCheck, Clock, ExternalLink, 
  RotateCw, Sparkles, Shield, User, Bot, FileText, Scale, Paperclip, AlertCircle
} from 'lucide-react';
import { WhatsAppMediaBubble } from '@/components/WhatsAppMediaBubble';
import { WhatsAppTemplateModal } from '@/components/WhatsAppTemplateModal';
import { WhatsAppMediaSendModal } from '@/components/WhatsAppMediaSendModal';
import { useCRM } from '@/contexts/CRMContext';
import { maskPhoneNumber } from '@/lib/smartflo';
import { 
  WhatsAppMessage, 
  fetchWhatsAppMessages, 
  sendWhatsAppMessageApi, 
  markWhatsAppMessageReadApi,
  QUICK_LEGAL_TEMPLATES 
} from '@/lib/kapso';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface WhatsAppChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  rawPhoneNumber: string;
  leadId?: string;
  ticketId?: string;
  serviceTitle?: string;
  initialMessage?: string;
}

export const WhatsAppChatDialog: React.FC<WhatsAppChatDialogProps> = ({
  open,
  onOpenChange,
  clientName,
  rawPhoneNumber,
  leadId,
  ticketId,
  serviceTitle,
  initialMessage,
}) => {
  const { currentUser, currentRole, addActivityLog } = useCRM();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showPreApprovedModal, setShowPreApprovedModal] = useState(false);
  const [showMediaSendModal, setShowMediaSendModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = currentRole === 'super_admin';
  const maskedPhone = maskPhoneNumber(rawPhoneNumber, isSuperAdmin);

  // Load message history from MySQL / Kapso Cloud
  const loadHistory = async (quiet: boolean = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const history = await fetchWhatsAppMessages(leadId, ticketId, rawPhoneNumber);
      
      // Canonical deduplication by (kapso_message_id || id)
      const dedupMap = new Map<string, WhatsAppMessage>();
      for (const m of history) {
        const k = m.kapso_message_id || m.id;
        if (!dedupMap.has(k)) {
          dedupMap.set(k, m);
        } else {
          const prev = dedupMap.get(k)!;
          dedupMap.set(k, {
            ...prev,
            ...m,
            sender_name: m.direction === 'outbound' ? (prev.sender_name && prev.sender_name !== clientName ? prev.sender_name : m.sender_name) : m.sender_name,
            status: m.status === 'read' ? 'read' : (prev.status === 'read' ? 'read' : (m.status || prev.status)),
          });
        }
      }
      const dedupedList = Array.from(dedupMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setMessages(dedupedList);

      // Automatically mark unread incoming messages as read in Meta
      for (const msg of dedupedList) {
        if (msg.direction === 'inbound' && msg.kapso_message_id) {
          markWhatsAppMessageReadApi(msg.kapso_message_id);
        }
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (initialMessage) {
        setInputText(initialMessage);
      }
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
        setMessages(prev => {
          const newKey = response.message.kapso_message_id || response.message.id;
          const filtered = prev.filter(m => (m.kapso_message_id || m.id) !== newKey);
          return [...filtered, response.message];
        });
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
        toast.error(response.error || 'Failed to send message over WhatsApp', { duration: 6000 });
      }
    } catch (err: any) {
      toast.error('Error sending message: ' + (err.message || 'Network error'), { duration: 6000 });
    } finally {
      setIsSending(false);
    }
  };

  const handleApplyTemplate = (getContent: (name: string, service?: string) => string) => {
    const populated = getContent(clientName, serviceTitle);
    setInputText(populated);
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
                {/* Receipts Legend Bar */}
                <div className="flex items-center gap-1.5 text-[9px] text-emerald-100 bg-white/10 px-2 py-0.5 rounded-full w-fit mt-1 border border-white/15">
                  <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Sent</span>
                  <span>•</span>
                  <span className="flex items-center gap-0.5"><CheckCheck className="w-2.5 h-2.5 text-emerald-200" /> Delivered</span>
                  <span>•</span>
                  <span className="flex items-center gap-0.5 text-cyan-300 font-semibold"><CheckCheck className="w-2.5 h-2.5 text-cyan-300" /> Read</span>
                </div>
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
                title="Open in Full WhatsApp Inbox"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/inbox?phone=${rawPhoneNumber}`);
                }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
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
                        {(msg.sender_name && msg.sender_name !== clientName && msg.sender_name !== 'Staff') 
                          ? msg.sender_name 
                          : (currentUser?.name || 'Vakil Staff')}
                      </p>
                    )}

                    {/* Media Attachment Render (Image, PDF, Audio, Video) */}
                    <WhatsAppMediaBubble message={msg} isOutbound={isOutbound} />

                    {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

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
                        <span
                          className="inline-flex items-center gap-1 ml-1 cursor-default"
                          title={
                            msg.status === 'read'
                              ? `Read by client${msg.read_at ? ' at ' + format(new Date(msg.read_at), 'h:mm a') : ''}`
                              : msg.status === 'delivered'
                              ? `Delivered to device${msg.delivered_at ? ' at ' + format(new Date(msg.delivered_at), 'h:mm a') : ''}`
                              : msg.status === 'failed'
                              ? 'Message delivery failed'
                              : 'Sent to WhatsApp servers'
                          }
                        >
                          {msg.status === 'read' ? (
                            <>
                              <span className="text-[8px] font-semibold text-cyan-200">Read</span>
                              <CheckCheck className="w-3.5 h-3.5 text-cyan-300 inline drop-shadow-sm" />
                            </>
                          ) : msg.status === 'delivered' ? (
                            <>
                              <span className="text-[8px] font-medium text-emerald-200">Delivered</span>
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-200 inline" />
                            </>
                          ) : msg.status === 'failed' ? (
                            <>
                              <span className="text-[8px] font-medium text-red-300">Failed</span>
                              <AlertCircle className="w-3.5 h-3.5 text-red-300 inline" />
                            </>
                          ) : (
                            <>
                              <span className="text-[8px] text-emerald-200">Sent</span>
                              <Check className="w-3.5 h-3.5 text-emerald-200 inline" />
                            </>
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
            className="flex items-center gap-1.5"
          >
            {/* Attach Media Button */}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setShowMediaSendModal(true)}
              className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
              title="Send Document, Photo, Audio, or Video"
            >
              <Paperclip className="w-4 h-4" />
            </Button>

            {/* Pre-Approved Meta WhatsApp Template Button */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPreApprovedModal(true)}
              className="h-10 px-2 rounded-xl text-xs gap-1 shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 font-semibold"
              title="Send Official Pre-Approved Meta Template"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Meta Template</span>
            </Button>

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

      {/* Official Pre-Approved Meta WhatsApp Template Modal */}
      {showPreApprovedModal && (
        <WhatsAppTemplateModal
          open={showPreApprovedModal}
          onOpenChange={setShowPreApprovedModal}
          recipientPhone={rawPhoneNumber}
          clientName={clientName}
          serviceTitle={serviceTitle}
          leadId={leadId}
          ticketId={ticketId}
          senderId={currentUser?.id}
          senderName={currentUser?.name}
          onTemplateSent={(newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            loadHistory(true);
          }}
        />
      )}

      {/* WhatsApp Media & Documents Send Modal */}
      {showMediaSendModal && (
        <WhatsAppMediaSendModal
          open={showMediaSendModal}
          onOpenChange={setShowMediaSendModal}
          recipientPhone={rawPhoneNumber}
          clientName={clientName}
          leadId={leadId}
          ticketId={ticketId}
          senderId={currentUser?.id}
          senderName={currentUser?.name}
          onMediaSent={(newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            loadHistory(true);
          }}
        />
      )}
    </Dialog>
  );
};
