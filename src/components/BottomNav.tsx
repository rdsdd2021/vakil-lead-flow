import { NavLink, useLocation } from 'react-router-dom';
import { Users, Columns3, Clock, Ticket, MoreHorizontal, LayoutDashboard, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCRM } from '@/contexts/CRMContext';

export const BottomNav = () => {
  const location = useLocation();
  const { currentRole, isAuthenticated } = useCRM();

  if (!isAuthenticated) return null;

  // When a specific chat is open on /inbox on mobile, hide the bottom CRM nav bar
  // so the WhatsApp message composer and keyboard have full-screen space
  const searchParams = new URLSearchParams(location.search);
  const isInboxChatActive = location.pathname === '/inbox' && Boolean(searchParams.get('phone'));
  const navClass = cn(
    "fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-lg safe-area-bottom",
    isInboxChatActive && "hidden md:flex"
  );

  // Lawyer nav
  if (currentRole === 'lawyer') {
    return (
      <nav className={navClass}>
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {[
            { to: '/tickets', icon: Users, label: 'My Tickets' },
            { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
            { to: '/followups', icon: Clock, label: 'Follow-ups' },
            { to: '/more', icon: MoreHorizontal, label: 'More' },
          ].map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to === '/tickets' && location.pathname === '/');
            return (
              <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 min-w-[64px] py-1">
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    );
  }

  // Super admin nav
  if (currentRole === 'super_admin') {
    const tabs = [
      { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/leads', icon: Users, label: 'Leads' },
      { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
      { to: '/tickets', icon: Ticket, label: 'Tickets' },
      { to: '/more', icon: MoreHorizontal, label: 'More' },
    ];
    return (
      <nav className={navClass}>
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {tabs.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 min-w-[64px] py-1">
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    );
  }

  // Front desk nav
  const tabs = [
    { to: '/leads', icon: Users, label: 'Leads' },
    { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
    { to: '/pipeline', icon: Columns3, label: 'Pipeline' },
    { to: '/tickets', icon: Ticket, label: 'Tickets' },
    { to: '/more', icon: MoreHorizontal, label: 'More' },
  ];

  return (
    <nav className={navClass}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 min-w-[64px] py-1">
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
