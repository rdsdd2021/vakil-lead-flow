import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { usePushNotifications, PushStatus } from '@/hooks/usePushNotifications';
import { useCRM } from '@/contexts/CRMContext';
import { toast } from 'sonner';

/**
 * A dismissable banner that prompts users to enable push notifications.
 * Shows only once per session when:
 *  - User is authenticated
 *  - Push is supported
 *  - Permission hasn't been requested yet (status === 'prompt')
 *  - User hasn't dismissed it in this session
 */
export const NotificationPrompt = () => {
  const { currentUser, currentRole, isAuthenticated } = useCRM();
  const { status, subscribe } = usePushNotifications(
    currentUser.id,
    currentRole,
    isAuthenticated
  );
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Show prompt after a short delay (don't interrupt immediately)
  useEffect(() => {
    if (isAuthenticated && status === 'prompt' && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 3000); // 3s delay
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isAuthenticated, status, dismissed]);

  if (!visible) return null;

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      toast.success('Notifications enabled!');
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] animate-in slide-in-from-top duration-300">
      <div className="bg-primary text-primary-foreground px-4 py-3 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
            <Bell className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Enable Notifications</p>
            <p className="text-[11px] text-primary-foreground/80">Get alerts for new leads, tickets & follow-ups</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 rounded-lg text-xs px-3 shrink-0"
            onClick={handleEnable}
          >
            Enable
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-primary-foreground/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
