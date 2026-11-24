import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  PhoneIncoming, ArrowRight, ShieldCheck, CheckCircle2, Copy, 
  ExternalLink, Users, Sparkles, Terminal, PhoneCall, HelpCircle
} from 'lucide-react';
import { useCRM } from '@/contexts/CRMContext';
import { 
  SMARTFLO_CONFIG, 
  simulateSmartfloInboundDialplan, 
  AGENT_PHONE_DIRECTORY,
  maskPhoneNumber,
  getSmartfloDID,
  setSmartfloDID
} from '@/lib/smartflo';
import { toast } from 'sonner';

export const SmartfloDialplanSettings: React.FC<{ triggerButton?: React.ReactNode }> = ({ triggerButton }) => {
  const { leads, currentRole } = useCRM();
  const [testNumber, setTestNumber] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [pilotDID, setPilotDID] = useState<string>(() => getSmartfloDID());
  const [didInput, setDidInput] = useState<string>(() => getSmartfloDID());
  const [isEditingDID, setIsEditingDID] = useState(false);

  const isSuperAdmin = currentRole === 'super_admin';

  const handleSaveDID = () => {
    const clean = didInput.replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      toast.error('Please enter a valid 10 to 12 digit Tata Virtual DID');
      return;
    }
    setSmartfloDID(clean);
    setPilotDID(clean);
    setIsEditingDID(false);
    toast.success(`Virtual DID updated to ${clean}`);
  };

  // The Webhook URL to configure in Tata Smartflo Portal
  const webhookUrl = 'https://vakil-lead-flow-main.vercel.app/api/dialplan';

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunSimulation = () => {
    if (!testNumber.trim()) {
      toast.error('Please enter a phone number to test');
      return;
    }
    const result = simulateSmartfloInboundDialplan(testNumber.trim(), leads);
    setTestResult(result);
    toast.success('Dialplan evaluated successfully!');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" size="sm" className="gap-2 rounded-xl text-xs font-medium">
            <PhoneIncoming className="w-3.5 h-3.5 text-primary" />
            Inbound Routing (Method 2)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="gap-1.5 py-1 px-2.5 bg-primary/5 text-primary border-primary/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Tata Tele Smartflo Cloud Telephony
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              Method 2: Dynamic API Dialplan
            </Badge>
          </div>
          <DialogTitle className="text-lg font-bold mt-2">
            Dynamic Lead Ownership Routing
          </DialogTitle>
          <DialogDescription className="text-xs">
            When a customer dials Virtual DID <code className="font-mono font-semibold text-foreground">{pilotDID}</code>, Tata Smartflo checks your CRM database and dynamically forwards the call directly to the agent who owns that lead.
          </DialogDescription>
        </DialogHeader>

        {/* Virtual DID Quick Manager */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 my-2 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>Active Virtual DID (Pilot Number):</span>
            </span>
            <div className="flex items-center gap-2">
              <code className="font-mono font-bold text-primary text-sm">{pilotDID}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingDID(!isEditingDID)}
                className="h-6 px-2 text-[11px] text-primary"
              >
                {isEditingDID ? 'Cancel' : 'Edit DID'}
              </Button>
            </div>
          </div>
          {isEditingDID && (
            <div className="pt-2 border-t border-primary/20 space-y-1.5">
              <label className="text-[11px] text-muted-foreground block">
                Update Tata Tele Virtual Pilot DID:
              </label>
              <div className="flex gap-2">
                <Input
                  value={didInput}
                  onChange={(e) => setDidInput(e.target.value)}
                  placeholder="e.g. 917965561294"
                  className="h-8 text-xs font-mono rounded-lg bg-background"
                />
                <Button size="sm" className="h-8 text-xs px-3" onClick={handleSaveDID}>
                  Save DID
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Saved to browser storage & immediately applies to all inbound & outbound routes.
              </p>
            </div>
          )}
        </div>

        <Tabs defaultValue="simulator" className="mt-3">
          <TabsList className="grid grid-cols-3 h-10 p-1 bg-muted/60 rounded-xl">
            <TabsTrigger value="simulator" className="text-xs rounded-lg gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Test Simulator
            </TabsTrigger>
            <TabsTrigger value="directory" className="text-xs rounded-lg gap-1.5">
              <Users className="w-3.5 h-3.5" /> Agent Directory
            </TabsTrigger>
            <TabsTrigger value="setup" className="text-xs rounded-lg gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> Portal Setup
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Live Dialplan Tester */}
          <TabsContent value="simulator" className="space-y-4 pt-3">
            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60 space-y-3">
              <label className="text-xs font-semibold text-foreground block">
                Simulate Customer Calling In:
              </label>
              <div className="flex gap-2">
                <Input
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="e.g. +91 99330 07663 or +91 83686 45299"
                  className="h-10 text-xs rounded-xl font-mono"
                />
                <Button 
                  onClick={handleRunSimulation} 
                  className="h-10 rounded-xl text-xs gap-1.5 px-4 font-medium"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Test Route
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tip: Enter any customer phone number to simulate how Tata Smartflo resolves ownership in real time.
              </p>
            </div>

            {testResult && (
              <div className="bg-card rounded-xl border border-primary/20 p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <span className="text-xs font-semibold text-foreground">Routing Decision:</span>
                  <Badge variant="outline" className="text-[11px] bg-success/10 text-success border-success/30 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Successfully Resolved
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/40">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Matched Customer</span>
                    <p className="font-bold text-foreground mt-0.5">
                      {testResult.matchedLead ? testResult.matchedLead.name : 'Unknown Inbound Caller'}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {maskPhoneNumber(testResult.callerId, isSuperAdmin)}
                    </p>
                  </div>

                  <div className="bg-primary/5 p-2.5 rounded-lg border border-primary/20">
                    <span className="text-primary block text-[10px] uppercase font-semibold">Incoming Call Lands On</span>
                    <p className="font-bold text-foreground mt-0.5">
                      {testResult.targetAgent.name}
                    </p>
                    <p className="font-mono text-[11px] text-primary font-semibold">
                      +{testResult.targetAgent.phone}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 p-2.5 rounded-lg text-xs space-y-1">
                  <span className="text-muted-foreground text-[10px] font-semibold uppercase block">Routing Rule Reason:</span>
                  <p className="text-foreground font-medium">{testResult.targetAgent.reason}</p>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Raw JSON Returned to Tata Smartflo Telephony Switch:
                  </span>
                  <pre className="bg-muted/80 p-2.5 rounded-lg text-[11px] font-mono overflow-x-auto text-foreground border border-border/60">
                    {JSON.stringify(testResult.smartfloResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Agent Directory */}
          <TabsContent value="directory" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              When a lead owned by an agent calls your company DID, Smartflo immediately dials their assigned phone number:
            </p>

            <div className="space-y-2">
              {Object.entries(AGENT_PHONE_DIRECTORY).map(([id, agent]) => (
                <Card key={id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-foreground">{agent.name}</p>
                    <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="font-mono font-medium">
                      +{agent.phone}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              * In production, this directory is dynamically queried from your MySQL `users` table or environment variables.
            </p>
          </TabsContent>

          {/* TAB 3: Portal Setup Instructions */}
          <TabsContent value="setup" className="space-y-3 pt-3">
            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60 space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Your API Dialplan Webhook URL:
              </span>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="h-9 text-xs font-mono bg-background"
                />
                <Button size="sm" onClick={handleCopyWebhook} className="h-9 gap-1 text-xs px-3">
                  <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-semibold text-foreground">How to Enable in Tata Smartflo Portal:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                <li>Log in to <strong className="text-foreground">https://cloudphone.tatateleservices.com</strong></li>
                <li>Go to <strong className="text-foreground">Inbound Services &gt; Inbound Routing / DIDs</strong></li>
                <li>Click <strong>Edit</strong> on Virtual DID <strong className="text-foreground font-mono">{pilotDID}</strong></li>
                <li>Set Destination Type to <strong className="text-foreground">API Dialplan</strong> (or Inbound Webhook)</li>
                <li>Paste your Webhook URL: <code className="text-primary font-mono">{webhookUrl}</code></li>
                <li>Set Failover Destination to <strong className="text-foreground">Reception / General Queue</strong> (for busy/unanswered calls)</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
