import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { CRMUser, UserRole } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  ArrowLeft, Plus, Users, Shield, Briefcase, Ticket, 
  CheckCircle, Clock, AlertTriangle, Phone, Mail, 
  Search, Edit2, Trash2, UserPlus, Scale, CheckCircle2, 
  Sparkles, Info, ChevronRight, UserCheck, PhoneCall
} from 'lucide-react';
import { TicketStatusBadge, ServiceBadge } from '@/components/StatusBadges';
import { toast } from 'sonner';

type RoleFilter = 'all' | 'lawyer' | 'front_desk' | 'super_admin';

export const TeamManagement: React.FC = () => {
  const navigate = useNavigate();
  const { users, tickets, currentRole, addUserToServer, updateUserInServer, deleteUserFromServer } = useCRM();

  // State
  const [selectedRoleTab, setSelectedRoleTab] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CRMUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<CRMUser | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'lawyer' as UserRole,
    specialization: '',
    status: 'active' as 'active' | 'inactive',
  });

  const isSuperAdmin = currentRole === 'super_admin';

  // Role Badges Config
  const roleBadges: Record<UserRole, { label: string; bg: string; text: string; icon: any }> = {
    super_admin: { label: 'Super Admin', bg: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-600 dark:text-purple-400', icon: Shield },
    front_desk: { label: 'Front Desk', bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', icon: Users },
    lawyer: { label: 'Advocate / Lawyer', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', icon: Scale },
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'lawyer',
      specialization: '',
      status: 'active',
    });
    setEditingUser(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user: CRMUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      specialization: user.specialization || '',
      status: user.status || 'active',
    });
    setIsAddModalOpen(true);
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Please enter a valid name and email address.');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '').slice(-10);

    try {
      if (editingUser) {
        await updateUserInServer(editingUser.id, {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: cleanPhone || '9800000001',
          role: formData.role,
          specialization: formData.specialization.trim(),
          status: formData.status,
        });
        toast.success(`User "${formData.name}" updated successfully.`);
      } else {
        await addUserToServer({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: cleanPhone || '9800000001',
          role: formData.role,
          specialization: formData.specialization.trim(),
          status: formData.status,
        });
        toast.success(`New team member "${formData.name}" added to the firm.`);
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      toast.error('Failed to save team member: ' + (err.message || 'Error'));
    }
  };

  // Delete User Confirmation
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserFromServer(userToDelete.id);
      toast.success(`User "${userToDelete.name}" removed from the system.`);
      setUserToDelete(null);
    } catch (err: any) {
      toast.error('Failed to remove user: ' + (err.message || 'Error'));
    }
  };

  // Filtered and enriched users
  const enrichedUsers = useMemo(() => {
    return users.map(user => {
      const cases = tickets.filter(t => t.lawyer_id === user.id);
      const active = cases.filter(t => !['ARCHIVED', 'WORK_COMPLETED'].includes(t.status));
      const completed = cases.filter(t => ['ARCHIVED', 'WORK_COMPLETED'].includes(t.status));
      const pending = cases.filter(t => t.status === 'PENDING_APPROVAL');
      const revenue = cases.reduce((s, t) => s + (Number(t.advance_paid) || 0), 0);
      return { ...user, cases, active, completed, pending, revenue };
    });
  }, [users, tickets]);

  const filteredUsers = useMemo(() => {
    return enrichedUsers.filter(u => {
      if (selectedRoleTab !== 'all' && u.role !== selectedRoleTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesPhone = (u.phone || '').includes(q);
        const matchesSpec = (u.specialization || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesSpec) return false;
      }
      return true;
    });
  }, [enrichedUsers, selectedRoleTab, searchQuery]);

  return (
    <div className="min-h-screen bg-background pb-20">
      
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b px-4 py-3.5 shadow-xs">
        <div className="flex items-center justify-between max-w-4xl mx-auto gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">Team & User Management</h1>
              <p className="text-xs text-muted-foreground">
                {users.length} registered team members • Role-based access control
              </p>
            </div>
          </div>

          {/* Add Team Member Button */}
          <Button
            size="sm"
            onClick={handleOpenAdd}
            className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-xs text-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
        
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 text-center border-border/80">
            <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{users.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Staff</p>
          </Card>
          <Card className="p-3 text-center border-border/80">
            <Scale className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
            <p className="text-xl font-bold text-emerald-600">
              {users.filter(u => u.role === 'lawyer').length}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Advocates</p>
          </Card>
          <Card className="p-3 text-center border-border/80">
            <Users className="w-4 h-4 mx-auto mb-1 text-blue-600" />
            <p className="text-xl font-bold text-blue-600">
              {users.filter(u => u.role === 'front_desk').length}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Front Desk</p>
          </Card>
          <Card className="p-3 text-center border-border/80">
            <Shield className="w-4 h-4 mx-auto mb-1 text-purple-600" />
            <p className="text-xl font-bold text-purple-600">
              {users.filter(u => u.role === 'super_admin').length}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Super Admins</p>
          </Card>
        </div>

        {/* Search & Role Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border/80 shadow-xs">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone, or specialization..."
              className="pl-9 h-9 text-xs bg-muted/40 border-border/60 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `All (${users.length})` },
              { id: 'lawyer', label: `Advocates (${users.filter(u => u.role === 'lawyer').length})` },
              { id: 'front_desk', label: `Front Desk (${users.filter(u => u.role === 'front_desk').length})` },
              { id: 'super_admin', label: `Admins (${users.filter(u => u.role === 'super_admin').length})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedRoleTab(tab.id as RoleFilter)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${
                  selectedRoleTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          {filteredUsers.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No team members found</p>
              <p className="text-xs text-muted-foreground mt-1">Try another search keyword or add a new team member.</p>
            </Card>
          ) : (
            filteredUsers.map(user => {
              const roleConfig = roleBadges[user.role] || roleBadges.front_desk;
              const RoleIcon = roleConfig.icon;

              return (
                <Card key={user.id} className="p-4.5 border-border/80 hover:shadow-xs transition-shadow space-y-3">
                  
                  {/* Member Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary/20 to-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-base shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                          <Badge variant="outline" className={`text-[10px] h-4.5 px-2 ${roleConfig.bg} ${roleConfig.text} font-medium flex items-center gap-1`}>
                            <RoleIcon className="w-3 h-3" />
                            {roleConfig.label}
                          </Badge>
                          {user.status === 'inactive' && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {user.email}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5" />
                            {user.phone || 'No phone set'}
                          </span>
                          {user.specialization && (
                            <span className="text-[11px] bg-muted px-2 py-0.5 rounded-md font-medium text-foreground/80">
                              ⚖️ {user.specialization}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Edit / Delete Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEdit(user)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary rounded-lg"
                        title="Edit User"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setUserToDelete(user)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                        title="Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Caseload Stats for Lawyers */}
                  {user.role === 'lawyer' && (
                    <>
                      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border/50">
                        <div className="text-center p-2 bg-info/5 rounded-xl border border-info/10">
                          <Ticket className="w-3.5 h-3.5 mx-auto mb-0.5 text-info" />
                          <p className="text-sm font-bold">{user.active.length}</p>
                          <p className="text-[9px] text-muted-foreground">Active</p>
                        </div>
                        <div className="text-center p-2 bg-warning/5 rounded-xl border border-warning/10">
                          <Clock className="w-3.5 h-3.5 mx-auto mb-0.5 text-warning" />
                          <p className="text-sm font-bold">{user.pending.length}</p>
                          <p className="text-[9px] text-muted-foreground">Pending</p>
                        </div>
                        <div className="text-center p-2 bg-success/5 rounded-xl border border-success/10">
                          <CheckCircle className="w-3.5 h-3.5 mx-auto mb-0.5 text-success" />
                          <p className="text-sm font-bold">{user.completed.length}</p>
                          <p className="text-[9px] text-muted-foreground">Done</p>
                        </div>
                        <div className="text-center p-2 bg-primary/5 rounded-xl border border-primary/10">
                          <Briefcase className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                          <p className="text-sm font-bold">{user.cases.length}</p>
                          <p className="text-[9px] text-muted-foreground">Total</p>
                        </div>
                      </div>

                      {/* Active Tickets List */}
                      {user.active.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Assigned Active Cases
                          </p>
                          {user.active.slice(0, 3).map(ticket => (
                            <button
                              key={ticket.ticket_id}
                              onClick={() => navigate(`/ticket/${ticket.ticket_id}`)}
                              className="w-full flex items-center justify-between p-2 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors text-left text-xs"
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="font-semibold text-foreground truncate">{ticket.client_name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{ticket.ticket_id}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <ServiceBadge service={ticket.service_type} />
                                <TicketStatusBadge status={ticket.status} />
                              </div>
                            </button>
                          ))}
                          {user.active.length > 3 && (
                            <p className="text-[10px] text-muted-foreground text-center pt-0.5">
                              + {user.active.length - 3} more assigned cases
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {/* Detailed Role & Permissions Explanation Matrix */}
        <Card className="p-4 bg-muted/20 border-border/80 space-y-3 mt-6">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              User Type Roles & Capabilities Architecture
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed">
            <div className="p-3 bg-card rounded-xl border border-border/60 space-y-1.5">
              <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-bold">
                <Shield className="w-4 h-4" />
                <span>Super Admin</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Managing Partner with full oversight across firm revenue, analytics, team staff management, billing, PBX dialplans, and WhatsApp desk.
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>Unrestricted lead & ticket re-assignment</li>
                <li>Audit trail & financial margin views</li>
                <li>Tata Smartflo pilot dialplan config</li>
              </ul>
            </div>

            <div className="p-3 bg-card rounded-xl border border-border/60 space-y-1.5">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
                <Users className="w-4 h-4" />
                <span>Front Desk Staff</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                First line of contact handling client intake, qualification, outbound follow-ups, and ticket conversion.
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>New lead capture & conversion to ticket</li>
                <li>Call disposition & follow-up scheduling</li>
                <li>Advocate ticket assignment</li>
              </ul>
            </div>

            <div className="p-3 bg-card rounded-xl border border-border/60 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <Scale className="w-4 h-4" />
                <span>Advocate / Lawyer</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Legal counsel handling case execution, drafting legal notices, filing proceedings, and direct client WhatsApp consultation.
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>Assigned case confidentiality isolation</li>
                <li>Draft notices & petition uploads</li>
                <li>Direct Smartflo client calling</li>
              </ul>
            </div>
          </div>
        </Card>

      </div>

      {/* ──────────────────────────────────────────────────────────
          ADD / EDIT USER MODAL
      ────────────────────────────────────────────────────────── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-5 bg-card border border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {editingUser ? 'Edit Team Member' : 'Add New Team Member'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure profile, assigned role permissions, and calling phone number for Smartflo integration.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveUser} className="space-y-3.5 py-2">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Full Name *</label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Adv. Rohit Saxena or Pooja Sharma"
                required
                className="h-9 text-xs rounded-xl"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Email Address *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. rohit@vakiltech.com"
                required
                className="h-9 text-xs rounded-xl"
              />
            </div>

            {/* Smartflo Calling Phone */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Mobile Number (Tata Smartflo PBX Calling) *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="10-digit mobile number, e.g. 9812345678"
                  className="pl-9 h-9 text-xs rounded-xl font-mono"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Calls initiated from the CRM ring this device first before bridging with the client.
              </p>
            </div>

            {/* Role Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">User Role & Access Level *</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full h-9 bg-card text-foreground border border-border rounded-xl px-3 text-xs font-medium focus:ring-1 focus:ring-primary"
              >
                <option value="lawyer">⚖️ Advocate / Lawyer (Case execution & client drafting)</option>
                <option value="front_desk">👤 Front Desk (Lead intake, calls, and follow-ups)</option>
                <option value="super_admin">🛡️ Super Admin (Full firm oversight & settings)</option>
              </select>
            </div>

            {/* Specialization */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Specialization / Department</label>
              <Input
                value={formData.specialization}
                onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                placeholder="e.g. Corporate Law, Civil Disputes, Consumer Protection, Front Desk Intake"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            {/* Status (Active / Inactive) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Account Status</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full h-9 bg-card text-foreground border border-border rounded-xl px-3 text-xs font-medium focus:ring-1 focus:ring-primary"
              >
                <option value="active">Active (Permitted to log in and receive assignments)</option>
                <option value="inactive">Inactive (Deactivated)</option>
              </select>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                className="h-9 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                {editingUser ? 'Save Changes' : 'Create Member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────
          DELETE CONFIRMATION MODAL
      ────────────────────────────────────────────────────────── */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent className="max-w-sm rounded-2xl p-5 bg-card border border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Remove Team Member?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to remove <span className="font-semibold text-foreground">"{userToDelete?.name}"</span>? Any active tickets or assigned leads will remain in the system and can be re-assigned.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUserToDelete(null)}
              className="h-9 text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              className="h-9 text-xs rounded-xl font-semibold"
            >
              Confirm Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default TeamManagement;
