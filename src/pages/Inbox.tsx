import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCRM } from '@/contexts/CRMContext';
import { 
  WhatsAppMessage, 
  WhatsAppConversation,
  fetchWhatsAppMessages, 
  fetchWhatsAppConversations,
  sendWhatsAppMessageApi, 
  markWhatsAppMessageReadApi,
  QUICK_LEGAL_TEMPLATES 
} from '@/lib/kapso';
import { WhatsAppMediaBubble } from '@/components/WhatsAppMediaBubble';
import { WhatsAppTemplateModal } from '@/components/WhatsAppTemplateModal';
import { WhatsAppMediaSendModal } from '@/components/WhatsAppMediaSendModal';
import { maskPhoneNumber } from '@/lib/smartflo';
import { SmartfloCallDialog } from '@/components/SmartfloCallDialog';
import { SERVICE_LABELS, CRMUser, Lead, Ticket } from '@/types/crm';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, Send, Check, CheckCheck, Clock, Phone, 
  RotateCw, Sparkles, User, Shield, Search, Filter, 
  ArrowLeft, Paperclip, AlertCircle, FileText,
  UserCheck, ChevronDown, CheckCircle2, Bot, Scale, Hash, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';

type FilterTab = 'all' | 'my' | 'unread' | 'leads' | 'tickets';

export const Inbox: React.FC = () => {
  const { currentUser, currentRole, users, leads, tickets, addActivityLog } = useCRM();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(searchParams.get('phone') || null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>(currentRole === 'lawyer' ? 'my' : 'all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    currentRole === 'lawyer' ? currentUser.id : 'all'
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const [showPreApprovedModal, setShowPreApprovedModal] = useState(false);
  const [showMediaSendModal, setShowMediaSendModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSuperAdmin = currentRole === 'super_admin';

  // Helper to format timestamps WhatsApp-style
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM/yy');
  };

  // Helper to normalize phone number
  const cleanPhoneDigits = (phone?: string) => {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
  };

  // Find linked lead and ticket for a given phone
  const findLinkedEntities = (phone: string) => {
    const digits = cleanPhoneDigits(phone).slice(-10);
    const matchedLead = leads.find(l => cleanPhoneDigits(l.whatsapp_number).slice(-10) === digits);
    const matchedTicket = matchedLead
      ? tickets.find(t => t.client_id === matchedLead.id)
      : tickets.find(t => cleanPhoneDigits(t.client_id).slice(-10) === digits);

    return { matchedLead, matchedTicket };
  };

  // Load all WhatsApp conversations and sync with CRM leads/tickets
  const loadConversations = async (quiet = false) => {
    if (!quiet) setIsLoadingConversations(true);
    try {
      const serverConvs = await fetchWhatsAppConversations();

      // Build unified list combining Kapso conversations & CRM leads with WhatsApp numbers
      const map = new Map<string, WhatsAppConversation>();

      // 1. Ingest Kapso conversations
      for (const sc of serverConvs) {
        const phoneDigits = cleanPhoneDigits(sc.phone_number);
        const { matchedLead, matchedTicket } = findLinkedEntities(phoneDigits);

        const assignedId = matchedTicket?.lawyer_id || matchedLead?.assigned_lawyer_id || null;
        const assignedUser = users.find(u => u.id === assignedId);

        map.set(phoneDigits, {
          ...sc,
          contact_name: matchedLead?.name || sc.contact_name || 'Client',
          lead_id: matchedLead?.id,
          ticket_id: matchedTicket?.ticket_id,
          service_title: matchedTicket?.service_type 
            ? (SERVICE_LABELS[matchedTicket.service_type] || matchedTicket.service_type)
            : matchedLead?.service 
              ? (SERVICE_LABELS[matchedLead.service] || matchedLead.service)
              : undefined,
          assigned_agent_id: assignedId,
          assigned_agent_name: assignedUser?.name || matchedTicket?.lawyer_name || null,
        });
      }

      // 2. Ingest CRM leads who have a whatsapp_number so agent can chat with any client
      for (const lead of leads) {
        if (!lead.whatsapp_number) continue;
        const phoneDigits = cleanPhoneDigits(lead.whatsapp_number);
        if (!map.has(phoneDigits)) {
          const matchedTicket = tickets.find(t => t.client_id === lead.id);
          const assignedId = matchedTicket?.lawyer_id || lead.assigned_lawyer_id || null;
          const assignedUser = users.find(u => u.id === assignedId);

          // Check if local cache has recent messages for this lead
          const cachedRaw = localStorage.getItem(`wa_history_${lead.id}`) || localStorage.getItem(`wa_history_${phoneDigits}`);
          let lastMsg = 'No messages yet. Click to start WhatsApp.';
          let lastTs = lead.updated_at || lead.created_at;
          let msgCount = 0;

          if (cachedRaw) {
            try {
              const msgs: WhatsAppMessage[] = JSON.parse(cachedRaw);
              if (msgs.length > 0) {
                const latest = msgs[msgs.length - 1];
                lastMsg = latest.content;
                lastTs = latest.created_at;
                msgCount = msgs.length;
              }
            } catch (e) {}
          }

          map.set(phoneDigits, {
            id: `conv_${lead.id}`,
            phone_number: phoneDigits,
            contact_name: lead.name,
            last_message: lastMsg,
            last_message_timestamp: lastTs,
            last_message_type: 'text',
            messages_count: msgCount,
            status: 'active',
            lead_id: lead.id,
            ticket_id: matchedTicket?.ticket_id,
            service_title: matchedTicket?.service_type 
              ? (SERVICE_LABELS[matchedTicket.service_type] || matchedTicket.service_type)
              : (SERVICE_LABELS[lead.service] || lead.service),
            assigned_agent_id: assignedId,
            assigned_agent_name: assignedUser?.name || matchedTicket?.lawyer_name || null,
          });
        }
      }

      // Sort by newest activity first
      const sorted = Array.from(map.values()).sort((a, b) => {
        const timeA = new Date(a.last_message_timestamp || 0).getTime();
        const timeB = new Date(b.last_message_timestamp || 0).getTime();
        return timeB - timeA;
      });

      setConversations(sorted);

      // Auto-select first conversation if on desktop and none selected
      if (!selectedPhone && sorted.length > 0 && window.innerWidth >= 768) {
        setSelectedPhone(sorted[0].phone_number);
      }
    } catch (err) {
      console.warn('Failed to load conversations:', err);
    } finally {
      if (!quiet) setIsLoadingConversations(false);
    }
  };

  // Initial load and periodic refresh of conversations
  useEffect(() => {
    loadConversations();
    const timer = setInterval(() => {
      loadConversations(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [leads, tickets]);

  // Sync searchParams with selectedPhone if URL changes
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    if (phoneParam) {
      const clean = cleanPhoneDigits(phoneParam);
      if (clean && cleanPhoneDigits(selectedPhone || '').slice(-10) !== clean.slice(-10)) {
        setSelectedPhone(phoneParam);
      }
    }
  }, [searchParams]);

  // Active selected conversation
  const activeConversation = useMemo(() => {
    if (!selectedPhone) return null;
    const cleanSel = cleanPhoneDigits(selectedPhone);
    const last10 = cleanSel.slice(-10);

    const match = conversations.find(c => cleanPhoneDigits(c.phone_number).slice(-10) === last10);
    if (match) return match;

    // Fallback: If navigating directly to a phone number (e.g. /inbox?phone=...)
    // create an immediate conversation container so messages load and chat renders immediately
    const { matchedLead, matchedTicket } = findLinkedEntities(selectedPhone);
    const assignedId = matchedTicket?.lawyer_id || matchedLead?.assigned_lawyer_id || null;
    const assignedUser = users.find(u => u.id === assignedId);

    return {
      id: `conv_direct_${last10}`,
      phone_number: selectedPhone,
      contact_name: matchedLead?.name || 'Client',
      last_message: '',
      last_message_timestamp: new Date().toISOString(),
      last_message_type: 'text',
      messages_count: 0,
      status: 'active',
      lead_id: matchedLead?.id,
      ticket_id: matchedTicket?.ticket_id,
      service_title: matchedTicket?.service_type 
        ? (SERVICE_LABELS[matchedTicket.service_type] || matchedTicket.service_type)
        : matchedLead?.service 
          ? (SERVICE_LABELS[matchedLead.service] || matchedLead.service)
          : undefined,
      assigned_agent_id: assignedId,
      assigned_agent_name: assignedUser?.name || matchedTicket?.lawyer_name || null,
    } as WhatsAppConversation;
  }, [conversations, selectedPhone, leads, tickets, users]);

  // Load message history for selected conversation
  const loadActiveChatMessages = async (quiet = false) => {
    if (!selectedPhone) return;
    if (!quiet) setIsLoadingMessages(true);
    try {
      const history = await fetchWhatsAppMessages(
        activeConversation?.lead_id,
        activeConversation?.ticket_id,
        selectedPhone
      );

      // Deduplicate by kapso_message_id || id
      const dedupMap = new Map<string, WhatsAppMessage>();
      for (const m of history) {
        const key = m.kapso_message_id || m.id;
        if (!dedupMap.has(key)) {
          dedupMap.set(key, m);
        } else {
          const prev = dedupMap.get(key)!;
          dedupMap.set(key, {
            ...prev,
            ...m,
            sender_name: m.direction === 'outbound'
              ? (prev.sender_name && prev.sender_name !== activeConversation?.contact_name ? prev.sender_name : m.sender_name)
              : m.sender_name,
            status: m.status === 'read' ? 'read' : (prev.status === 'read' ? 'read' : (m.status || prev.status)),
          });
        }
      }

      const dedupedList = Array.from(dedupMap.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      setMessages(dedupedList);

      // Mark inbound messages as read
      for (const m of dedupedList) {
        if (m.direction === 'inbound' && m.kapso_message_id && m.status !== 'read') {
          markWhatsAppMessageReadApi(m.kapso_message_id);
        }
      }
    } catch (e) {
      console.warn('Failed to load messages:', e);
    } finally {
      if (!quiet) setIsLoadingMessages(false);
    }
  };

  // Load messages when selected conversation changes & poll every 4 seconds
  useEffect(() => {
    if (selectedPhone) {
      loadActiveChatMessages();
      const interval = setInterval(() => {
        loadActiveChatMessages(true);
      }, 4000);
      return () => clearInterval(interval);
    } else {
      setMessages([]);
    }
  }, [selectedPhone, activeConversation?.lead_id, activeConversation?.ticket_id]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedPhone]);

  // Send WhatsApp message handler
  const handleSendMessage = async (textToSend?: string, templateName?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text && !templateName) return;
    if (!selectedPhone) return;

    setIsSending(true);
    setInputText('');
    setShowTemplatesDropdown(false);

    try {
      const response = await sendWhatsAppMessageApi({
        leadId: activeConversation?.lead_id,
        ticketId: activeConversation?.ticket_id,
        to: selectedPhone,
        text,
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

        // Update conversation last message in list immediately
        setConversations(prev => prev.map(c => {
          if (cleanPhoneDigits(c.phone_number) === cleanPhoneDigits(selectedPhone)) {
            return {
              ...c,
              last_message: text || `Template: ${templateName}`,
              last_message_timestamp: new Date().toISOString(),
              messages_count: (c.messages_count || 0) + 1,
            };
          }
          return c;
        }));

        if (activeConversation?.lead_id) {
          addActivityLog(
            activeConversation.lead_id,
            'WhatsApp Message Sent',
            `Sent WhatsApp to client: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`
          );
        }

        toast.success(response.simulated ? 'WhatsApp sent (Sandbox mode)' : 'WhatsApp delivered via Kapso AI');
      } else {
        toast.error(response.error || 'Failed to dispatch WhatsApp message');
      }
    } catch (err: any) {
      toast.error('Network error: ' + (err.message || 'Check connection'));
    } finally {
      setIsSending(false);
    }
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.contact_name?.toLowerCase().includes(q);
        const matchesPhone = c.phone_number?.includes(q);
        const matchesService = c.service_title?.toLowerCase().includes(q);
        const matchesMsg = c.last_message?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesService && !matchesMsg) {
          return false;
        }
      }

      // 2. Agent Filter
      if (selectedAgentId !== 'all') {
        if (selectedAgentId === 'my') {
          // My chats: assigned to current user, or user is the lawyer
          const isMyLead = c.assigned_agent_id === currentUser.id;
          const isMyEmail = users.find(u => u.id === c.assigned_agent_id)?.email === currentUser.email;
          if (!isMyLead && !isMyEmail) return false;
        } else {
          // Explicit agent selected
          if (c.assigned_agent_id !== selectedAgentId) return false;
        }
      }

      // 3. Tab Filter
      if (filterTab === 'my') {
        const isMyLead = c.assigned_agent_id === currentUser.id;
        const isMyEmail = users.find(u => u.id === c.assigned_agent_id)?.email === currentUser.email;
        if (!isMyLead && !isMyEmail) return false;
      } else if (filterTab === 'unread') {
        if (!c.unread_count || c.unread_count === 0) return false;
      } else if (filterTab === 'leads') {
        if (!c.lead_id) return false;
      } else if (filterTab === 'tickets') {
        if (!c.ticket_id) return false;
      }

      return true;
    });
  }, [conversations, searchQuery, selectedAgentId, filterTab, currentUser, users]);

  // Pick unique avatar color based on name hash
  const getAvatarGradient = (name: string) => {
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-teal-600',
      'from-purple-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-rose-500 to-red-600',
      'from-cyan-500 to-blue-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <div className={`flex w-full bg-background overflow-hidden ${
      selectedPhone 
        ? 'h-[100dvh] md:h-[calc(100dvh-4rem)]' 
        : 'h-[calc(100dvh-4rem)]'
    }`}>
      
      {/* ──────────────────────────────────────────────────────────
          LEFT PANE: WhatsApp Web Conversation List
      ────────────────────────────────────────────────────────── */}
      <div className={`w-full md:w-[360px] lg:w-[410px] xl:w-[440px] flex flex-col border-r border-border bg-card/60 backdrop-blur-md shrink-0 h-full ${
        selectedPhone ? 'hidden md:flex' : 'flex'
      }`}>
        
        {/* Top Agent Bar */}
        <div className="p-3.5 border-b border-border bg-card/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {currentUser.name.charAt(0)}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-card rounded-full animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate leading-tight">{currentUser.name}</p>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 capitalize font-medium">
                  {currentRole.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Kapso WhatsApp Desk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
              title="Refresh messages"
              onClick={() => {
                loadConversations();
                loadActiveChatMessages();
                toast.success('Syncing live conversations from Meta Cloud API...');
              }}
            >
              <RotateCw className={`w-4 h-4 ${isLoadingConversations ? 'animate-spin text-emerald-500' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Agent Filter Selector (Super Admin & Front Desk view switching) */}
        {currentRole !== 'lawyer' && (
          <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              Agent View:
            </span>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="bg-card text-foreground border border-border rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">🌐 All Agents / Firm Chats</option>
              <option value="my">👤 My Assigned Clients</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search Input Bar */}
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start new chat..."
              className="pl-9 h-9 text-xs bg-muted/50 border-border/60 rounded-xl focus-visible:ring-1 focus-visible:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'my', label: 'My Chats' },
              { id: 'unread', label: 'Unread' },
              { id: 'leads', label: 'Leads' },
              { id: 'tickets', label: 'Tickets' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as FilterTab)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${
                  filterTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List Scrollable Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {isLoadingConversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <RotateCw className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs">Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
              <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-1" />
              <p className="text-sm font-medium">No chats found</p>
              <p className="text-xs text-muted-foreground/80 max-w-[220px]">
                {searchQuery ? 'Try matching another name or phone number' : 'No conversations assigned for this filter'}
              </p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = cleanPhoneDigits(conv.phone_number) === cleanPhoneDigits(selectedPhone || '');
              const maskedPhone = maskPhoneNumber(conv.phone_number, isSuperAdmin);
              const isAssignedToMe = conv.assigned_agent_id === currentUser.id;

              return (
                <div
                  key={conv.id || conv.phone_number}
                  onClick={() => {
                    setSelectedPhone(conv.phone_number);
                    setSearchParams({ phone: conv.phone_number });
                  }}
                  className={`p-3 cursor-pointer transition-colors relative flex items-start gap-3 hover:bg-accent/50 ${
                    isSelected ? 'bg-accent/90 border-l-4 border-l-emerald-500' : ''
                  }`}
                >
                  {/* Client Avatar */}
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${getAvatarGradient(conv.contact_name)} text-white font-bold flex items-center justify-center shrink-0 shadow-sm text-base`}>
                    {conv.contact_name.charAt(0).toUpperCase()}
                  </div>

                  {/* Conversation Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {conv.contact_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                        {formatTime(conv.last_message_timestamp)}
                      </span>
                    </div>

                    {/* Chips Bar: Service / Assigned Agent */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {conv.service_title && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-primary/10 text-primary font-medium rounded-md truncate max-w-[140px]">
                          {conv.service_title}
                        </span>
                      )}
                      {conv.assigned_agent_name && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-medium truncate max-w-[120px] ${
                          isAssignedToMe 
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          👤 {isAssignedToMe ? 'Assigned to You' : conv.assigned_agent_name.replace('Adv. ', '')}
                        </span>
                      )}
                      {!conv.assigned_agent_name && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md">
                          Unassigned
                        </span>
                      )}
                    </div>

                    {/* Last Message Snippet */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground truncate leading-normal">
                        {conv.last_message || 'Start messaging...'}
                      </p>
                      {conv.unread_count && conv.unread_count > 0 ? (
                        <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                          {conv.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────
          RIGHT PANE: Active WhatsApp Web Conversation Thread
      ────────────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col h-full bg-muted/15 relative ${
        selectedPhone ? 'flex' : 'hidden md:flex'
      }`}>
        {selectedPhone && activeConversation ? (
          <>
            {/* WhatsApp Web Chat Header */}
            <div className="h-16 px-4 border-b border-border bg-card/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 z-10 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden -ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedPhone(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>

                {/* Contact Avatar */}
                <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${getAvatarGradient(activeConversation.contact_name)} text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0`}>
                  {activeConversation.contact_name.charAt(0).toUpperCase()}
                </div>

                {/* Contact Info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {activeConversation.contact_name}
                    </h2>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                      Kapso Cloud API
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                    <span className="font-mono">{maskPhoneNumber(activeConversation.phone_number, isSuperAdmin)}</span>
                    {activeConversation.service_title && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-foreground/80">{activeConversation.service_title}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Tata Click-to-Call, View Lead/Ticket, Refresh */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Direct Tata Smartflo Call Button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 border-emerald-500/30 rounded-xl"
                  onClick={() => setShowCallDialog(true)}
                  title="Place direct Smartflo call"
                >
                  <Phone className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Call Client</span>
                </Button>

                {/* Quick Link to Lead or Ticket */}
                {activeConversation.lead_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                    onClick={() => navigate(`/lead/${activeConversation.lead_id}`)}
                    title="Open Lead File"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">File</span>
                  </Button>
                )}

                {/* Refresh Chat */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => loadActiveChatMessages()}
                  title="Reload messages"
                >
                  <RotateCw className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin text-emerald-500' : ''}`} />
                </Button>
              </div>
            </div>

            {/* WhatsApp Chat Canvas Background */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:16px_16px]">
              
              {/* WhatsApp Security Badge */}
              <div className="flex justify-center my-2">
                <div className="bg-card/80 border border-border/70 backdrop-blur-xs text-muted-foreground px-3 py-1 rounded-full text-[10px] flex items-center gap-1.5 shadow-2xs font-medium">
                  <Shield className="w-3 h-3 text-emerald-500" />
                  Messages and calls are end-to-end encrypted via Meta Cloud API.
                </div>
              </div>

              {/* Message List */}
              {isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  <RotateCw className="w-6 h-6 animate-spin text-emerald-500 mr-2" />
                  <span className="text-xs">Loading message thread...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-3 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No prior WhatsApp messages</p>
                    <p className="text-xs text-muted-foreground max-w-sm mt-0.5">
                      Send an official pre-approved Meta template or attach files/audio to start the consultation.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowPreApprovedModal(true)}
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Send Meta Template
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowMediaSendModal(true)}
                      className="gap-1.5 text-xs rounded-xl border-border bg-card hover:bg-muted font-medium"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Attach Media / Audio
                    </Button>
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isOutbound = msg.direction === 'outbound';
                  return (
                    <div
                      key={msg.kapso_message_id || msg.id || index}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] md:max-w-[60%] rounded-2xl p-3 shadow-xs relative text-xs leading-relaxed ${
                          isOutbound
                            ? 'bg-emerald-600 text-white rounded-tr-none'
                            : 'bg-card text-foreground border border-border/80 rounded-tl-none shadow-xs'
                        }`}
                      >
                        {/* Sender Label */}
                        <div className={`text-[10px] font-semibold mb-1 flex items-center justify-between gap-3 ${
                          isOutbound ? 'text-emerald-100' : 'text-primary'
                        }`}>
                          <span>{isOutbound ? (msg.sender_name || currentUser.name) : activeConversation.contact_name}</span>
                          {msg.message_type === 'template' && (
                            <span className="text-[9px] uppercase tracking-wider opacity-80 font-normal">
                              Template
                            </span>
                          )}
                        </div>

                        {/* Media Attachment Render (Image, PDF, Audio, Video) */}
                        <WhatsAppMediaBubble message={msg} isOutbound={isOutbound} />

                        {/* Content */}
                        {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                        {/* Message Footer: Timestamp & Read Status */}
                        <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                          isOutbound ? 'text-emerald-100/90' : 'text-muted-foreground'
                        }`}>
                          <span>{msg.created_at ? format(new Date(msg.created_at), 'h:mm a') : ''}</span>
                          
                          {/* Live WhatsApp Read & Delivery Status */}
                          {isOutbound && (
                            <span className="flex items-center">
                              {msg.status === 'read' ? (
                                <span className="flex items-center text-cyan-300 font-bold" title="Read by client">
                                  <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
                                </span>
                              ) : msg.status === 'delivered' ? (
                                <span className="flex items-center text-emerald-200" title="Delivered to phone">
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
                                </span>
                              ) : (
                                <span className="flex items-center text-emerald-200/80" title="Sent to server">
                                  <Check className="w-3 h-3 text-emerald-200/80" />
                                </span>
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

            {/* Quick Legal Templates Popover / Bar */}
            {showTemplatesDropdown && (
              <div className="absolute bottom-20 left-4 right-4 md:left-6 md:right-6 bg-card border border-border rounded-2xl shadow-2xl p-3 z-30 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                    Vakiltech Legal Quick Replies
                  </span>
                  <button
                    onClick={() => setShowTemplatesDropdown(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Close ✕
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {QUICK_LEGAL_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        const content = tpl.getContent(
                          activeConversation.contact_name,
                          activeConversation.service_title
                        );
                        setInputText(content);
                        setShowTemplatesDropdown(false);
                      }}
                      className="p-2.5 rounded-xl border border-border/80 text-left bg-muted/30 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {tpl.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                        {tpl.getContent(activeConversation.contact_name, activeConversation.service_title)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp Web Message Composer (Footer) */}
            <div className="p-3 border-t border-border bg-card/95 backdrop-blur-md flex items-center gap-2 shrink-0 z-20 shadow-xs">
              {/* Media Attachment Button (Images, Documents, Audio, Video) */}
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowMediaSendModal(true)}
                className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground border-border hover:bg-muted shrink-0"
                title="Send Media (Photo, Document/PDF, Voice Note, Video)"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              {/* Pre-Approved Meta WhatsApp Template Button */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowPreApprovedModal(true)}
                className="h-10 px-3 rounded-xl text-xs gap-1.5 shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25 font-semibold"
                title="Send Official Pre-Approved Meta Template"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Meta Template</span>
                <span className="sm:hidden">Template</span>
              </Button>

              {/* Quick Legal Replies Dropdown Toggle */}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowTemplatesDropdown(prev => !prev)}
                className={`h-10 px-2.5 rounded-xl text-xs gap-1.5 shrink-0 ${
                  showTemplatesDropdown ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Quick Legal Phrases"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Quick Replies</span>
              </Button>

              {/* Message Input Box */}
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type a WhatsApp message to client..."
                disabled={isSending}
                className="flex-1 h-10 text-xs bg-muted/40 border-border/70 rounded-xl focus-visible:ring-1 focus-visible:ring-emerald-500"
              />

              {/* Send Button */}
              <Button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isSending}
                size="icon"
                className="h-10 w-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-sm"
                title="Send Message"
              >
                {isSending ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </Button>
            </div>
          </>
        ) : (
          /* WhatsApp Web Empty State Hero Screen */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card/40">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-inner">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Vakil WhatsApp Desk</h2>
            <p className="text-xs text-muted-foreground max-w-md mt-1.5 leading-relaxed">
              Real-time client conversations, document requests, and legal notice updates powered by Kapso AI Meta Cloud API.
            </p>
            <div className="flex items-center gap-2 mt-4 text-[11px] text-muted-foreground/80 bg-muted/50 px-3.5 py-1.5 rounded-full border border-border/60">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>Official WhatsApp Business Integration • End-to-End Encrypted</span>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 max-w-sm w-full mt-6">
              <div className="p-3 bg-card border border-border/60 rounded-xl text-center">
                <p className="text-lg font-bold text-emerald-600">{conversations.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Active Chats</p>
              </div>
              <div className="p-3 bg-card border border-border/60 rounded-xl text-center">
                <p className="text-lg font-bold text-primary">
                  {conversations.filter(c => c.assigned_agent_id === currentUser.id).length}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium">My Clients</p>
              </div>
              <div className="p-3 bg-card border border-border/60 rounded-xl text-center">
                <p className="text-lg font-bold text-teal-600">
                  {conversations.reduce((acc, c) => acc + (c.messages_count || 0), 0)}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium">Messages</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Embedded Smartflo Call Dialog for Direct Telephony Bridge */}
      {activeConversation && showCallDialog && (
        <SmartfloCallDialog
          open={showCallDialog}
          onOpenChange={setShowCallDialog}
          leadId={activeConversation.lead_id || 'lead_direct'}
          leadName={activeConversation.contact_name}
          rawPhoneNumber={activeConversation.phone_number}
          serviceName={activeConversation.service_title}
        />
      )}

      {/* Official Pre-Approved Meta WhatsApp Template Modal */}
      {activeConversation && showPreApprovedModal && (
        <WhatsAppTemplateModal
          open={showPreApprovedModal}
          onOpenChange={setShowPreApprovedModal}
          recipientPhone={activeConversation.phone_number}
          clientName={activeConversation.contact_name}
          serviceTitle={activeConversation.service_title}
          leadId={activeConversation.lead_id}
          ticketId={activeConversation.ticket_id}
          senderId={currentUser.id}
          senderName={currentUser.name}
          onTemplateSent={(newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            loadConversations(true);
          }}
        />
      )}

      {/* WhatsApp Media & Documents Send Modal */}
      {activeConversation && showMediaSendModal && (
        <WhatsAppMediaSendModal
          open={showMediaSendModal}
          onOpenChange={setShowMediaSendModal}
          recipientPhone={activeConversation.phone_number}
          clientName={activeConversation.contact_name}
          leadId={activeConversation.lead_id}
          ticketId={activeConversation.ticket_id}
          senderId={currentUser.id}
          senderName={currentUser.name}
          onMediaSent={(newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            loadConversations(true);
          }}
        />
      )}

    </div>
  );
};

export default Inbox;
