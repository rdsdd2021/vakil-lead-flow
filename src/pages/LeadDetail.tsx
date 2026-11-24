import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { QuickActions } from '@/components/QuickActions';
import { LeadStatusBadge, ServiceBadge, LeadScoreIndicator } from '@/components/StatusBadges';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Phone, User, FileText, Clock, Scale, Pencil, Check, X, IndianRupee, ShieldCheck, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { LEAD_STATUS_LABELS, LeadStatus, SERVICE_PRICES } from '@/types/crm';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { sendPushNotification } from '@/lib/pushNotifications';
import { maskPhoneNumber, SMARTFLO_CONFIG } from '@/lib/smartflo';
import { WhatsAppChatDialog } from '@/components/WhatsAppChatDialog';

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    leads, setLeads, addTicketToServer, followUps, setFollowUps, 
    currentUser, currentRole, users, isLoadingLeads, updateLeadInServer, 
    addFollowUpToServer, addActivityLog, activityLogs
  } = useCRM();
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [selectedLawyerId, setSelectedLawyerId] = useState<string>('');
  const [revealPhone, setRevealPhone] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);



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
  
  const parsedNotes = parseSafeJson(lead?.communication_notes, { notes: [], call_logs: [], meetings: [], activity_logs: [] });
  const leadNotes = Array.isArray(parsedNotes.notes) ? parsedNotes.notes : [];
  const leadLogs = activityLogs.filter(a => a.entity_id === id);

  const servicePrice = (lead && SERVICE_PRICES[lead.service as ServiceType]) ? SERVICE_PRICES[lead.service as ServiceType] : 999;

  // Direct serverless API fallback if navigated directly to lead URL
  useState(() => {
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
  });

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
        body: `${lead.name} · ${lead.service.replace(/-/g, ' ')} · ₹${amount.toLocaleString('en-IN')} advance paid`,
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
    
    const noteEntry = {
      id: `n${Date.now()}`,
      text: newNote,
      created_by: `${currentUser.name}-${currentUser.role === 'super_admin' ? 'Superadmin' : currentUser.role === 'front_desk' ? 'Frontdesk' : 'Lawyer'}`,
      created_at: new Date().toISOString(),
    };

    const newLog = {
      id: `a${Date.now()}`,
      action: 'Note Added',
      details: newNote.substring(0, 80) + (newNote.length > 80 ? '...' : ''),
      created_by: `${currentUser.name}-${currentUser.role === 'super_admin' ? 'Superadmin' : currentUser.role === 'front_desk' ? 'Frontdesk' : 'Lawyer'}`,
      created_at: new Date().toISOString()
    };

    const updatedNotes = {
      ...parsedNotes,
      notes: [noteEntry, ...(parsedNotes.notes || [])],
      activity_logs: [newLog, ...(parsedNotes.activity_logs || [])]
    };

    try {
      await updateLeadInServer(id!, { communication_notes: JSON.stringify(updatedNotes) });
      setNewNote('');
      toast.success('Note added');

      // If a lawyer is assigned to this lead, notify them
      if (lead.assigned_lawyer_id) {
        sendPushNotification({
          target: lead.assigned_lawyer_id,
          title: `💬 New Note on ${lead.name}`,
          body: `${currentUser.name}: ${newNote.substring(0, 80)}`,
          url: `/lead/${id}`,
          tag: `lead-note-${id}`,
        });
      }
    } catch (e) {
      toast.error('Failed to add note');
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
                  <h4 className="text-xs font-semibold text-foreground truncate">WhatsApp Chat</h4>
                  <span className="text-[9px] bg-success/20 text-success font-semibold px-1.5 py-0.2 rounded">Kapso AI</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">Live two-way messaging with {lead.name}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 px-3 rounded-lg bg-success hover:bg-success/90 text-success-foreground text-xs gap-1.5 shrink-0 shadow-xs"
              onClick={() => setChatDialogOpen(true)}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Open Chat
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
              <MapPin className="w-4 h-4 shrink-0" /><span>{lead.location}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0 text-success" />
                <span className="font-mono">
                  {revealPhone && currentRole === 'super_admin'
                    ? `+${lead.whatsapp_number.replace(/^\+/, '')}`
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
              <Clock className="w-4 h-4 shrink-0" /><span>Created: {format(new Date(lead.created_at), 'dd MMM yyyy, hh:mm a')}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" /><span>Updated: {format(new Date(lead.updated_at), 'dd MMM yyyy, hh:mm a')}</span>
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

        {/* Notes */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Notes
          </h3>
          <div className="flex gap-2 mb-3">
            <Textarea
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[44px] text-sm rounded-xl resize-none"
              rows={2}
            />
            <Button className="h-auto rounded-xl px-4" onClick={handleAddNote}>Add</Button>
          </div>
          <div className="space-y-2">
            {leadNotes.map(note => (
              <div key={note.id} className="bg-muted/50 rounded-lg p-2.5">
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      className="min-h-[44px] text-sm rounded-xl resize-none"
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
                          notes: (parsedNotes.notes || []).map((n: any) => n.id === note.id ? { ...n, text: editingNoteText } : n)
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
                      <p className="text-sm flex-1">{note.text}</p>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-md shrink-0" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}>
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{note.created_by} • {format(new Date(note.created_at), 'dd MMM yyyy, hh:mm a')}</p>
                  </>
                )}
              </div>
            ))}
          </div>
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
              Enter the advance amount paid by <span className="font-semibold text-foreground">{lead.name}</span> for {lead.service.replace('-', ' ')}.
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

      {/* In-CRM WhatsApp Chat Dialog */}
      <WhatsAppChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
        leadId={id}
        clientName={lead.name}
        rawPhoneNumber={lead.whatsapp_number}
        serviceTitle={lead.service}
      />
    </div>
  );
};

export default LeadDetail;
