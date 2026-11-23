import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PRE_APPROVED_TEMPLATES, PreApprovedTemplate, sendWhatsAppMessageApi } from '@/lib/kapso';
import { Sparkles, Send, CheckCircle2, AlertCircle, FileText, Globe, Code, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface WhatsAppTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPhone: string;
  clientName: string;
  serviceTitle?: string;
  leadId?: string;
  ticketId?: string;
  senderId?: string;
  senderName?: string;
  onTemplateSent?: (message: any) => void;
}

export const WhatsAppTemplateModal: React.FC<WhatsAppTemplateModalProps> = ({
  open,
  onOpenChange,
  recipientPhone,
  clientName,
  serviceTitle,
  leadId,
  ticketId,
  senderId,
  senderName,
  onTemplateSent,
}) => {
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('hello_world');
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({
    'Client Name': clientName || '',
    'Service Name': serviceTitle || 'Legal Query',
    'Matter Title': serviceTitle || 'Legal Notice',
    'Court / Matter Title': serviceTitle || 'Case Proceedings',
    'Legal Service': serviceTitle || 'Legal Documentation',
  });
  const [isSending, setIsSending] = useState(false);

  const activeTemplate = PRE_APPROVED_TEMPLATES.find(t => t.name === selectedTemplateName);

  // Compute live preview text with variables replaced
  const getComputedPreview = () => {
    if (selectedTemplateName === 'custom') {
      return `[Custom Meta Template: ${customTemplateName || 'template_name'}]`;
    }
    if (!activeTemplate) return '';
    let text = activeTemplate.preview;
    activeTemplate.variables.forEach((v, index) => {
      const placeholder = `{{${index + 1}}}`;
      const val = variableValues[v] || clientName || `[${v}]`;
      text = text.replace(placeholder, val);
    });
    return text;
  };

  const handleSend = async () => {
    const finalTemplateName = selectedTemplateName === 'custom' ? customTemplateName.trim() : selectedTemplateName;
    if (!finalTemplateName) {
      toast.error('Please specify a valid Meta WhatsApp template name');
      return;
    }

    setIsSending(true);

    // Prepare parameters for Meta Cloud API
    const parameters: string[] = [];
    if (activeTemplate && activeTemplate.variables.length > 0) {
      activeTemplate.variables.forEach(v => {
        parameters.push(variableValues[v] || clientName || 'Client');
      });
    }

    try {
      const res = await sendWhatsAppMessageApi({
        leadId,
        ticketId,
        to: recipientPhone,
        templateName: finalTemplateName,
        templateLanguage: languageCode,
        templateParameters: parameters.length > 0 ? parameters : undefined,
        senderId,
        senderName,
      });

      if (res.success) {
        toast.success(`Pre-approved template "${finalTemplateName}" sent successfully!`);
        if (onTemplateSent) onTemplateSent(res.message);
        onOpenChange(false);
      } else {
        toast.error(res.error || 'Failed to dispatch WhatsApp template');
      }
    } catch (err: any) {
      toast.error('Error sending template: ' + (err.message || 'Network error'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl p-5 bg-card border border-border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Send Pre-Approved WhatsApp Template
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Required by Meta for initiating contact outside the 24-hour service window.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          
          {/* Template Selector Pills / Radio */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Select Meta Registered Template</span>
              <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-mono">
                Official Meta API
              </Badge>
            </label>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {PRE_APPROVED_TEMPLATES.map(tpl => (
                <div
                  key={tpl.name}
                  onClick={() => {
                    setSelectedTemplateName(tpl.name);
                    setLanguageCode(tpl.language);
                  }}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedTemplateName === tpl.name
                      ? 'bg-emerald-500/10 border-emerald-500 text-foreground font-semibold shadow-2xs'
                      : 'bg-muted/30 border-border/70 hover:bg-muted/60 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      {tpl.title}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono">
                      {tpl.name}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">
                    {tpl.description}
                  </p>
                </div>
              ))}

              {/* Custom registered template option */}
              <div
                onClick={() => setSelectedTemplateName('custom')}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  selectedTemplateName === 'custom'
                    ? 'bg-emerald-500/10 border-emerald-500 text-foreground font-semibold shadow-2xs'
                    : 'bg-muted/30 border-border/70 hover:bg-muted/60 text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-primary" />
                    Custom Meta Template
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                    Any Registered Name
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">
                  Send any custom template already approved in your Meta Business Suite.
                </p>
              </div>
            </div>
          </div>

          {/* Custom Template Input Field */}
          {selectedTemplateName === 'custom' && (
            <div className="space-y-1 p-3 bg-muted/40 rounded-xl border border-border">
              <label className="text-xs font-semibold text-foreground">Custom Template Name *</label>
              <Input
                value={customTemplateName}
                onChange={e => setCustomTemplateName(e.target.value)}
                placeholder="e.g. appointment_confirmation or notice_alert"
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {/* Dynamic Variable Inputs */}
          {activeTemplate && activeTemplate.variables.length > 0 && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-xl border border-border">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Template Parameters / Variables:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeTemplate.variables.map((variable, idx) => (
                  <div key={variable} className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">
                      Variable {`{{${idx + 1}}}`} ({variable})
                    </label>
                    <Input
                      value={variableValues[variable] || ''}
                      onChange={e => setVariableValues({ ...variableValues, [variable]: e.target.value })}
                      placeholder={`Enter ${variable}`}
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Preview Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
              <span>Live WhatsApp Message Preview:</span>
            </label>
            <div className="p-3 bg-emerald-600/10 border border-emerald-500/30 rounded-xl text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {getComputedPreview()}
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              Language Code:
            </span>
            <select
              value={languageCode}
              onChange={e => setLanguageCode(e.target.value)}
              className="bg-card text-foreground border border-border rounded-lg px-2 py-1 text-xs font-mono"
            >
              <option value="en_US">en_US (English US)</option>
              <option value="en">en (English)</option>
              <option value="hi">hi (Hindi)</option>
              <option value="mr">mr (Marathi)</option>
              <option value="bn">bn (Bengali)</option>
              <option value="ta">ta (Tamil)</option>
            </select>
          </div>

        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="h-9 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSending ? 'Sending to Meta...' : 'Send WhatsApp Template'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
