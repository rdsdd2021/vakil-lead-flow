import React, { useState, useEffect } from 'react';
import { useCRM } from '@/contexts/CRMContext';
import { PhoneCall, PhoneForwarded, X, Bell, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SmartfloCallDialog } from '@/components/SmartfloCallDialog';
import { maskPhoneNumber } from '@/lib/smartflo';

export interface CallbackAlert {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  service?: string;
  timestamp: string;
  reason: 'customer_callback' | 'agent_busy_missed';
}

export const CallbackNotificationBanner: React.FC = () => {
  const { leads, currentUser, currentRole } = useCRM();
  const [activeAlert, setActiveAlert] = useState<CallbackAlert | null>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  // In production, this can listen to WebSocket or Web Push events.
  // For easy testing and demonstration, we also expose a window helper `window.simulateSmartfloCallback`.
  useEffect(() => {
    (window as any).simulateSmartfloCallback = (reason: 'customer_callback' | 'agent_busy_missed' = 'agent_busy_missed') => {
      const targetLead = leads[0] || {
        id: 'lead_demo',
        name: 'Rajesh Kumar',
        whatsapp_number: '919876543210',
        service: 'legal-notice',
      };

      setActiveAlert({
        id: `alert_${Date.now()}`,
        leadId: targetLead.id,
        leadName: targetLead.name,
        phone: targetLead.whatsapp_number,
        service: targetLead.service,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reason,
      });
    };

    return () => {
      delete (window as any).simulateSmartfloCallback;
    };
  }, [leads]);

  if (!activeAlert) return null;

  const isSuperAdmin = currentRole === 'super_admin';
  const maskedPhone = maskPhoneNumber(activeAlert.phone, isSuperAdmin);

  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-card/95 backdrop-blur-xl border-2 border-primary/40 shadow-2xl rounded-2xl p-4 text-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                activeAlert.reason === 'agent_busy_missed' 
                  ? 'bg-destructive/15 text-destructive animate-pulse' 
                  : 'bg-primary/15 text-primary'
              }`}>
                {activeAlert.reason === 'agent_busy_missed' ? (
                  <Bell className="w-5 h-5" />
                ) : (
                  <PhoneForwarded className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold font-display uppercase tracking-wider text-primary">
                    {activeAlert.reason === 'agent_busy_missed'
                      ? '⚠️ Missed Callback (Agent Busy)'
                      : '📞 Incoming Callback'}
                  </h4>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 gap-0.5 border-primary/20 bg-primary/5">
                    <ShieldCheck className="w-2.5 h-2.5" /> Sticky Agent
                  </Badge>
                </div>
                <p className="text-sm font-semibold">{activeAlert.leadName}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {maskedPhone} • {activeAlert.timestamp}
                </p>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  {activeAlert.reason === 'agent_busy_missed'
                    ? `Customer called back on Tata Smartflo DID. Routed to you (${currentUser.name}) via Sticky Routing, but you were on another call.`
                    : 'Customer is calling back on the Tata Smartflo virtual number.'}
                </p>
              </div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg shrink-0 text-muted-foreground"
              onClick={() => setActiveAlert(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-2 mt-3 pt-2 border-t border-border/50">
            <Button
              size="sm"
              className="flex-1 h-9 rounded-xl bg-success text-success-foreground hover:bg-success/90 gap-1.5 font-medium text-xs"
              onClick={() => {
                setCallDialogOpen(true);
              }}
            >
              <PhoneCall className="w-3.5 h-3.5" /> Return Call Now (Masked)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl text-xs"
              onClick={() => setActiveAlert(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>

      {callDialogOpen && (
        <SmartfloCallDialog
          open={callDialogOpen}
          onOpenChange={(open) => {
            setCallDialogOpen(open);
            if (!open) setActiveAlert(null);
          }}
          leadId={activeAlert.leadId}
          leadName={activeAlert.leadName}
          rawPhoneNumber={activeAlert.phone}
          serviceName={activeAlert.service}
          onCallFinished={() => setActiveAlert(null)}
        />
      )}
    </>
  );
};
