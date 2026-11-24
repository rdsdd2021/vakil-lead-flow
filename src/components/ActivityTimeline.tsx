import { ActivityLog } from '@/types/crm';
import { format } from 'date-fns';
import { Phone, MessageCircle, CreditCard, UserCheck, FileText, RefreshCw, CheckCircle2, Mic, Play, Download, PhoneOff, PhoneMissed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPlayableAudioUrl } from '@/lib/smartflo';

const actionIcons: Record<string, React.ReactNode> = {
  'Lead Created': <RefreshCw className="w-3.5 h-3.5" />,
  'Call Made': <Phone className="w-3.5 h-3.5 text-success" />,
  'Phone Call Connected': <Phone className="w-3.5 h-3.5 text-success" />,
  'Call Rejected': <PhoneOff className="w-3.5 h-3.5 text-destructive" />,
  'No Answer': <PhoneMissed className="w-3.5 h-3.5 text-warning" />,
  'Call Busy': <PhoneOff className="w-3.5 h-3.5 text-warning" />,
  'WhatsApp Sent': <MessageCircle className="w-3.5 h-3.5" />,
  'Payment Received': <CreditCard className="w-3.5 h-3.5" />,
  'Lawyer Assigned': <UserCheck className="w-3.5 h-3.5" />,
  'Draft Sent': <FileText className="w-3.5 h-3.5" />,
  'Work Completed': <CheckCircle2 className="w-3.5 h-3.5" />,
  'Status Changed': <RefreshCw className="w-3.5 h-3.5" />,
  'Note Added': <FileText className="w-3.5 h-3.5" />,
};

export const ActivityTimeline = ({ logs }: { logs: ActivityLog[] }) => {
  if (logs.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No activity yet</p>;

  return (
    <div className="space-y-0">
      {logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((log, i) => (
        <div key={log.id} className="flex gap-3 py-2.5">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${log.action === 'Call Made' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
              {actionIcons[log.action] || <RefreshCw className="w-3.5 h-3.5" />}
            </div>
            {i < logs.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="flex-1 pb-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold">{log.action}</p>
              {log.call_duration && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-mono">
                  {log.call_duration}
                </Badge>
              )}
              {log.recording_url && !log.action?.includes('Rejected') && !log.action?.includes('No Answer') && log.call_duration !== '0:00' && log.call_duration !== '00:00' && (
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 text-primary border-primary/30 bg-primary/5 gap-1">
                  <Mic className="w-2.5 h-2.5" /> Tata Smartflo Rec
                </Badge>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground mt-0.5">{log.details}</p>

            {/* In-CRM Call Recording Player */}
            {log.recording_url && !log.action?.includes('Rejected') && !log.action?.includes('No Answer') && log.call_duration !== '0:00' && log.call_duration !== '00:00' && (
              <div className="mt-2 p-2.5 bg-muted/50 rounded-xl border border-border/60 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <Play className="w-3 h-3 text-primary fill-primary" /> Audio Recording
                  </span>
                  <a
                    href={formatPlayableAudioUrl(log.recording_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="call-recording.mp3"
                    className="flex items-center gap-1 text-primary hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-3 h-3" /> Download MP3
                  </a>
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={formatPlayableAudioUrl(log.recording_url)}
                  className="w-full h-8 rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-1">
              {log.created_by} • {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
