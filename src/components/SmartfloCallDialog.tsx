import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Phone, PhoneCall, PhoneOff, Mic, ShieldCheck, Clock, CheckCircle2, 
  AlertTriangle, Play, Settings2, PhoneMissed, PhoneForwarded, MessageCircle, RotateCcw,
  Sparkles, Loader2, User
} from 'lucide-react';
import { 
  maskPhoneNumber, 
  SMARTFLO_CONFIG, 
  SmartfloCallStatus, 
  SmartfloCallRecord,
  initiateSmartfloCall, 
  fetchSmartfloLiveCalls, 
  fetchSmartfloCallRecord, 
  hangupSmartfloCall,
  formatPlayableAudioUrl
} from '@/lib/smartflo';
import { useCRM } from '@/contexts/CRMContext';
import { toast } from 'sonner';

interface SmartfloCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  rawPhoneNumber: string;
  serviceName?: string;
  onCallFinished?: (recordingUrl?: string, duration?: string) => void;
}

export type CallDisposition = 
  | 'connected'
  | 'rejected'
  | 'no_answer'
  | 'busy'
  | 'switched_off';

export const SmartfloCallDialog: React.FC<SmartfloCallDialogProps> = ({
  open,
  onOpenChange,
  leadId,
  leadName,
  rawPhoneNumber,
  serviceName,
  onCallFinished,
}) => {
  const { currentUser, currentRole, addActivityLog, leads, updateLeadInServer, updateCurrentUserPhone } = useCRM();
  const [callStatus, setCallStatus] = useState<SmartfloCallStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [callNotes, setCallNotes] = useState('');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [dispositionOutcome, setDispositionOutcome] = useState<CallDisposition | null>(null);
  const [activeRefId, setActiveRefId] = useState<string | null>(null);
  const [isAutoLogged, setIsAutoLogged] = useState(false);
  const [cdrReason, setCdrReason] = useState<string | null>(null);
  const [isEditingNumber, setIsEditingNumber] = useState(false);

  // Take agent's / lawyer's number directly from their profile
  const [agentNumber, setAgentNumber] = useState<string>(
    currentUser?.phone ||
    localStorage.getItem(`smartflo_user_phone_${currentUser?.id}`) ||
    localStorage.getItem('smartflo_agent_phone') || 
    SMARTFLO_CONFIG.defaultAgentPhone || 
    '9800000001'
  );

  const timerRef = useRef<any>(null);
  const pollerRef = useRef<any>(null);
  const activeRefIdRef = useRef<string | null>(null);
  const hasConnectedRef = useRef<boolean>(false);
  const isLoggedRef = useRef<boolean>(false);
  const secondsRef = useRef<number>(0);

  const isSuperAdmin = currentRole === 'super_admin';
  const maskedCustomer = maskPhoneNumber(rawPhoneNumber, isSuperAdmin);

  // Keep secondsRef in sync
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  // Sync profile phone when dialog opens
  useEffect(() => {
    if (open) {
      const resolved = 
        currentUser?.phone || 
        localStorage.getItem(`smartflo_user_phone_${currentUser?.id}`) || 
        localStorage.getItem('smartflo_agent_phone') || 
        SMARTFLO_CONFIG.defaultAgentPhone ||
        '9800000001';
      setAgentNumber(resolved);
      setIsEditingNumber(false);
    }
  }, [open, currentUser]);

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setCallStatus('idle');
      setStatusMessage('');
      setErrorMessage(null);
      setSeconds(0);
      setCallNotes('');
      setRecordingUrl(null);
      setDispositionOutcome(null);
      setActiveRefId(null);
      setIsAutoLogged(false);
      setCdrReason(null);
      hasConnectedRef.current = false;
      isLoggedRef.current = false;
    } else {
      stopTimer();
      stopPoller();
    }
    return () => {
      stopTimer();
      stopPoller();
    };
  }, [open]);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPoller = () => {
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Automated Logging to CRM History & Follow-Up Updates
   * Works for both answered calls and missed/rejected calls.
   */
  const autoLogCallOutcome = async (
    disposition: CallDisposition, 
    cdr?: SmartfloCallRecord | null,
    overrideSeconds?: number
  ) => {
    if (isLoggedRef.current) return;
    isLoggedRef.current = true;
    setIsAutoLogged(true);

    const callSecs = overrideSeconds !== undefined ? overrideSeconds : (cdr?.answered_seconds ?? secondsRef.current);
    const durationFormatted = formatTimer(callSecs);
    setDispositionOutcome(disposition);
    setCallStatus('completed');
    stopTimer();
    stopPoller();

    let dispositionLabel = 'Connected & Spoke';
    let activityAction = 'Call Made';

    if (disposition === 'rejected') {
      dispositionLabel = 'Customer Cut / Rejected Call';
      activityAction = 'Call Rejected';
    } else if (disposition === 'no_answer') {
      dispositionLabel = 'No Answer / Rang Out';
      activityAction = 'No Answer';
    } else if (disposition === 'busy') {
      dispositionLabel = 'Customer Line Busy';
      activityAction = 'Call Busy';
    } else if (disposition === 'switched_off') {
      dispositionLabel = 'Phone Switched Off / Unreachable';
      activityAction = 'Unreachable';
    }

    const currentRef = activeRefIdRef.current || cdr?.ref_id || 'SF-AUTO';
    const reasonText = cdr?.description || cdr?.reason || cdrReason || dispositionLabel;
    setCdrReason(reasonText);

    const logDetails = `Tata Smartflo Call: ${dispositionLabel} (Talk Time: ${durationFormatted}). Virtual DID: ${SMARTFLO_CONFIG.pilotNumber}. Ref: ${currentRef}. Detail: ${reasonText}. ${callNotes ? `Notes: ${callNotes}` : ''}`;

    try {
      // Only attach recording URL if the call was actually answered and connected with talk time
      // (Telecom PBX sends a 144-byte empty stub file for missed / 0s calls)
      const isActuallyConnected = disposition === 'connected' && (callSecs > 0 || (cdr && cdr.answered_seconds > 0));
      const recUrl = isActuallyConnected ? (cdr?.recording_url || recordingUrl || undefined) : undefined;
      setRecordingUrl(recUrl || null);

      // 1. Add to CRM Activity Timeline
      await addActivityLog(leadId, activityAction, logDetails, {
        recording_url: recUrl,
        call_duration: durationFormatted,
        call_status: dispositionLabel,
        masked_number: maskedCustomer,
      });

      // 2. Increment follow-up attempt counter on lead
      const currentLead = leads.find(l => l.id === leadId);
      if (currentLead) {
        const nextCount = (currentLead.followup_count || 0) + 1;
        await updateLeadInServer(leadId, { followup_count: nextCount });
      }

      if (disposition === 'connected' && callSecs > 0) {
        toast.success(`Call Completed: ${dispositionLabel}`, {
          description: `Spoke for ${durationFormatted}. Audio recording synced to CRM history.`,
        });
      } else {
        toast.warning(`Call Missed / Rejected by Customer`, {
          description: `Logged to CRM history. Follow-up count incremented automatically.`,
        });
      }

      onCallFinished?.(recUrl, durationFormatted);
    } catch (err) {
      console.error('Failed to auto-log call record:', err);
    }
  };

  /**
   * Automated Status Polling Engine
   * Polls Tata Smartflo live_calls and call/records to detect agent pickup,
   * client ringing, call connection, and auto-detects missed/rejected calls.
   */
  const startPoller = (refId: string) => {
    stopPoller();
    activeRefIdRef.current = refId;
    const callStartTime = Date.now();
    let pollCount = 0;

    pollerRef.current = setInterval(async () => {
      pollCount++;

      // Guard: if dialog closed or already logged
      if (!open || isLoggedRef.current) {
        stopPoller();
        return;
      }

      try {
        // Step 1: Check live calls across the account
        const liveCalls = await fetchSmartfloLiveCalls(agentNumber);
        const activeCall = liveCalls.find(
          c => c.ref_id === refId || 
               c.call_id === refId || 
               (c.customer_number && c.customer_number.includes(rawPhoneNumber.slice(-8))) ||
               (c.agent_number && c.agent_number.includes(agentNumber.slice(-8)))
        );

        if (activeCall) {
          const state = String(activeCall.state || activeCall.status || '').toLowerCase();

          if (state.includes('ring') || state.includes('originate')) {
            setCallStatus('bridging_customer');
            setStatusMessage(`Agent answered! Smartflo is ringing customer (${maskedCustomer})...`);
          } else if (state.includes('answer') || state.includes('active') || state.includes('talk')) {
            if (!hasConnectedRef.current) {
              hasConnectedRef.current = true;
              setCallStatus('connected');
              setStatusMessage('Call connected with customer! Recording active 🔴');
              startTimer();
            }
          }
          return;
        }

        // Step 2: The call is not currently active in live_calls
        const elapsedSeconds = (Date.now() - callStartTime) / 1000;

        // If the call was already connected and now dropped (call finished naturally):
        // OR if at least 15 seconds have passed (giving phones enough time to ring before declaring missed)
        if (hasConnectedRef.current || elapsedSeconds >= 14) {
          const cdr = await fetchSmartfloCallRecord(refId, rawPhoneNumber, callStartTime);
          
          if (cdr && (cdr.ref_id === refId || pollCount > 4)) {
            const isAnswered = cdr.status === 'answered' && (cdr.answered_seconds > 0 || hasConnectedRef.current);

            if (isAnswered) {
              await autoLogCallOutcome('connected', cdr, cdr.answered_seconds || secondsRef.current);
            } else {
              // Customer did not answer / rejected / line busy
              const desc = (cdr.description || cdr.reason || '').toLowerCase();
              const disposition: CallDisposition = 
                desc.includes('busy') ? 'busy' :
                desc.includes('reject') || desc.includes('cancel') ? 'rejected' :
                'no_answer';

              await autoLogCallOutcome(disposition, cdr, 0);
            }
            return;
          }

          // If after 35 seconds of polling no live call and no CDR, conclude based on connection
          if (elapsedSeconds >= 35) {
            if (hasConnectedRef.current && secondsRef.current > 0) {
              await autoLogCallOutcome('connected', null, secondsRef.current);
            } else {
              await autoLogCallOutcome('no_answer', null, 0);
            }
          }
        }
      } catch (err) {
        console.warn('Smartflo automated poller error:', err);
      }
    }, 2200);
  };

  /**
   * Initiate Call Button Handler
   */
  const handleStartCall = async (forceSim: boolean = false) => {
    if (!forceSim && !agentNumber.trim()) {
      toast.error('Please enter the Agent Phone or Extension to receive the call.');
      return;
    }

    if (agentNumber.trim()) {
      localStorage.setItem('smartflo_agent_phone', agentNumber.trim());
    }

    setErrorMessage(null);
    setCallStatus('initiating');
    setIsAutoLogged(false);
    hasConnectedRef.current = false;
    isLoggedRef.current = false;
    setSeconds(0);
    setCdrReason(null);
    setStatusMessage(`Triggering call via Tata Smartflo (DID: ${SMARTFLO_CONFIG.pilotNumber})...`);

    const res = await initiateSmartfloCall(
      {
        leadId,
        leadName,
        agentId: currentUser.id,
        agentName: currentUser.name,
        agentPhoneOrExt: agentNumber.trim(),
        customerNumber: rawPhoneNumber,
        serviceName,
      },
      (status, msg) => {
        setCallStatus(status);
        setStatusMessage(msg);
      },
      forceSim
    );

    if (!res.success && res.status === 'failed') {
      stopTimer();
      stopPoller();
      setCallStatus('failed');
      setErrorMessage(res.message || 'Call request rejected by Tata Smartflo.');
    } else {
      setActiveRefId(res.refId);
      activeRefIdRef.current = res.refId;

      if (forceSim) {
        // Simulation flow
        setCallStatus('connected');
        hasConnectedRef.current = true;
        setStatusMessage('Simulation Call connected! Recording active 🔴');
        startTimer();
      } else {
        // Real Tata Smartflo flow: Agent phone rings first!
        setCallStatus('ringing_agent');
        setStatusMessage(`Calling your phone (${agentNumber.trim()}) from DID ${SMARTFLO_CONFIG.pilotNumber}. Pick up to connect!`);
        startPoller(res.refId);
      }
    }
  };

  /**
   * Hang up / Terminate Call via Tata API
   */
  const handleCancelOrHangup = async () => {
    if (activeRefIdRef.current) {
      await hangupSmartfloCall(activeRefIdRef.current);
    }

    if (hasConnectedRef.current && seconds > 0) {
      await autoLogCallOutcome('connected', null, seconds);
    } else {
      await autoLogCallOutcome('rejected', null, 0);
    }
  };

  /**
   * Manual override disposition (if user chooses to re-classify outcome)
   */
  const handleManualDispositionOverride = async (disposition: CallDisposition) => {
    isLoggedRef.current = false; // Allow manual override
    await autoLogCallOutcome(disposition, null, disposition === 'connected' ? (seconds || 60) : 0);
  };

  // Shortcut to send follow-up WhatsApp template if client cut or didn't answer
  const handleSendWhatsAppFollowup = () => {
    const cleanNumber = rawPhoneNumber.replace(/^\+/, '').replace(/\s/g, '');
    const message = `Hi ${leadName}, this is ${currentUser.name} from Vakiltech. We tried reaching you regarding your enquiry about ${serviceName || 'legal services'}, but could not connect. When would be a convenient time for a quick 2-minute call?`;
    const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    addActivityLog(leadId, 'WhatsApp Sent', `Sent follow-up template to client after missed/rejected call.`);
    onOpenChange(false);
  };

  // Schedule next callback in 30 minutes
  const handleScheduleCallback = async (minutesFromNow: number = 30) => {
    const nextDate = new Date(Date.now() + minutesFromNow * 60 * 1000);
    const record = {
      attempt: (leads.find(l => l.id === leadId)?.followup_count || 1) + 1,
      type: 'call',
      scheduled_at: nextDate.toISOString(),
      completed: false,
      note: `Follow-up after ${dispositionOutcome || 'missed call'}`,
    };

    try {
      await addFollowUpToServer(leadId, record);
      toast.success(`Follow-up call scheduled for ${nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      onOpenChange(false);
    } catch (e) {
      toast.error('Failed to schedule follow-up');
    }
  };

  const handleClose = () => {
    if (callStatus === 'connected' && !dispositionOutcome && !isLoggedRef.current) {
      autoLogCallOutcome('connected', null, seconds);
    }
    stopTimer();
    stopPoller();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="gap-1.5 py-1 px-2.5 bg-primary/5 text-primary border-primary/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Tata Tele Smartflo Masked Calling
            </Badge>
            {callStatus === 'connected' && (
              <Badge variant="destructive" className="animate-pulse gap-1 text-[11px]">
                <Mic className="w-3 h-3" /> REC ON
              </Badge>
            )}
            {callStatus === 'completed' && isAutoLogged && (
              <Badge variant="secondary" className="gap-1 text-[10px] bg-primary/10 text-primary">
                <Sparkles className="w-3 h-3" /> Auto-Logged
              </Badge>
            )}
          </div>
          <DialogTitle className="text-lg font-bold mt-2">Calling {leadName}</DialogTitle>
          <DialogDescription className="text-xs">
            Number masked for privacy. Bridging via Tata Virtual DID <span className="font-mono font-semibold text-foreground">{SMARTFLO_CONFIG.pilotNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Numbers Info */}
          <div className="bg-muted/40 rounded-xl p-3.5 space-y-2 border border-border/50 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Customer (Lead):</span>
              <span className="font-mono font-bold text-foreground">{maskedCustomer}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tata Virtual Caller ID (DID):</span>
              <span className="font-mono text-primary font-semibold">{SMARTFLO_CONFIG.pilotNumber}</span>
            </div>
          </div>

          {/* Two-Way Connectivity Profile Integration */}
          {callStatus === 'idle' && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <User className="w-3.5 h-3.5 text-primary" />
                  <span>Two-Way Calling Profile:</span>
                  <Badge variant="outline" className="text-[10px] bg-background py-0 px-1.5 font-normal">
                    {currentUser.name}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingNumber(!isEditingNumber)}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Settings2 className="w-3 h-3" />
                  {isEditingNumber ? 'Done' : 'Change Number'}
                </button>
              </div>

              {!isEditingNumber ? (
                <div className="flex items-center justify-between bg-background/80 px-3 py-2 rounded-lg border border-border/60 text-xs">
                  <span className="text-muted-foreground">Your Phone (Rings First):</span>
                  <span className="font-mono font-bold text-primary">+{agentNumber}</span>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-muted-foreground block">
                    Update phone number in your profile:
                  </label>
                  <Input
                    placeholder="e.g. 98XXXXXXXX"
                    value={agentNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(-10);
                      setAgentNumber(val);
                      updateCurrentUserPhone(val);
                    }}
                    className="h-9 text-xs rounded-lg font-mono bg-background"
                  />
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                Two-way bridge: Smartflo rings your profile mobile (<span className="font-mono text-foreground font-semibold">+{agentNumber}</span>) first, then connects customer from Virtual DID <code className="text-primary font-mono font-semibold">{SMARTFLO_CONFIG.pilotNumber}</code>.
              </p>
            </div>
          )}

          {/* STEP 1: Ringing Agent Phone */}
          {callStatus === 'ringing_agent' && (
            <div className="text-center py-5 bg-card rounded-xl border border-warning/30 bg-warning/5 space-y-2 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-warning/20 text-warning flex items-center justify-center mx-auto animate-bounce">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-warning">Step 1 of 2: Ringing You</p>
                <p className="text-sm font-bold text-foreground mt-0.5">Pick up your phone ({agentNumber})</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Incoming call from Virtual DID <code className="font-mono text-primary">{SMARTFLO_CONFIG.pilotNumber}</code>
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Waiting for agent pickup...</span>
              </div>
            </div>
          )}

          {/* STEP 2: Agent Picked Up, Customer is Ringing */}
          {callStatus === 'bridging_customer' && (
            <div className="text-center py-5 bg-card rounded-xl border border-primary/30 bg-primary/5 space-y-2 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto animate-pulse">
                <PhoneCall className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 2 of 2: Calling Customer</p>
                <p className="text-sm font-bold text-foreground mt-0.5">Ringing {maskedCustomer}...</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Tata Smartflo is bridging customer to your call.
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Monitoring connection automatically...</span>
              </div>
            </div>
          )}

          {/* STEP 3: Live Connected Call with Timer */}
          {callStatus === 'connected' && (
            <div className="text-center py-5 bg-card rounded-xl border border-success/30 bg-success/5 space-y-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto animate-pulse">
                <PhoneCall className="w-7 h-7" />
              </div>
              <div>
                <p className="text-3xl font-mono font-extrabold text-foreground">{formatTimer(seconds)}</p>
                <p className="text-xs text-success font-semibold mt-1">Live call connected • Recording active 🔴</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Both parties bridged via {SMARTFLO_CONFIG.pilotNumber}
                </p>
              </div>
            </div>
          )}

          {/* OUTCOME A: CLIENT MISSED / REJECTED CALL (100% AUTOMATICALLY DETECTED) */}
          {callStatus === 'completed' && dispositionOutcome && dispositionOutcome !== 'connected' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="text-center py-4 bg-destructive/10 rounded-xl border border-destructive/30 space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-destructive/20 text-destructive flex items-center justify-center mx-auto">
                  <PhoneMissed className="w-6 h-6" />
                </div>
                <div>
                  <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">
                    {dispositionOutcome === 'rejected' ? 'Customer Rejected / Cut Call' :
                     dispositionOutcome === 'busy' ? 'Customer Line Busy' :
                     'Customer Did Not Answer'}
                  </Badge>
                  <p className="text-sm font-bold text-foreground mt-1.5">
                    {cdrReason || 'Call could not connect with customer'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ✓ Logged to CRM History &nbsp;•&nbsp; ✓ Follow-up counter updated automatically
                  </p>
                </div>
              </div>

              {/* AUTOMATED NEXT BEST ACTION */}
              <div className="bg-muted/60 rounded-xl p-3.5 border border-border/60 space-y-2.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <PhoneForwarded className="w-3.5 h-3.5 text-primary" />
                  Recommended Next Action for {leadName}:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    className="h-10 rounded-xl bg-success text-success-foreground hover:bg-success/90 text-xs gap-1.5 font-medium shadow-sm"
                    onClick={handleSendWhatsAppFollowup}
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp Follow-up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl text-xs gap-1.5 font-medium hover:bg-primary/10"
                    onClick={() => handleScheduleCallback(30)}
                  >
                    <RotateCcw className="w-4 h-4 text-primary" /> Call in 30 Mins
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={() => handleStartCall(false)}
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Retry / Redial Call Now
                </Button>
              </div>
            </div>
          )}

          {/* OUTCOME B: CALL CONNECTED & CONCLUDED */}
          {callStatus === 'completed' && dispositionOutcome === 'connected' && (
            <div className="text-center py-4 bg-success/10 rounded-xl border border-success/30 space-y-1.5 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">
                  Call Concluded ({formatTimer(seconds)})
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ✓ Spoke with client &nbsp;•&nbsp; ✓ Audio recording synced to CRM timeline
                </p>
              </div>

              {recordingUrl && (
                <div className="pt-2">
                  <audio controls className="w-full h-8 max-w-[280px] mx-auto" preload="metadata">
                    <source src={formatPlayableAudioUrl(recordingUrl)} type="audio/mpeg" />
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}
            </div>
          )}

          {/* Optional Call Notes (Always accessible for logging) */}
          {(callStatus === 'connected' || callStatus === 'completed') && (
            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                <span>Call Notes (Saved to CRM History):</span>
                {isAutoLogged && <span className="text-[10px] text-success">Saved</span>}
              </label>
              <Textarea
                placeholder="Client requested quote breakdown, will confirm over WhatsApp..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={2}
                className="text-xs rounded-xl resize-none"
              />
            </div>
          )}

          {/* Actions & Hangup Buttons */}
          <div className="flex gap-2 pt-1">
            {callStatus === 'idle' ? (
              <div className="w-full space-y-2">
                <Button
                  className="w-full h-11 rounded-xl gap-2 font-medium bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => handleStartCall(false)}
                >
                  <PhoneCall className="w-4 h-4" /> Start Call via Tata Smartflo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => handleStartCall(true)}
                >
                  Or run Simulation Test (Audio & Timer Demo)
                </Button>
              </div>
            ) : callStatus === 'ringing_agent' || callStatus === 'bridging_customer' ? (
              <Button
                variant="destructive"
                className="w-full h-11 rounded-xl gap-2 font-medium"
                onClick={handleCancelOrHangup}
              >
                <PhoneOff className="w-4 h-4" /> Cancel Call
              </Button>
            ) : callStatus === 'connected' ? (
              <Button
                variant="destructive"
                className="w-full h-11 rounded-xl gap-2 font-medium"
                onClick={handleCancelOrHangup}
              >
                <PhoneOff className="w-4 h-4" /> End Call
              </Button>
            ) : callStatus === 'completed' ? (
              <Button
                className="w-full h-11 rounded-xl font-medium"
                onClick={handleClose}
              >
                Done & Close
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={handleClose}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
