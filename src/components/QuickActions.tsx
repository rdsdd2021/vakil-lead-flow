import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageCircle, Link2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ServiceType, SERVICE_LABELS } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { SmartfloCallDialog } from '@/components/SmartfloCallDialog';
import { maskPhoneNumber } from '@/lib/smartflo';

interface QuickActionsProps {
  whatsapp_number: string;
  name: string;
  service?: ServiceType;
  leadId?: string;
  ticketId?: string;
  onPaymentLink?: () => void;
  onFollowup?: (date: Date, note?: string) => void;
  compact?: boolean;
}

export const QuickActions = ({ whatsapp_number, name, service, leadId, ticketId, onPaymentLink, onFollowup, compact }: QuickActionsProps) => {
  const navigate = useNavigate();
  const { addActivityLog, currentRole } = useCRM();
  const [followupDate, setFollowupDate] = useState<Date>();
  const [followupTime, setFollowupTime] = useState('09:00');
  const [followupNote, setFollowupNote] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  const serviceLabel = service ? SERVICE_LABELS[service] : undefined;
  const isSuperAdmin = currentRole === 'super_admin';

  const handleCall = () => {
    if (leadId) {
      setCallDialogOpen(true);
    } else {
      window.open(`tel:+${whatsapp_number}`, '_self');
    }
  };

  const handleWhatsAppClick = () => {
    const cleanNumber = whatsapp_number.replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');
    if (leadId) {
      addActivityLog(leadId, 'WhatsApp Initiated', `Opened Inbuilt WhatsApp chat for ${maskPhoneNumber(whatsapp_number, isSuperAdmin)}`);
    }
    navigate(`/inbox?phone=${cleanNumber}`);
  };

  const handlePaymentLink = () => {
    toast.success('Payment link copied to clipboard!', { description: `vakil.tech/pay/${name.toLowerCase().split(' ')[0]}` });
    onPaymentLink?.();
  };

  const handleScheduleFollowup = () => {
    if (!followupDate) {
      toast.error('Please select a date');
      return;
    }
    const finalDate = new Date(followupDate);
    if (followupTime) {
      const [hours, minutes] = followupTime.split(':').map(Number);
      finalDate.setHours(hours, minutes, 0, 0);
    }
    console.log('QuickActions: Invoking onFollowup prop with:', { finalDate, followupNote });
    onFollowup?.(finalDate, followupNote || undefined);
    toast.success('Follow-up scheduled!', {
      description: format(followupDate, 'PPP') + (followupNote ? ` — ${followupNote}` : ''),
    });
    setFollowupDate(undefined);
    setFollowupNote('');
    setPopoverOpen(false);
  };

  const whatsappButton = compact ? (
    <Button
      size="icon"
      variant="ghost"
      className="h-9 w-9 rounded-xl bg-success/10 text-success hover:bg-success/20"
      title="Open in Inbuilt WhatsApp"
      onClick={handleWhatsAppClick}
    >
      <MessageCircle className="w-4 h-4" />
    </Button>
  ) : (
    <Button
      className="h-11 rounded-xl bg-success text-success-foreground hover:bg-success/90 flex flex-col gap-0 px-1"
      onClick={handleWhatsAppClick}
      title="Open in Inbuilt WhatsApp"
    >
      <MessageCircle className="w-4 h-4" />
      <span className="text-[10px]">WhatsApp</span>
    </Button>
  );

  const followupButton = (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80">
            <CalendarIcon className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="h-11 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 flex flex-col gap-0 px-1">
            <CalendarIcon className="w-4 h-4" />
            <span className="text-[10px]">Follow-up</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center" side="top">
        <div className="p-3 space-y-3">
          <Calendar
            mode="single"
            selected={followupDate}
            onSelect={setFollowupDate}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            initialFocus
            className={cn("p-0 pointer-events-auto")}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground w-12">Time</span>
            <Input
              type="time"
              value={followupTime}
              onChange={(e) => setFollowupTime(e.target.value)}
              className="h-9 rounded-lg text-sm flex-1"
            />
          </div>
          <Textarea
            placeholder="Add a note (optional)"
            value={followupNote}
            onChange={(e) => setFollowupNote(e.target.value)}
            className="min-h-[44px] text-sm rounded-xl resize-none"
            rows={2}
          />
          <Button
            className="w-full h-10 rounded-xl"
            onClick={handleScheduleFollowup}
            disabled={!followupDate}
          >
            Schedule {followupDate ? format(followupDate, 'MMM d') : 'Follow-up'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  const callDialog = callDialogOpen && leadId ? (
    <SmartfloCallDialog
      open={callDialogOpen}
      onOpenChange={setCallDialogOpen}
      leadId={leadId}
      leadName={name}
      rawPhoneNumber={whatsapp_number}
      serviceName={serviceLabel}
    />
  ) : null;

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-success/10 text-success hover:bg-success/20" onClick={handleCall}>
            <Phone className="w-4 h-4" />
          </Button>
          {whatsappButton}
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20" onClick={handlePaymentLink}>
            <Link2 className="w-4 h-4" />
          </Button>
          {followupButton}
        </div>
        {callDialog}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Button className="h-11 rounded-xl bg-success text-success-foreground hover:bg-success/90 flex flex-col gap-0 px-1" onClick={handleCall}>
          <Phone className="w-4 h-4" />
          <span className="text-[10px]">Call</span>
        </Button>
        {whatsappButton}
        <Button className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex flex-col gap-0 px-1" onClick={handlePaymentLink}>
          <Link2 className="w-4 h-4" />
          <span className="text-[10px]">Pay Link</span>
        </Button>
        {followupButton}
      </div>
      {callDialog}
    </>
  );
};
