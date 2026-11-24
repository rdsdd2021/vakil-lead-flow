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

  // Unified Activity & Call Timeline for this lead
  const unifiedLeadLogs = useMemo(() => {
    const list: any[] = [];
    const seenIds = new Set<string>();
    const seenCallIds = new Set<string>();
    const seenRecordingUrls = new Set<string>();

    const checkAndTrackCall = (callId?: string | null, recordingUrl?: string | null): boolean => {
      if (callId) {
        const cleanId = callId.replace(/^(call_|call_act_|pbx_)/, '').trim();
        if (cleanId) {
          if (seenCallIds.has(cleanId)) return false;
          seenCallIds.add(cleanId);
        }
      }
      if (recordingUrl && recordingUrl.trim()) {
        const cleanUrl = recordingUrl.split('&token=')[0]; // compare base recording URL to prevent token mismatch dupes
        if (seenRecordingUrls.has(cleanUrl)) return false;
        seenRecordingUrls.add(cleanUrl);
      }
      return true;
    };

    // 1. Regular CRM activity logs
    leadLogs.forEach((log: any) => {
      if (log.id && !seenIds.has(log.id)) {
        if (checkAndTrackCall(log.call_id || log.id, log.recording_url)) {
          seenIds.add(log.id);
          list.push(log);
        }
      }
    });

    // 2. Activity logs stored in lead.communication_notes
    (parsedNotes.activity_logs || []).forEach((log: any) => {
      const logId = log.id || `act_${log.created_at}`;
      if (!seenIds.has(logId)) {
        if (checkAndTrackCall(log.call_id || log.id, log.recording_url)) {
          seenIds.add(logId);
          list.push({
            id: logId,
            entity_id: id,
            entity_type: 'lead',
            action: log.action || 'Activity',
            details: log.details || '',
            call_duration: log.duration || log.call_duration,
            recording_url: log.recording_url,
            created_by: log.created_by || 'System',
            created_at: log.created_at || new Date().toISOString(),
          });
        }
      }
    });

    // 3. Call logs stored in lead.communication_notes
    (parsedNotes.call_logs || []).forEach((clog: any) => {
      const clogId = clog.id || clog.call_id || `clog_${clog.created_at}`;
      if (!seenIds.has(clogId)) {
        if (checkAndTrackCall(clog.call_id || clog.id, clog.recording_url)) {
          seenIds.add(clogId);
          list.push({
            id: clogId,
            entity_id: id,
            entity_type: 'lead',
            action: clog.action || 'Phone Call Connected',
            details: clog.details || clog.text || 'Tata Smartflo call',
            call_duration: clog.duration || clog.call_duration || '00:00',
            recording_url: clog.recording_url,
            created_by: clog.created_by || 'Smartflo Telephony',
            created_at: clog.created_at || new Date().toISOString(),
          });
        }
      }
    });

    // 4. Live PBX CDR records from Tata Smartflo
    telecomCalls.forEach((r: any) => {
      const callId = r.call_id || r.ref_id || r.id;
      if (callId && checkAndTrackCall(callId, r.recording_url)) {
        seenIds.add(`pbx_${callId}`);
        const isAnswered = r.status === 'answered' || (r.answered_seconds > 0);
        const hasRealRecording = isAnswered && r.answered_seconds > 0 && r.recording_url;
        list.push({
          id: `pbx_${callId}`,
          entity_id: id,
          entity_type: 'lead',
          action: isAnswered ? 'Phone Call Connected' : (r.status === 'missed' ? 'No Answer' : (r.status || 'Call Made')),
          details: r.description || r.reason || `Smartflo ${r.direction || 'outbound'} call via Virtual DID ${r.did_number || SMARTFLO_CONFIG.pilotNumber}`,
          call_duration: formatDuration(r.answered_seconds || r.call_duration || 0),
          recording_url: hasRealRecording ? r.recording_url : null,
          created_by: r.agent_name || r.agent_number || 'Tata Smartflo PBX',
          created_at: r.date && r.time ? `${r.date}T${r.time}` : (r.end_stamp || new Date().toISOString()),
        });
      }
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [leadLogs, parsedNotes.activity_logs, parsedNotes.call_logs, telecomCalls, id]);

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

        {/* Activity Timeline (Lead History & Recordings) */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Lead History & Timeline</h3>
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-mono font-medium">
                  {unifiedLeadLogs.length} {unifiedLeadLogs.length === 1 ? 'event' : 'events'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Calls, recordings, and CRM activity logs</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  fetchTelecomCalls();
                  toast.info('Syncing call records from Tata Smartflo...');
                }}
                disabled={isSyncingCalls}
                title="Refresh call records from Smartflo PBX"
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
          <ActivityTimeline logs={unifiedLeadLogs} />
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
