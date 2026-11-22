import { useNavigate } from 'react-router-dom';
import { Lead } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { ServiceBadge, LeadScoreIndicator, LeadStatusBadge } from '@/components/StatusBadges';
import { QuickActions } from '@/components/QuickActions';
import { MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface LeadCardProps {
  lead: Lead;
  compact?: boolean;
}

export const LeadCard = ({ lead, compact }: LeadCardProps) => {
  const navigate = useNavigate();
  const { addFollowUpToServer } = useCRM();

  const hasNoActivity = lead.status === 'NEW_LEAD' && (() => {
    try {
      const notes = lead.communication_notes
        ? (typeof lead.communication_notes === 'string' ? JSON.parse(lead.communication_notes) : lead.communication_notes)
        : {};
      const activityLogs = notes.activity_logs || [];
      const notesList = notes.notes || [];
      const callLogs = notes.call_logs || [];
      const meetings = notes.meetings || [];
      return activityLogs.length === 0 && notesList.length === 0 && callLogs.length === 0 && meetings.length === 0;
    } catch {
      return true;
    }
  })();

  return (
    <Card
      className={`p-3.5 cursor-pointer active:scale-[0.98] transition-all hover:shadow-md border-border/60 ${hasNoActivity ? 'bg-success/5 border-success/25' : ''}`}
      onClick={() => navigate(`/lead/${lead.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-sm truncate">{lead.name}</h3>
            <LeadScoreIndicator score={lead.lead_score} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.location}</span>
            <span>•</span>
            <span className="font-mono text-[10px]">{lead.custom_id}</span>
          </div>
        </div>
        {!compact && <LeadStatusBadge status={lead.status} />}
      </div>

      <div className="flex items-center gap-2 mb-2.5">
        <ServiceBadge service={lead.service} />
        {compact && <LeadStatusBadge status={lead.status} />}
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground ml-auto">
          <Clock className="w-3 h-3" />
          {(() => {
            const history = lead.followup_history ? (typeof lead.followup_history === 'string' ? JSON.parse(lead.followup_history) : lead.followup_history) : [];
            return history.length;
          })()}/6
        </span>
        <span className="text-[10px] text-muted-foreground">
          Updated: {format(new Date(lead.updated_at), 'dd MMM yyyy, hh:mm a')}
        </span>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <QuickActions 
          whatsapp_number={lead.whatsapp_number} 
          name={lead.name} 
          service={lead.service} 
          leadId={lead.id}
          compact 
          onFollowup={async (date, note) => {
            console.log('LeadCard: onFollowup triggered by QuickActions', { date, note });
            const history = lead.followup_history ? (typeof lead.followup_history === 'string' ? JSON.parse(lead.followup_history) : lead.followup_history) : [];
            const record = {
              attempt: history.length + 1,
              type: 'call',
              scheduled_at: date.toISOString(),
              completed: false,
              note: note
            };
            toast.promise(addFollowUpToServer(lead.id, record), {
              loading: 'Scheduling follow-up...',
              success: 'Follow-up scheduled!',
              error: 'Failed to schedule'
            });
          }}
        />
      </div>
    </Card>
  );
};
