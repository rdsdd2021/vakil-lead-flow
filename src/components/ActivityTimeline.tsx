import React from 'react';
import { ActivityLog } from '@/types/crm';
import { format } from 'date-fns';
import { Phone, MessageCircle, CreditCard, UserCheck, FileText, RefreshCw, CheckCircle2, Mic, PhoneOff, PhoneMissed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AudioRecordingPlayer } from '@/components/AudioRecordingPlayer';

const actionIcons: Record<string, React.ReactNode> = {
  'Lead Created': <RefreshCw className="w-3.5 h-3.5" />,
  'Call Made': <Phone className="w-3.5 h-3.5 text-success" />,
  'Phone Call Connected': <Phone className="w-3.5 h-3.5 text-success" />,
  'Call Rejected': <PhoneOff className="w-3.5 h-3.5 text-destructive" />,
  'No Answer': <PhoneMissed className="w-3.5 h-3.5 text-warning" />,
  'Call Busy': <PhoneOff className="w-3.5 h-3.5 text-warning" />,
  'WhatsApp Sent': <MessageCircle className="w-3.5 h-3.5" />,
  'WhatsApp Initiated': <MessageCircle className="w-3.5 h-3.5 text-success" />,
  'Payment Received': <CreditCard className="w-3.5 h-3.5 text-success" />,
  'Lawyer Assigned': <UserCheck className="w-3.5 h-3.5 text-primary" />,
  'Draft Sent': <FileText className="w-3.5 h-3.5" />,
  'Work Completed': <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  'Status Changed': <RefreshCw className="w-3.5 h-3.5 text-primary" />,
  'Note Added': <FileText className="w-3.5 h-3.5" />,
};

const formatSafeDate = (d?: string | null): string => {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return String(d);
  try {
    return format(parsed, 'dd MMM yyyy, hh:mm a');
  } catch {
    return String(d);
  }
};

export const ActivityTimeline = ({ logs }: { logs: ActivityLog[] }) => {
  if (!logs || logs.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No activity or call logs recorded yet</p>;
  }

  const sortedLogs = [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-0">
      {sortedLogs.map((log, i) => {
        const isCall = log.action === 'Call Made' || log.action === 'Phone Call Connected';
        const isCallMissed = log.action === 'No Answer' || log.action?.includes('Missed');
        const isCallRejected = log.action === 'Call Rejected' || log.action === 'Call Busy';

        const hasAudio = Boolean(
          log.recording_url &&
          !isCallMissed &&
          !isCallRejected &&
          log.call_duration !== '0:00' &&
          log.call_duration !== '00:00'
        );

        return (
          <div key={log.id || `log_${i}`} className="flex gap-3 py-2.5">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isCall
                    ? 'bg-success/10 text-success'
                    : isCallRejected
                    ? 'bg-destructive/10 text-destructive'
                    : isCallMissed
                    ? 'bg-warning/10 text-warning'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {actionIcons[log.action] || <RefreshCw className="w-3.5 h-3.5" />}
              </div>
              {i < sortedLogs.length - 1 && <div className="w-px flex-1 bg-border/60 mt-1" />}
            </div>

            <div className="flex-1 pb-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-foreground">{log.action}</p>
                {log.call_duration && log.call_duration !== '00:00' && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-mono font-medium">
                    {log.call_duration}
                  </Badge>
                )}
                {hasAudio && (
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 text-primary border-primary/30 bg-primary/5 gap-1">
                    <Mic className="w-2.5 h-2.5" /> Recording Available
                  </Badge>
                )}
              </div>

              {log.details && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{log.details}</p>
              )}

              {/* In-CRM Call Recording Player */}
              {hasAudio && log.recording_url && (
                <AudioRecordingPlayer
                  recordingUrl={log.recording_url}
                  callDuration={log.call_duration}
                  callId={log.id}
                />
              )}

              <p className="text-[10px] text-muted-foreground mt-1">
                {log.created_by || 'System'} • {formatSafeDate(log.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
