import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileText, Shield, CheckCircle2, ArrowLeft, Phone, User, MapPin, 
  Mail, Clock, AlertCircle, Copy, ExternalLink, Sparkles, Building,
  Scale, Calendar, MessageCircle
} from 'lucide-react';
import { SERVICE_LABELS, ServiceType } from '@/types/crm';
import { SMARTFLO_CONFIG } from '@/lib/smartflo';
import { sendWhatsAppMessageApi } from '@/lib/kapso';
import vakiltechLogo from '@/assets/vakiltech-logo.png';
import { toast } from 'sonner';

export default function LeadIntake() {
  const { isAuthenticated, currentUser, addLeadToServer, users } = useCRM();
  const navigate = useNavigate();

  // Form State
  const [name, setName] = useState('');
  const [rawPhone, setRawPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [service, setService] = useState<ServiceType>('consultation');
  const [priority, setPriority] = useState<'standard' | 'high' | 'urgent'>('standard');
  const [matterTitle, setMatterTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preferredTime, setPreferredTime] = useState('morning');
  const [assignedLawyer, setAssignedLawyer] = useState<string>('unassigned');
  const [leadSource, setLeadSource] = useState('Direct Web Intake');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedLead, setSubmittedLead] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Available lawyers for assignment
  const lawyerOptions = (users || []).filter(u => u.role === 'lawyer');

  // Format phone to clean Indian number (+91)
  const formatPhone = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.startsWith('91') && clean.length > 10) {
      clean = clean.slice(2);
    }
    return clean.slice(0, 10);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRawPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter the client full name');
      return;
    }
    if (!rawPhone || rawPhone.length !== 10) {
      toast.error('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    if (!location.trim()) {
      toast.error('Please specify the client city / jurisdiction');
      return;
    }
    if (!description.trim()) {
      toast.error('Please provide a brief summary of the case or legal enquiry');
      return;
    }

    setIsSubmitting(true);

    const formattedPhone = `+91${rawPhone}`;
    const cleanSlug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15);
    const customId = `${cleanSlug}-${rawPhone.slice(-4)}`;

    const fullDescription = matterTitle.trim() 
      ? `[${matterTitle.trim()}] ${description.trim()} (Preferred Time: ${preferredTime})`
      : `${description.trim()} (Preferred Time: ${preferredTime})`;

    const initialActivityLog = {
      id: `act_${Date.now()}`,
      action: 'Lead Created',
      details: `Client enquiry submitted via Lead Intake Portal. Source: ${leadSource}. Preferred contact window: ${preferredTime}.`,
      created_by: isAuthenticated ? currentUser.name : 'Intake Portal',
      created_at: new Date().toISOString(),
    };

    const payload = {
      custom_id: customId,
      name: name.trim(),
      whatsapp_number: formattedPhone,
      location: location.trim(),
      service: service,
      description: fullDescription,
      payment_status: 'pending' as const,
      status: 'NEW_LEAD' as const,
      advance_amount: 0,
      mark_advance_paid: false,
      payment_amount: 0,
      payment_id: null,
      assigned_lawyer_id: assignedLawyer !== 'unassigned' ? assignedLawyer : null,
      lead_score: priority === 'urgent' ? 95 : priority === 'high' ? 85 : 70,
      followup_count: 0,
      followup_history: JSON.stringify([]),
      communication_notes: JSON.stringify({
        notes: [],
        call_logs: [],
        meetings: [],
        activity_logs: [initialActivityLog],
      }),
    };

    try {
      if (isAuthenticated && addLeadToServer) {
        await addLeadToServer(payload);
      } else {
        // Direct local storage persistence
        const raw = localStorage.getItem('vakil_leads') || '[]';
        let parsed = [];
        try { parsed = JSON.parse(raw); } catch (e) { parsed = []; }
        const completeLead = {
          id: `l_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...payload,
          status: 'NEW_LEAD',
        };
        localStorage.setItem('vakil_leads', JSON.stringify([completeLead, ...(Array.isArray(parsed) ? parsed : [])]));
        window.dispatchEvent(new Event('vakil_storage_sync'));
      }

      // Automated WhatsApp Enquiry Dispatch via Kapso AI
      try {
        await sendWhatsAppMessageApi({
          to: formattedPhone,
          templateName: 'enquiry_acknowledgement',
          text: `Thank you for contacting Vakiltech Legal Team. We have received your inquiry (Ref: ${customId}). Please reply to this message with any documents or details so our advocate can assist you.`,
          senderName: 'Vakiltech Intake Desk',
        });
      } catch (waErr) {
        console.warn('[Intake] Automated WhatsApp dispatch notice:', waErr);
      }

      setSubmittedLead({
        customId,
        name: name.trim(),
        phone: formattedPhone,
        service: SERVICE_LABELS[service] || service,
        location: location.trim(),
        priority,
      });

      toast.success('Legal enquiry registered successfully!');
    } catch (err: any) {
      console.error('Lead intake submission error:', err);
      toast.error('Failed to submit enquiry. Please verify your details or retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setName('');
    setRawPhone('');
    setEmail('');
    setLocation('');
    setService('consultation');
    setPriority('standard');
    setMatterTitle('');
    setDescription('');
    setPreferredTime('morning');
    setAssignedLawyer('unassigned');
    setSubmittedLead(null);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    toast.success('Intake form link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-muted/20 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b px-5 py-3 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg"
                onClick={() => navigate('/leads')}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <img src={vakiltechLogo} alt="Vakiltech" className="h-8 w-auto" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 hidden sm:inline-block">
              Intake Portal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="h-8 text-xs gap-1.5 rounded-lg"
            >
              {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
            </Button>

            {isAuthenticated ? (
              <Link to="/leads">
                <Button size="sm" variant="default" className="h-8 text-xs gap-1 rounded-lg">
                  <span>CRM Dashboard</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button size="sm" variant="ghost" className="h-8 text-xs rounded-lg">
                  Staff Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {submittedLead ? (
          /* Confirmation Screen */
          <Card className="p-6 text-center space-y-6 shadow-md border-border/80 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto ring-8 ring-success/5 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold font-display text-foreground">Enquiry Submitted Successfully!</h2>
              <p className="text-xs text-muted-foreground">
                The enquiry has been recorded in the Vakiltech Lead Flow CRM.
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4 border border-border/60 text-left space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-border/50">
                <span className="text-muted-foreground">Client Reference ID:</span>
                <span className="font-mono font-bold text-foreground text-sm">{submittedLead.customId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Client Name:</span>
                <span className="font-semibold text-foreground">{submittedLead.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Contact Number:</span>
                <span className="font-mono text-foreground">{submittedLead.phone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Required Service:</span>
                <Badge variant="outline" className="font-medium text-[11px] bg-primary/5 text-primary border-primary/20">
                  {submittedLead.service}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Location:</span>
                <span className="text-foreground">{submittedLead.location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Review Urgency:</span>
                <span className="font-semibold capitalize text-foreground">{submittedLead.priority} Priority</span>
              </div>
            </div>

            {/* WhatsApp Direct Messaging Channel */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-left space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    Connect on Official WhatsApp
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                      Direct Support
                    </Badge>
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Message our official legal desk to submit case documents, verify your identity, or talk with your assigned advocate.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-10 rounded-xl gap-2 shadow-sm"
                onClick={() => {
                  const text = encodeURIComponent(`Hi Vakiltech Legal Team, I have registered inquiry Ref: ${submittedLead.customId} regarding ${submittedLead.service}.`);
                  window.open(`https://wa.me/12084850645?text=${text}`, '_blank');
                }}
              >
                <MessageCircle className="w-4 h-4" />
                <span>Open WhatsApp Chat with Vakiltech (+1 208-485-0645)</span>
              </Button>
            </div>

            {/* Telephony Bridging Notice */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-left flex items-start gap-2.5">
              <Phone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground block mb-0.5">Tata Smartflo Telephony Enabled</span>
                When legal counsel calls this client, the call will bridge via Virtual DID <code className="font-mono font-semibold text-primary">{SMARTFLO_CONFIG.pilotNumber}</code> with automatic call recording and timeline logging.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button 
                onClick={handleReset} 
                variant="outline" 
                className="flex-1 h-10 text-xs rounded-xl"
              >
                Submit Another Enquiry
              </Button>
              {isAuthenticated && (
                <Button 
                  onClick={() => navigate('/leads')} 
                  className="flex-1 h-10 text-xs rounded-xl gap-1.5"
                >
                  <span>Go to Leads Dashboard</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </Card>
        ) : (
          /* Intake Form */
          <div className="space-y-5">
            {/* Intro Hero */}
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <Badge variant="outline" className="gap-1 text-[11px] bg-background text-primary border-primary/20">
                  <Scale className="w-3 h-3" /> Client Legal Intake
                </Badge>
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <Shield className="w-3 h-3 text-success" /> SSL Encrypted
                </Badge>
              </div>
              <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
                Legal Enquiry & Case Registration
              </h1>
              <p className="text-xs text-muted-foreground">
                Register a new client case or consultation enquiry directly into the CRM system.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Card 1: Contact Information */}
              <Card className="p-4 sm:p-5 space-y-4 shadow-sm border-border/80">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
                  <User className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">1. Client Contact Details</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Full Name <span className="text-destructive">*</span></span>
                    </label>
                    <Input
                      placeholder="e.g. Ramesh Chandra"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>WhatsApp / Phone Number <span className="text-destructive">*</span></span>
                      <span className="text-[10px] text-muted-foreground">10 Digits</span>
                    </label>
                    <div className="flex gap-1.5">
                      <span className="h-10 px-3 flex items-center justify-center bg-muted/60 border border-border rounded-xl text-xs font-mono font-medium text-muted-foreground">
                        +91
                      </span>
                      <Input
                        type="tel"
                        placeholder="9876543210"
                        value={rawPhone}
                        onChange={handlePhoneChange}
                        className="h-10 text-xs rounded-xl font-mono flex-1"
                        maxLength={10}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Email Address <span className="text-muted-foreground text-[10px] font-normal">(Optional)</span>
                    </label>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      City & Jurisdiction <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Delhi NCR, Kolkata, Bengaluru"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                      required
                    />
                  </div>
                </div>
              </Card>

              {/* Card 2: Legal Matter Details */}
              <Card className="p-4 sm:p-5 space-y-4 shadow-sm border-border/80">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
                  <Scale className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">2. Legal Matter Details</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Service Category <span className="text-destructive">*</span>
                    </label>
                    <Select value={service} onValueChange={(val: ServiceType) => setService(val)}>
                      <SelectTrigger className="h-10 text-xs rounded-xl">
                        <SelectValue placeholder="Select Service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consultation" className="text-xs">
                          Legal Consultation & Advisory (₹999)
                        </SelectItem>
                        <SelectItem value="legal-notice" className="text-xs">
                          Legal Notice & Demand Letter (₹1,499)
                        </SelectItem>
                        <SelectItem value="document-drafting" className="text-xs">
                          Document & Contract Drafting (₹2,499)
                        </SelectItem>
                        <SelectItem value="corporate-retainer" className="text-xs">
                          Corporate Retainer & Compliance
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Review Urgency
                    </label>
                    <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
                      <SelectTrigger className="h-10 text-xs rounded-xl">
                        <SelectValue placeholder="Select Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard" className="text-xs">
                          Standard Review (Within 24 Hours)
                        </SelectItem>
                        <SelectItem value="high" className="text-xs">
                          High Priority (Same-Day Response)
                        </SelectItem>
                        <SelectItem value="urgent" className="text-xs">
                          Urgent / Immediate Hearing
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Matter Subject / Title
                  </label>
                  <Input
                    placeholder="e.g. Eviction notice for commercial tenant with unpaid dues"
                    value={matterTitle}
                    onChange={(e) => setMatterTitle(e.target.value)}
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Case Summary & Facts <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="Explain the background of the legal dispute, timeline of events, relevant documents available, and specific relief sought..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="text-xs rounded-xl resize-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Preferred Callback Window
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'morning', label: 'Morning', time: '10 AM - 1 PM' },
                      { id: 'afternoon', label: 'Afternoon', time: '2 PM - 5 PM' },
                      { id: 'evening', label: 'Evening', time: '5 PM - 8 PM' },
                    ].map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setPreferredTime(slot.id)}
                        className={`p-2 rounded-xl text-left border transition-all ${
                          preferredTime === slot.id
                            ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                            : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <p className="text-xs font-medium">{slot.label}</p>
                        <p className="text-[10px] text-muted-foreground">{slot.time}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Card 3: Staff & Intake Routing (Visible when authenticated) */}
              {isAuthenticated && (
                <Card className="p-4 sm:p-5 space-y-4 shadow-sm border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 border-b border-primary/20 pb-2.5">
                    <Building className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold text-foreground">3. Internal Intake Routing</h2>
                    <Badge variant="outline" className="ml-auto text-[10px] bg-primary/10 text-primary border-primary/30">
                      Staff Options
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Assign Directly to Lawyer
                      </label>
                      <Select value={assignedLawyer} onValueChange={setAssignedLawyer}>
                        <SelectTrigger className="h-10 text-xs rounded-xl bg-background">
                          <SelectValue placeholder="Unassigned (Front Desk Queue)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned" className="text-xs">
                            Unassigned (Front Desk Queue)
                          </SelectItem>
                          {lawyerOptions.map((lawyer) => (
                            <SelectItem key={lawyer.id} value={lawyer.id} className="text-xs">
                              {lawyer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Lead Source
                      </label>
                      <Select value={leadSource} onValueChange={setLeadSource}>
                        <SelectTrigger className="h-10 text-xs rounded-xl bg-background">
                          <SelectValue placeholder="Select Source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Direct Web Intake" className="text-xs">Direct Web Intake</SelectItem>
                          <SelectItem value="Phone Inbound (Tata Smartflo)" className="text-xs">Phone Inbound (DID)</SelectItem>
                          <SelectItem value="WhatsApp Enquiry" className="text-xs">WhatsApp Enquiry</SelectItem>
                          <SelectItem value="Client Referral" className="text-xs">Client Referral</SelectItem>
                          <SelectItem value="Lawyer Direct Intake" className="text-xs">Lawyer Direct Intake</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-xl text-sm font-semibold shadow-md gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Registering Enquiry...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Register Legal Enquiry</span>
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  All submissions are synced in real-time to the Vakiltech AWS database.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
