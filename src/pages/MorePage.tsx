import { useCRM } from '@/contexts/CRMContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserRole } from '@/types/crm';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Ticket, Users, Shield, Briefcase, ChevronRight, LogOut, Bell, BellOff, BellRing, Loader2, PhoneIncoming } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { SmartfloDialplanSettings } from '@/components/SmartfloDialplanSettings';
import { toast } from 'sonner';

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  front_desk: 'Front Desk',
  lawyer: 'Lawyer',
};



const MorePage = () => {
  const { currentRole, currentUser, logout, isAuthenticated, updateCurrentUserPhone } = useCRM();
  const navigate = useNavigate();
  
  const { status: pushStatus, isSupported, subscribe, unsubscribe } = usePushNotifications(
    currentUser.id,
    currentRole,
    isAuthenticated
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleToggleNotifications = async () => {
    if (pushStatus === 'subscribed') {
      const success = await unsubscribe();
      if (success) {
        toast.success('Notifications disabled');
      } else {
        toast.error('Failed to disable notifications');
      }
    } else {
      const success = await subscribe();
      if (success) {
        toast.success('Notifications enabled! You\'ll receive alerts for new leads & tickets.');
      } else if (pushStatus === 'denied') {
        toast.error('Notifications blocked by browser. Please enable in your browser settings.', {
          duration: 5000,
        });
      } else {
        toast.error('Failed to enable notifications');
      }
    }
  };

  const menuItems = [
    ...(currentRole !== 'lawyer' ? [{ label: 'Tickets', icon: <Ticket className="w-4 h-4" />, onClick: () => navigate('/tickets') }] : []),
    ...(currentRole === 'super_admin' ? [
      { label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, onClick: () => navigate('/analytics') },
      { label: 'Team Management', icon: <Users className="w-4 h-4" />, onClick: () => navigate('/team') },
      { label: 'Audit Trail', icon: <Shield className="w-4 h-4" />, onClick: () => navigate('/audit') },
      { label: 'Pipeline', icon: <Briefcase className="w-4 h-4" />, onClick: () => navigate('/pipeline') },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b px-4 py-3">
        <h1 className="font-display font-bold text-lg">More</h1>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Current User Profile & Calling Mobile */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{currentUser.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{roleLabels[currentRole]} • {currentUser.email}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-foreground">Calling Phone (Smartflo 2-Way Ring)</p>
              <p className="text-xs font-mono text-primary font-semibold">
                +91 {currentUser.phone || '9800000001'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-lg px-2"
              onClick={() => {
                const val = prompt('Enter your 10-digit mobile number for Smartflo two-way calls:', currentUser.phone || '9800000001');
                if (val) {
                  const clean = val.replace(/\D/g, '').slice(-10);
                  if (clean.length === 10) {
                    updateCurrentUserPhone(clean);
                    toast.success(`Calling number updated to +91 ${clean}`);
                  } else {
                    toast.error('Please enter a valid 10-digit mobile number');
                  }
                }
              }}
            >
              Change
            </Button>
          </div>
        </Card>

        {/* Tata Smartflo Inbound Telephony (Method 2: Dynamic Dialplan) */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <PhoneIncoming className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Smartflo Inbound Routing</p>
                <p className="text-[11px] text-muted-foreground">DID: Configured Inbound DID • Method 2 (Dialplan)</p>
              </div>
            </div>
            <SmartfloDialplanSettings />
          </div>
        </Card>

        {/* Dedicated Lead Intake Portal */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Lead Intake Portal</p>
                <p className="text-[11px] text-muted-foreground">Public & staff client enquiry intake form</p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 rounded-xl text-xs gap-1.5"
              onClick={() => navigate('/intake')}
            >
              Open Form <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </Card>

        {/* Push Notification Settings */}
        {isSupported && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  pushStatus === 'subscribed' 
                    ? 'bg-success/10 text-success' 
                    : pushStatus === 'denied'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {pushStatus === 'subscribed' ? (
                    <BellRing className="w-5 h-5" />
                  ) : pushStatus === 'denied' ? (
                    <BellOff className="w-5 h-5" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Push Notifications</p>
                  <p className="text-[11px] text-muted-foreground">
                    {pushStatus === 'subscribed' && 'Enabled — you\'ll receive alerts'}
                    {pushStatus === 'prompt' && 'Get notified for new leads & tickets'}
                    {pushStatus === 'denied' && 'Blocked — enable in browser settings'}
                    {pushStatus === 'loading' && 'Checking...'}
                    {pushStatus === 'unsupported' && 'Not supported in this browser'}
                  </p>
                </div>
              </div>
              
              {pushStatus !== 'denied' && pushStatus !== 'unsupported' && (
                <Button
                  size="sm"
                  variant={pushStatus === 'subscribed' ? 'outline' : 'default'}
                  className="h-9 rounded-xl text-xs gap-1.5 shrink-0"
                  onClick={handleToggleNotifications}
                  disabled={pushStatus === 'loading'}
                >
                  {pushStatus === 'loading' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : pushStatus === 'subscribed' ? (
                    <>
                      <BellOff className="w-3.5 h-3.5" /> Disable
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" /> Enable
                    </>
                  )}
                </Button>
              )}
            </div>

            {pushStatus === 'denied' && (
              <div className="mt-3 bg-destructive/5 border border-destructive/10 rounded-lg p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Notifications are blocked. To enable:
                </p>
                <ol className="text-[11px] text-muted-foreground mt-1 ml-4 list-decimal space-y-0.5">
                  <li>Open browser settings</li>
                  <li>Go to Site Settings → Notifications</li>
                  <li>Allow notifications for this site</li>
                  <li>Refresh the page</li>
                </ol>
              </div>
            )}
          </Card>
        )}

        {/* Menu Items */}
        {menuItems.length > 0 && (
          <Card className="overflow-hidden">
            {menuItems.map((item, i) => (
              <button
                key={item.label}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm text-left hover:bg-muted/50 transition-colors ${i < menuItems.length - 1 ? 'border-b' : ''}`}
                onClick={item.onClick}
              >
                <span className="text-muted-foreground">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </Card>
        )}

        {/* Logout Button */}
        <div className="pt-4">
          <Button variant="destructive" className="w-full gap-2 rounded-xl h-12 font-medium" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MorePage;
