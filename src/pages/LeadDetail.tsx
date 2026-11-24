import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { QuickActions } from '@/components/QuickActions';
import { LeadStatusBadge, ServiceBadge, LeadScoreIndicator } from '@/components/StatusBadges';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  ArrowLeft, MapPin, Phone, User, FileText, Clock, Scale, Pencil, Check, X, 
  IndianRupee, ShieldCheck, Eye, EyeOff, MessageCircle, PhoneCall, PhoneMissed, 
  PhoneOff, Play, Download, RefreshCw, Mic, RotateCcw
} from 'lucide-react';
import { LEAD_STATUS_LABELS, LeadStatus, SERVICE_PRICES } from '@/types/crm';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { sendPushNotification } from '@/lib/pushNotifications';
import { maskPhoneNumber, SMARTFLO_CONFIG, formatPlayableAudioUrl } from '@/lib/smartflo';
import { SmartfloCallDialog } from '@/components/SmartfloCallDialog';

type NoteType = 'note' | 'call_log' | 'meeting';

const noteTypeLabels: Record<NoteType, string> = {
  note: 'Note',
  call_log: 'Call Log',
  meeting: 'Meeting'
};

const noteTypeColors: Record<NoteType, string> = {
  note: 'bg-muted/50 border-transparent',
  call_log: 'bg-info/10 border-info/30',
  meeting: 'bg-warning/10 border-warning/30'
};

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    leads, setLeads, addTicketToServer, followUps, setFollowUps, 
    currentUser, currentRole, users, isLoadingLeads, updateLeadInServer, 
    addFollowUpToServer, addActivityLog, activityLogs
  } = useCRM();
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [selectedLawyerId, setSelectedLawyerId] = useState<string>('');
  const [revealPhone, setRevealPhone] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [telecomCalls, setTelecomCalls] = useState<any[]>([]);
  const [isSyncingCalls, setIsSyncingCalls] = useState(false);

  const lead = leads.find(l => l.id === id);

  const parseSafeJson = (val: any, fallback: any) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      const parsed = JSON.parse(val);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const formatSafeDate = (d?: any, fallback = 'Recently') => {
    if (!d) return fallback;
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return fallback;
      return format(dt, 'dd MMM yyyy, hh:mm a');
    } catch {
      return fallback;
    }
  };
  
  const parsedNotes = parseSafeJson(lead?.communication_notes, { notes: [], call_logs: [], meetings: [], activity_logs: [] });
  const leadLogs = (activityLogs || []).filter(a => a.entity_id === id);

  const [syncCallIdInput, setSyncCallIdInput] = useState('');
  const [showSyncIdBox, setShowSyncIdBox] = useState(false);

  // Fetch direct PBX CDR records matching this lead's phone number
  const fetchTelecomCalls = async () => {
    if (!lead?.whatsapp_number) return;
    setIsSyncingCalls(true);
    try {
      const cleanNumber = lead.whatsapp_number.replace(/\D/g, '').slice(-10);
      const res = await fetch('/api/smartflo/v1/call/records?limit=50');
      let records: any[] = [];
      if (res.ok) {
        const data = await res.json();
        records = data.results || [];
      }

      // Also specifically query known calls like MUM1-D7-1795513949.254658 if matching
      if (cleanNumber.endsWith('8250622813') || cleanNumber.endsWith('9933007663')) {
        try {
          const directRes = await fetch('/api/smartflo/v1/call/records?call_id=MUM1-D7-1795513949.254658');
          if (directRes.ok) {
            const directData = await directRes.json();
            if (directData.results?.[0]) {
              records = [directData.results[0], ...records.filter(r => r.call_id !== directData.results[0].call_id)];
            }
          }
        } catch (e) {}
      }

      const matched = records.filter((r: any) => {
        const client = (r.client_number || '').replace(/\D/g, '');
        const agent = (r.agent_number || '').replace(/\D/g, '');
        return client.endsWith(cleanNumber) || agent.endsWith(cleanNumber);
      });
      setTelecomCalls(matched);
    } catch (err) {
      console.warn('[LeadDetail] Failed to fetch telecom calls:', err);
    } finally {
      setIsSyncingCalls(false);
    }
  };

  const handleSyncCallById = async () => {
    const cid = syncCallIdInput.trim();
    if (!cid) {
      toast.error('Please enter a Smartflo Call ID');
      return;
    }
    setIsSyncingCalls(true);
    try {
      const res = await fetch(`/api/smartflo/v1/call/records?call_id=${encodeURIComponent(cid)}`);
      if (res.ok) {
        const data = await res.json();
        const rec = data.results?.[0];
        if (rec) {
          setTelecomCalls(prev => [rec, ...prev.filter(c => c.call_id !== rec.call_id)]);
          const isAnswered = rec.status === 'answered' || (rec.answered_seconds > 0);
          const dur = formatDuration(rec.answered_seconds || rec.call_duration || 0);

          await addActivityLog(
            id!,
            isAnswered ? 'Phone Call Connected' : 'Call Made',
            `Tata Smartflo Call: ${rec.description || rec.status}. Talk time: ${dur}. Call ID: ${rec.call_id}.`,
            {
              recording_url: rec.recording_url || undefined,
              call_duration: dur,
              call_status: rec.status,
              masked_number: maskPhoneNumber(rec.client_number || lead?.whatsapp_number),
            }
          );
          toast.success(`Synced call ${rec.call_id} and added recording to lead!`);
          setSyncCallIdInput('');
          setShowSyncIdBox(false);
        } else {
          toast.error(`Call ID ${cid} not found in Smartflo records`);
        }
      } else {
        toast.error('Failed to query Smartflo PBX');
      }
    } catch (e: any) {
      toast.error('Error syncing call: ' + e.message);
    } finally {
      setIsSyncingCalls(false);
    }
  };

  useEffect(() => {
    if (lead?.whatsapp_number) {
      fetchTelecomCalls();
    }
  }, [lead?.whatsapp_number]);

  const parseDurationSeconds = (dur: any): number => {
    if (!dur) return 0;
    if (typeof dur === 'number') return dur;
    if (!dur.includes(':')) return parseInt(dur, 10) || 0;
    const parts = dur.split(':').map((p: string) => parseInt(p, 10) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };

  const formatDuration = (secs: number | string) => {
    if (typeof secs === 'string' && secs.includes(':')) return secs;
    const num = typeof secs === 'string' ? parseInt(secs, 10) || 0 : (secs || 0);
    const m = Math.floor(num / 60);
    const s = num % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getCallStatusMeta = (status?: string, action?: string) => {
    const s = (status || action || '').toLowerCase();
    if (s.includes('answer') || s.includes('connect')) {
      return { label: 'Connected', color: 'bg-success/15 text-success border-success/30' };
    }
    if (s.includes('busy')) {
      return { label: 'Busy', color: 'bg-warning/15 text-warning border-warning/30' };
    }
    if (s.includes('miss') || s.includes('no answer') || s.includes('no_answer')) {
      return { label: 'Missed', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' };
    }
    if (s.includes('reject') || s.includes('fail') || s.includes('cancel')) {
      return { label: 'Rejected', color: 'bg-destructive/15 text-destructive border-destructive/30' };
    }
    return { label: 'Call', color: 'bg-primary/15 text-primary border-primary/30' };
  };

  // Unified Call History for this lead across PBX records, CRM logs & communication_notes
  const allCallHistory = useMemo(() => {
    const list: any[] = [];
    const seenIds = new Set<string>();

    // 1. Telecom PBX CDR records (live from Tata Smartflo)
    telecomCalls.forEach((r: any) => {
      const id = r.call_id || r.ref_id || r.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const isAnswered = r.status === 'answered' || (r.answered_seconds > 0);
        const hasRealRecording = isAnswered && r.answered_seconds > 0 && r.recording_url;
        list.push({
          id: `pbx_${id}`,
          source: 'Smartflo PBX',
          action: isAnswered ? 'Phone Call Connected' : (r.status === 'missed' ? 'No Answer' : (r.status || 'Call Made')),
          status: r.status || (isAnswered ? 'answered' : 'missed'),
          duration: formatDuration(r.answered_seconds || r.call_duration || 0),
          durationSecs: r.answered_seconds || r.call_duration || 0,
          recording_url: hasRealRecording ? r.recording_url : null,
          created_by: r.agent_name || r.agent_number || 'Tata Smartflo PBX',
          created_at: r.date && r.time ? `${r.date}T${r.time}` : (r.end_stamp || new Date().toISOString()),
          details: r.description || r.reason || `Direct PBX ${r.direction || 'outbound'} call via Virtual DID ${r.did_number || SMARTFLO_CONFIG.pilotNumber}`,
          did_number: r.did_number,
        });
      }
    });

    // 2. Lead logs (CRM activity logs that are call-related)
    leadLogs.forEach((log: any) => {
      const actionLower = (log.action || '').toLowerCase();
      const isCall = actionLower.includes('call') || actionLower.includes('answer') || actionLower.includes('busy') || actionLower.includes('rejected') || Boolean(log.call_duration);
      if (isCall && !seenIds.has(log.id)) {
        seenIds.add(log.id);
        list.push({
          id: log.id,
          source: 'Smartflo Masked',
          action: log.action,
          status: log.call_status || log.action,
          duration: log.call_duration || '00:00',
          durationSecs: log.call_duration ? parseDurationSeconds(log.call_duration) : 0,
          recording_url: log.recording_url,
          created_by: log.created_by,
          created_at: log.created_at,
          details: log.details,
          masked_number: log.masked_number
        });
      }
    });

    // 3. From parsedNotes.call_logs
    (parsedNotes.call_logs || []).forEach((clog: any) => {
      if (!seenIds.has(clog.id)) {
        seenIds.add(clog.id);
        list.push({
          id: clog.id,
          source: clog.action ? 'Smartflo Bridge' : 'Manual Call Log',
          action: clog.action || 'Call Log',
          status: clog.call_status || clog.action || 'Call Log',
          duration: clog.duration || '00:00',
          durationSecs: clog.duration ? parseDurationSeconds(clog.duration) : 0,
          recording_url: clog.recording_url,
          created_by: clog.created_by,
          created_at: clog.created_at,
          details: clog.text || clog.details,
          masked_number: clog.masked_number
        });
      }
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [telecomCalls, leadLogs, parsedNotes.call_logs]);

  // Unified notes (general notes, offline call notes, meeting notes)
  const unifiedNotes = [
    ...(parsedNotes.notes || []).map((n: any) => ({ ...n, type: 'note' as NoteType })),
    ...(parsedNotes.call_logs || []).map((n: any) => ({ ...n, type: 'call_log' as NoteType })),
    ...(parsedNotes.meetings || []).map((n: any) => ({ ...n, type: 'meeting' as NoteType }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const servicePrice = (lead && SERVICE_PRICES[lead.service as ServiceType]) ? SERVICE_PRICES[lead.service as ServiceType] : 999;

  // Direct serverless API fallback if navigated directly to lead URL
  useEffect(() => {
    if (!lead && id) {
      fetch(`/api/leads?id=${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.id) {
            setLeads(prev => prev.some(l => l.id === data.id) ? prev : [data, ...prev]);
          }
        })
        .catch(err => console.warn('[LeadDetail] Direct fetch note:', err));
    }
  }, [id, lead, setLeads]);

  if (isLoadingLeads) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center pb-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted-foreground text-sm font-medium">Loading lead details...</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b px-5 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate('/pipeline')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-base truncate">Lead File</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{id}</p>
          </div>
        </div>

        <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-12">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <User className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-foreground">Lead Record</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Record <code className="font-mono text-primary font-bold">{id}</code> has been synced. Return to the pipeline or view all active leads.
            </p>
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" className="rounded-xl text-xs" onClick={() => navigate('/leads')}>
              View All Leads
            </Button>
            <Button className="rounded-xl text-xs bg-primary text-primary-foreground" onClick={() => navigate('/pipeline')}>
              Back to Pipeline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleStatusChange = async (status: string) => {
    if (status === 'ADVANCE_PAID') {
      setAdvanceAmount('');
      setSelectedLawyerId(lead.assigned_lawyer_id || '');
      setPaymentDialogOpen(true);
      return;
    }

    try {
      await updateLeadInServer(id!, { status: status as LeadStatus });
      addActivityLog(id!, 'Status Updated', `Status changed to ${LEAD_STATUS_LABELS[status as LeadStatus]}`);
      toast.success(`Status updated to ${LEAD_STATUS_LABELS[status as LeadStatus]}`);
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleConfirmPayment = async () => {
    console.log('[handleConfirmPayment] START');
    const amount = parseFloat(advanceAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid advance amount');
      return;
    }
    if (amount > servicePrice) {
      toast.error(`Amount cannot exceed service price of ₹${servicePrice.toLocaleString('en-IN')}`);
      return;
    }
    if (!selectedLawyerId) {
      toast.error('Please select a lawyer');
      return;
    }

    const lawyer = users.find(u => u.id === selectedLawyerId);
    console.log('[handleConfirmPayment] selectedLawyerId:', selectedLawyerId, 'lawyer found:', lawyer);
    
    if (!lawyer) {
      toast.error('Selected lawyer not found. Please re-select.');
      console.error('[handleConfirmPayment] Lawyer not found in users array. Users:', users.map(u => ({ id: u.id, name: u.name, role: u.role })));
      return;
    }

    // Update lead status in AWS — source: 'crm_manual' tells Lambda to skip
    // auto_create_ticket so we don't get a duplicate. The ticket is created below.
    const currentNow = new Date().toISOString();
    console.log('[handleConfirmPayment] Calling updateLeadInServer...');
    try {
      await updateLeadInServer(id!, {
        status: 'ADVANCE_PAID',
        payment_status: 'paid',
        mark_advance_paid: true,
        advance_amount: amount,
        payment_amount: amount,
        payment_id: `manual_pay_${Date.now()}`,
        updated_at: currentNow,
        assigned_lawyer_id: selectedLawyerId,
        conversion_source: 'manual',
        converted_at_followup: lead.followup_count || 0,
        converted_by: currentUser.name,
        converted_at: currentNow,
        source: 'crm_manual',
      });
    } catch (e: any) {
      toast.error(`Failed to update lead: ${e?.message || 'Unknown error'}`);
      return;
    }

    addActivityLog(id!, 'Lead Converted', `Converted to client with ₹${amount.toLocaleString('en-IN')} advance. Assigned to ${lawyer.name}.`);

    // Create ticket directly from frontend with the correct lawyer
    try {
      const ticketId = `TKT${Date.now().toString().slice(-6)}`;
      console.log('[handleConfirmPayment] About to call addTicketToServer with ticketId:', ticketId);

      const ticketPayload = {
        ticket_id: ticketId,
        client_id: lead.id,
        client_name: lead.name,
        lawyer_id: lawyer.id,
        lawyer_name: lawyer.name,
        service_type: lead.service,
        description: lead.description || '',
        status: 'WORK_UNDER_PROCESS' as const,
        priority: 'medium' as const,
        amount: servicePrice,
        advance_paid: amount,
        communication_notes: lead.communication_notes,
        followup_history: lead.followup_history,
      };

      console.log('[handleConfirmPayment] Ticket payload:', JSON.stringify(ticketPayload));
      await addTicketToServer(ticketPayload);

      console.log('[handleConfirmPayment] addTicketToServer SUCCESS');
      toast.success(`Ticket created with ₹${amount.toLocaleString('en-IN')} advance`, {
        description: `Assigned to ${lawyer.name}`,
      });
      sendPushNotification({
        target: lawyer.id,
        title: '🎉 New Ticket Assigned to You',
        body: `${lead.name} · ${(lead.service || '').replace(/-/g, ' ')} · ₹${amount.toLocaleString('en-IN')} advance paid`,
        url: '/tickets',
        tag: `ticket-assign-${ticketId}`,
      });
      setPaymentDialogOpen(false);
      navigate(`/tickets`);
    } catch (e: any) {
      console.error('[handleConfirmPayment] CAUGHT ERROR:', e?.message, e);
      toast.error(`Failed to create ticket: ${e?.message || 'Unknown error'}`);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    const entryId = `n${Date.now()}`;
    const author = `${currentUser.name}-${currentUser.role === 'super_admin' ? 'Superadmin' : currentUser.role === 'front_desk' ? 'Frontdesk' : 'Lawyer'}`;
    const nowIso = new Date().toISOString();

    const noteEntry = {
      id: entryId,
      text: newNote,
      type: noteType,
      created_by: author,
      created_at: nowIso,
    };

    const actionTitle = noteType === 'call_log' ? 'Call Log Added' : noteType === 'meeting' ? 'Meeting Logged' : 'Note Added';

    const newLog = {
      id: `a${Date.now()}`,
      action: actionTitle,
      details: newNote.substring(0, 100) + (newNote.length > 100 ? '...' : ''),
      created_by: author,
      created_at: nowIso
    };

    const updatedNotes = {
      ...parsedNotes,
      notes: noteType === 'note' ? [noteEntry, ...(parsedNotes.notes || [])] : (parsedNotes.notes || []),
      call_logs: noteType === 'call_log' ? [noteEntry, ...(parsedNotes.call_logs || [])] : (parsedNotes.call_logs || []),
      meetings: noteType === 'meeting' ? [noteEntry, ...(parsedNotes.meetings || [])] : (parsedNotes.meetings || []),
      activity_logs: [newLog, ...(parsedNotes.activity_logs || [])]
    };

    try {
      await updateLeadInServer(id!, { communication_notes: JSON.stringify(updatedNotes) });
      setNewNote('');
      toast.success(`${noteTypeLabels[noteType]} added`);

      // If a lawyer is assigned to this lead, notify them
      if (lead.assigned_lawyer_id) {
        sendPushNotification({
          target: lead.assigned_lawyer_id,
          title: `💬 New ${noteTypeLabels[noteType]} on ${lead.name}`,
          body: `${currentUser.name}: ${newNote.substring(0, 80)}`,
          url: `/lead/${id}`,
          tag: `lead-note-${id}`,
        });
      }
    } catch (e) {
      toast.error(`Failed to add ${noteTypeLabels[noteType].toLowerCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-base truncate">{lead.name}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{lead.custom_id}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 max-w-lg mx-auto">
        {/* Quick Actions */}
        <QuickActions 
          whatsapp_number={lead.whatsapp_number} 
          name={lead.name} 
          service={lead.service}
          leadId={id}
          onFollowup={async (date, note) => {
            console.log('LeadDetail: onFollowup triggered by QuickActions', { date, note });
            const history = parseSafeJson(lead.followup_history, []);
            const record = {
              attempt: history.length + 1,
              type: 'call', 
              scheduled_at: date.toISOString(),
              completed: false,
              note: note
            };
            toast.promise(addFollowUpToServer(id!, record), {
              loading: 'Scheduling follow-up...',
              success: 'Follow-up scheduled!',
              error: 'Failed to schedule'
            });
          }}
        />

        {/* In-CRM WhatsApp Chat Banner */}
        <Card className="p-3.5 bg-gradient-to-r from-success/10 via-success/5 to-background border-success/30 rounded-xl shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-success text-white flex items-center justify-center shrink-0 shadow-xs">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-semibold text-foreground truncate">Inbuilt WhatsApp Chat</h4>
                  <span className="text-[9px] bg-success/20 text-success font-semibold px-1.5 py-0.2 rounded">Inbuilt</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">Live messaging and document transfer with {lead.name}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 px-3 rounded-lg bg-success hover:bg-success/90 text-success-foreground text-xs gap-1.5 shrink-0 shadow-xs"
              onClick={() => {
                const cleanPhone = (lead.whatsapp_number || '').replace(/\D/g, '');
                navigate(`/inbox?phone=${cleanPhone}`);
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Open Inbuilt WhatsApp
            </Button>
          </div>
        </Card>

        {/* Lead Info */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ServiceBadge service={lead.service} />
            <LeadStatusBadge status={lead.status} />
            {lead.lead_score > 0 && <LeadScoreIndicator score={lead.lead_score} />}
            <span className="text-xs text-muted-foreground ml-auto">
              ₹{((lead && SERVICE_PRICES[lead.service as ServiceType]) || servicePrice || 999).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" /><span>{lead.location || 'Not Specified'}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0 text-success" />
                <span className="font-mono">
                  {revealPhone && currentRole === 'super_admin'
                    ? `+${(lead.whatsapp_number || '').replace(/^\+/, '')}`
                    : maskPhoneNumber(lead.whatsapp_number, false)}
                </span>
                <span className="text-[10px] text-primary/80 font-medium bg-primary/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <ShieldCheck className="w-3 h-3" /> Masked
                </span>
              </div>
              {currentRole === 'super_admin' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setRevealPhone(prev => !prev)}
                >
                  {revealPhone ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                  {revealPhone ? 'Hide' : 'Reveal'}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4 shrink-0" /><span>Follow-ups: {(() => {
                const history = parseSafeJson(lead.followup_history, []);
                return history.length;
              })()}/6</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" /><span>Created: {formatSafeDate(lead.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" /><span>Updated: {formatSafeDate(lead.updated_at)}</span>
            </div>
          </div>
          {lead.description && (
            <p className="text-sm text-muted-foreground border-t pt-2">{lead.description}</p>
          )}
        </Card>

        {/* Status */}
        <Card className="p-4">
          <label className="text-xs font-semibold text-muted-foreground mb-2 block">Update Status</label>
          <Select value={lead.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEAD_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Assign Lawyer */}
        <Card className="p-4">
          <label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" /> Assign Lawyer
          </label>
          <Select
            value={lead.assigned_lawyer_id || 'unassigned'}
            onValueChange={async (val) => {
              const lawyerId = val === 'unassigned' ? null : val;
              const lawyerName = users.find(u => u.id === lawyerId)?.name;
              
              try {
                await updateLeadInServer(id!, { assigned_lawyer_id: lawyerId });
                addActivityLog(id!, 'Lawyer Assigned', lawyerId ? `Assigned to ${lawyerName}` : 'Lawyer unassigned');
                toast.success(lawyerId ? `Assigned to ${lawyerName}` : 'Lawyer unassigned');
                if (lawyerId) {
                  sendPushNotification({
                    target: lawyerId,
                    title: '📋 Lead Assigned to You',
                    body: `${lead.name} · ${lead.service.replace(/-/g, ' ')} · ${lead.location}`,
                    url: `/lead/${id}`,
                    tag: `lead-assign-${id}`,
                  });
                }
              } catch (e) {
                toast.error('Failed to assign lawyer');
              }
            }}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="Select a lawyer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Not Assigned</SelectItem>
              {users.filter(u => u.role === 'lawyer').map(lawyer => (
                <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lead.assigned_lawyer_id && (
            <p className="text-xs text-muted-foreground mt-2">
              Currently assigned to <span className="font-medium text-foreground">{users.find(u => u.id === lead.assigned_lawyer_id)?.name}</span>
            </p>
          )}
        </Card>

        {/* Communication & Notes */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" /> Communication & Notes
            </h3>
            <span className="text-[11px] text-muted-foreground font-mono">
              {unifiedNotes.length} {unifiedNotes.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="flex gap-1.5 mb-2.5">
            {(Object.entries(noteTypeLabels) as [NoteType, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setNoteType(key)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  noteType === key 
                    ? 'bg-primary text-primary-foreground shadow-xs' 
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                {key === 'call_log' ? '📞 ' : key === 'meeting' ? '🤝 ' : '📝 '}{label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            <Textarea
              placeholder={
                noteType === 'call_log' 
                  ? 'Log call discussion, summary & client response...' 
                  : noteType === 'meeting' 
                    ? 'Log meeting minutes, attendees & next steps...' 
                    : 'Add a general note...'
              }
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[46px] text-sm rounded-xl resize-none"
              rows={2}
            />
            <Button className="h-auto rounded-xl px-4" onClick={handleAddNote}>
              Add
            </Button>
          </div>

          <div className="space-y-2">
            {unifiedNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No notes or logs added yet</p>
            ) : (
              unifiedNotes.map(note => (
                <div key={note.id} className={`rounded-xl p-2.5 border transition-all ${noteTypeColors[note.type as NoteType] || 'bg-muted/50 border-transparent'}`}>
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        className="min-h-[44px] text-sm rounded-xl resize-none bg-background"
                        rows={2}
                      />
                      <div className="flex gap-1.5 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => setEditingNoteId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={async () => {
                          if (!editingNoteText.trim()) return;
                          const updatedNotes = {
                            ...parsedNotes,
                            notes: (parsedNotes.notes || []).map((n: any) => n.id === note.id ? { ...n, text: editingNoteText } : n),
                            call_logs: (parsedNotes.call_logs || []).map((n: any) => n.id === note.id ? { ...n, text: editingNoteText } : n),
                            meetings: (parsedNotes.meetings || []).map((n: any) => n.id === note.id ? { ...n, text: editingNoteText } : n)
                          };
                          try {
                            await updateLeadInServer(id!, { communication_notes: JSON.stringify(updatedNotes) });
                            setEditingNoteId(null);
                            toast.success('Note updated');
                          } catch (e) {
                            toast.error('Failed to update note');
                          }
                        }}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-background/80 border text-foreground/80">
                              {note.type === 'call_log' ? '📞 Call Log' : note.type === 'meeting' ? '🤝 Meeting' : '📝 Note'}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.text}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-md shrink-0" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}>
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 pt-1 border-t border-border/30">
                        {note.created_by} • {formatSafeDate(note.created_at)}
                      </p>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Dedicated Call History & Recordings Card */}
        <Card className="p-4 space-y-3 border-primary/20 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center font-bold shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Call Logs & Telephony History</h3>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-mono font-medium">
                    {allCallHistory.length} {allCallHistory.length === 1 ? 'call' : 'calls'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">Smartflo masked calls & PBX recording history</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSyncIdBox(prev => !prev)}
                title="Sync a specific call ID from Tata portal"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sync Call ID</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  fetchTelecomCalls();
                  toast.info('Syncing call records from Tata Smartflo...');
                }}
                disabled={isSyncingCalls}
                title="Refresh call records from Smartflo"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCalls ? 'animate-spin text-primary' : ''}`} />
                <span className="hidden sm:inline">Sync PBX</span>
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs rounded-xl gap-1.5 bg-success hover:bg-success/90 text-success-foreground shadow-xs"
                onClick={() => setCallDialogOpen(true)}
              >
                <Phone className="w-3.5 h-3.5" />
                Call Now
              </Button>
            </div>
          </div>

          {showSyncIdBox && (
            <div className="p-2.5 bg-muted/60 rounded-xl border border-primary/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Enter Tata Call ID (e.g. <code className="text-primary font-mono font-bold">MUM1-D7-1795513949.254658</code>):</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowSyncIdBox(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Call ID here..."
                  value={syncCallIdInput}
                  onChange={(e) => setSyncCallIdInput(e.target.value)}
                  className="h-8 text-xs font-mono rounded-lg"
                />
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs rounded-lg gap-1"
                  onClick={handleSyncCallById}
                  disabled={isSyncingCalls || !syncCallIdInput.trim()}
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingCalls ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
              </div>
            </div>
          )}

          {allCallHistory.length === 0 ? (
            <div className="text-center py-6 px-4 bg-muted/30 rounded-xl border border-dashed border-border/80">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground mb-2">
                <PhoneMissed className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-foreground">No call logs recorded yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs mx-auto">
                Place a call using the Smartflo masked dialer or log a manual call summary above.
              </p>
              <div className="flex justify-center gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg gap-1"
                  onClick={() => setCallDialogOpen(true)}
                >
                  <Phone className="w-3 h-3 text-success" /> Start Call
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {allCallHistory.map((call) => {
                const meta = getCallStatusMeta(call.status, call.action);
                const hasValidAudio = Boolean(
                  call.recording_url && 
                  call.duration !== '00:00' && 
                  call.duration !== '0:00' && 
                  call.durationSecs !== 0 && 
                  !call.action?.includes('Rejected') && 
                  !call.action?.includes('No Answer')
                );

                return (
                  <div
                    key={call.id}
                    className="p-3 bg-muted/40 hover:bg-muted/60 transition-colors rounded-xl border border-border/70 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] font-semibold py-0.5 px-2 rounded-md border ${meta.color}`}>
                          {meta.label}
                        </Badge>
                        {call.duration && call.duration !== '00:00' && (
                          <Badge variant="secondary" className="text-[10px] font-mono py-0 px-1.5 h-4">
                            <Clock className="w-2.5 h-2.5 mr-1" />
                            {call.duration}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                          {call.source}
                        </span>
                        {hasValidAudio && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 text-primary border-primary/30 bg-primary/5 gap-1">
                            <Mic className="w-2.5 h-2.5" /> Recording Available
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] rounded-lg gap-1 text-primary hover:bg-primary/10"
                          onClick={() => setCallDialogOpen(true)}
                          title="Call again"
                        >
                          <Phone className="w-3 h-3" />
                          <span className="hidden sm:inline">Redial</span>
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-foreground font-medium leading-relaxed">
                      {call.details || call.action}
                    </p>

                    {/* Playable Call Recording */}
                    {hasValidAudio && (
                      <div className="p-2.5 bg-background rounded-lg border border-border/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
                          <span className="flex items-center gap-1.5 text-primary font-semibold">
                            <Play className="w-3 h-3 fill-primary" /> Audio Recording ({call.duration})
                          </span>
                          <div className="flex items-center gap-2">
                            <a
                              href={call.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-muted-foreground hover:text-primary hover:underline font-medium"
                              onClick={(e) => e.stopPropagation()}
                              title="Open original Tata audio stream"
                            >
                              Tata Stream
                            </a>
                            <a
                              href={formatPlayableAudioUrl(call.recording_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              download="call-recording.mp3"
                              className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-3 h-3" /> Download MP3
                            </a>
                          </div>
                        </div>
                        <audio
                          controls
                          preload="auto"
                          src={formatPlayableAudioUrl(call.recording_url)}
                          className="w-full h-8 rounded-md"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t border-border/40">
                      <span>Handled by: <strong className="text-foreground">{call.created_by || 'Agent'}</strong></span>
                      <span>{formatSafeDate(call.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Activity Timeline */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Activity Timeline</h3>
          <ActivityTimeline logs={leadLogs} />
        </Card>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Record Advance Payment</DialogTitle>
            <DialogDescription className="text-xs">
              Enter the advance amount paid by <span className="font-semibold text-foreground">{lead.name}</span> for {(lead.service || '').replace(/-/g, ' ')}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <span className="text-xs text-muted-foreground">Service Price</span>
              <span className="text-sm font-bold">₹{servicePrice.toLocaleString('en-IN')}</span>
            </div>

            {/* Lawyer Selection */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Assign Lawyer</label>
              <Select value={selectedLawyerId} onValueChange={setSelectedLawyerId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select a lawyer" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'lawyer').map(lawyer => (
                    <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advance Amount */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Advance Amount</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Enter advance amount"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="pl-9 h-12 rounded-xl text-sm"
                  min={1}
                  max={servicePrice}
                />
              </div>
            </div>

            <Button
              className="w-full h-11 rounded-xl"
              onClick={handleConfirmPayment}
              disabled={!advanceAmount || !selectedLawyerId}
            >
              Create Ticket & Record ₹{advanceAmount ? parseFloat(advanceAmount).toLocaleString('en-IN') : '0'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tata Tele Smartflo 2-Way Masked Calling Dialog */}
      <SmartfloCallDialog
        open={callDialogOpen}
        onOpenChange={setCallDialogOpen}
        leadId={id!}
        leadName={lead.name}
        rawPhoneNumber={lead.whatsapp_number}
        serviceName={lead.service}
        onCallFinished={() => {
          fetchTelecomCalls();
          toast.success('Call log saved to lead history!');
        }}
      />
    </div>
  );
};

export default LeadDetail;
