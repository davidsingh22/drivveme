import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, Car, MapPin, DollarSign, Bell, CreditCard, Banknote, Trash2, RefreshCw, FileText, Radio, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import { format } from 'date-fns';

interface Stats {
  totalUsers: number;
  drivers: number;
  riders: number;
  totalRides: number;
  activeRides: number;
  completedRides: number;
  totalRevenue: number;
  totalPayments: number;
  pendingPayments: number;
  refunded: number;
}

const AdminPanel = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, drivers: 0, riders: 0, totalRides: 0,
    activeRides: 0, completedRides: 0, totalRevenue: 0,
    totalPayments: 0, pendingPayments: 0, refunded: 0,
  });
  const [riders, setRiders] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [tips, setTips] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('riders');

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) loadAllData();
  }, [isAdmin]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadRiders(),
        loadDrivers(),
        loadRides(),
        loadPayments(),
        loadTips(),
        loadNotifications(),
        loadLocations(),
        loadWithdrawals(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const [usersRes, rolesRes, ridesRes, paymentsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('user_roles').select('role'),
      supabase.from('rides').select('id, status, actual_fare'),
      supabase.from('payments').select('id, status, amount'),
    ]);

    const roles = rolesRes.data || [];
    const ridesData = ridesRes.data || [];
    const paymentsData = paymentsRes.data || [];

    const driverCount = roles.filter(r => r.role === 'driver').length;
    const riderCount = roles.filter(r => r.role === 'rider').length;
    const activeStatuses = ['searching', 'driver_assigned', 'driver_en_route', 'arrived', 'in_progress'];
    const activeRides = ridesData.filter(r => activeStatuses.includes(r.status)).length;
    const completedRides = ridesData.filter(r => r.status === 'completed').length;
    const totalRevenue = paymentsData.filter(p => p.status === 'succeeded').reduce((s, p) => s + Number(p.amount), 0);
    const pendingPayments = paymentsData.filter(p => p.status === 'pending').length;
    const refunded = paymentsData.filter(p => p.status === 'refunded').reduce((s, p) => s + Number(p.amount), 0);

    setStats({
      totalUsers: usersRes.count || 0,
      drivers: driverCount,
      riders: riderCount,
      totalRides: ridesData.length,
      activeRides,
      completedRides,
      totalRevenue,
      totalPayments: paymentsData.length,
      pendingPayments,
      refunded,
    });
  };

  const loadRiders = async () => {
    const { data: riderRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'rider');
    if (!riderRoles?.length) { setRiders([]); return; }
    const ids = riderRoles.map(r => r.user_id);
    const { data } = await supabase.from('profiles').select('*').in('user_id', ids).order('created_at', { ascending: false });
    setRiders(data || []);
  };

  const loadDrivers = async () => {
    const { data } = await supabase.from('driver_profiles').select('*').order('created_at', { ascending: false });
    // Also get profile info
    if (data?.length) {
      const ids = data.map(d => d.user_id);
      const { data: profiles } = await supabase.from('profiles').select('*').in('user_id', ids);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      setDrivers(data.map(d => ({ ...d, profile: profileMap.get(d.user_id) })));
    } else {
      setDrivers([]);
    }
  };

  const loadRides = async () => {
    const { data } = await supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(100);
    setRides(data || []);
  };

  const loadPayments = async () => {
    const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(100);
    setPayments(data || []);
  };

  const loadTips = async () => {
    const { data } = await supabase.from('rides').select('id, tip_amount, tip_status, rider_id, driver_id, created_at').not('tip_amount', 'is', null).gt('tip_amount', 0).order('created_at', { ascending: false }).limit(100);
    setTips(data || []);
  };

  const loadNotifications = async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    setNotifications(data || []);
  };

  const loadLocations = async () => {
    const { data } = await supabase.from('driver_locations').select('*').order('updated_at', { ascending: false }).limit(100);
    setLocations(data || []);
  };

  const loadWithdrawals = async () => {
    const { data } = await supabase.from('withdraw_requests').select('*').order('created_at', { ascending: false }).limit(100);
    setWithdrawals(data || []);
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    // Delete profile (cascade should handle related records)
    await supabase.from('profiles').delete().eq('user_id', userId);
    await supabase.from('user_roles').delete().eq('user_id', userId);
    toast({ title: 'User deleted' });
    loadAllData();
  };

  const updateWithdrawalStatus = async (id: string, status: string) => {
    await supabase.from('withdraw_requests').update({ status, processed_at: new Date().toISOString(), processed_by: user?.id }).eq('id', id);
    toast({ title: `Withdrawal ${status}` });
    loadWithdrawals();
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'text-foreground' },
    { label: 'Drivers', value: stats.drivers, color: 'text-primary' },
    { label: 'Riders', value: stats.riders, color: 'text-accent' },
    { label: 'Total Rides', value: stats.totalRides, color: 'text-foreground' },
  ];

  const statCards2 = [
    { label: 'Active Rides', value: stats.activeRides, color: 'text-accent' },
    { label: 'Completed', value: stats.completedRides, color: 'text-accent' },
  ];

  const statCards3 = [
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toFixed(2)}`, color: 'text-accent' },
    { label: 'Total Payments', value: stats.totalPayments, color: 'text-foreground' },
    { label: 'Pending Payments', value: stats.pendingPayments, color: 'text-accent' },
    { label: 'Refunded', value: `$${stats.refunded.toFixed(2)}`, color: 'text-destructive' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8 max-w-7xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage users, payments, and refunds</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/live-riders')}>
              <Radio className="h-4 w-4 mr-1" /> Live Riders
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/live-drivers')}>
              <Radio className="h-4 w-4 mr-1" /> Live Drivers
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/driver-documents')}>
              <FileText className="h-4 w-4 mr-1" /> Driver Documents
            </Button>
            <Button variant="destructive" size="sm">
              <AlertCircle className="h-4 w-4 mr-1" /> Issue Refund
            </Button>
          </div>
        </div>

        {/* Stats Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {statCards.map((s) => (
            <Card key={s.label} className="bg-card">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Row 2 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {statCards2.map((s) => (
            <Card key={s.label} className="bg-card">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Row 3 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards3.map((s) => (
            <Card key={s.label} className="bg-card">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabbed Data Tables */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="riders"><Users className="h-4 w-4 mr-1" /> Riders</TabsTrigger>
            <TabsTrigger value="drivers"><Car className="h-4 w-4 mr-1" /> Drivers</TabsTrigger>
            <TabsTrigger value="rides"><MapPin className="h-4 w-4 mr-1" /> Rides</TabsTrigger>
            <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-1" /> Payments</TabsTrigger>
            <TabsTrigger value="tips"><DollarSign className="h-4 w-4 mr-1" /> Tips</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1" /> Notifications</TabsTrigger>
            <TabsTrigger value="locations"><MapPin className="h-4 w-4 mr-1" /> Locations</TabsTrigger>
            <TabsTrigger value="withdrawals"><Banknote className="h-4 w-4 mr-1" /> Withdrawals</TabsTrigger>
          </TabsList>

          <TabsContent value="riders">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rider</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riders.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs">
                            {(r.first_name?.[0] || '?')}{(r.last_name?.[0] || '')}
                          </div>
                          {r.first_name} {r.last_name}
                        </TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.phone_number || '-'}</TableCell>
                        <TableCell>{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          <Button variant="destructive" size="icon" onClick={() => deleteUser(r.user_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {riders.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No riders found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drivers">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Rides</TableHead>
                      <TableHead>Earnings</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          {d.profile?.first_name || 'Unknown'} {d.profile?.last_name || ''}
                        </TableCell>
                        <TableCell>
                          {d.vehicle_make} {d.vehicle_model} {d.vehicle_year ? `(${d.vehicle_year})` : ''} 
                          {d.vehicle_color ? ` - ${d.vehicle_color}` : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.application_status === 'approved' ? 'default' : 'secondary'}>
                            {d.application_status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>{Number(d.average_rating || 5).toFixed(1)} ⭐</TableCell>
                        <TableCell>{d.total_rides || 0}</TableCell>
                        <TableCell>${Number(d.total_earnings || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="destructive" size="icon" onClick={() => deleteUser(d.user_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {drivers.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No drivers found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rides">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Dropoff</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fare</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rides.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[200px] truncate">{r.pickup_address}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.dropoff_address}</TableCell>
                        <TableCell><Badge>{r.status}</Badge></TableCell>
                        <TableCell>${Number(r.actual_fare || r.estimated_fare).toFixed(2)}</TableCell>
                        <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                    {rides.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No rides found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>${Number(p.amount).toFixed(2)}</TableCell>
                        <TableCell>{p.payment_type}</TableCell>
                        <TableCell><Badge variant={p.status === 'succeeded' ? 'default' : 'secondary'}>{p.status}</Badge></TableCell>
                        <TableCell>{format(new Date(p.created_at), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                    {payments.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No payments found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ride ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tips.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id.slice(0, 8)}...</TableCell>
                        <TableCell>${Number(t.tip_amount).toFixed(2)}</TableCell>
                        <TableCell><Badge>{t.tip_status || 'completed'}</Badge></TableCell>
                        <TableCell>{format(new Date(t.created_at), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                    {tips.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No tips found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Read</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell>{n.title}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{n.message}</TableCell>
                        <TableCell><Badge variant="outline">{n.type}</Badge></TableCell>
                        <TableCell>{n.is_read ? '✓' : '✗'}</TableCell>
                        <TableCell>{format(new Date(n.created_at), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                    {notifications.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No notifications found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locations">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver ID</TableHead>
                      <TableHead>Lat</TableHead>
                      <TableHead>Lng</TableHead>
                      <TableHead>Online</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.driver_id.slice(0, 8)}...</TableCell>
                        <TableCell>{Number(l.lat).toFixed(4)}</TableCell>
                        <TableCell>{Number(l.lng).toFixed(4)}</TableCell>
                        <TableCell>{l.is_online ? '🟢' : '⚫'}</TableCell>
                        <TableCell>{format(new Date(l.updated_at), 'MMM d HH:mm')}</TableCell>
                      </TableRow>
                    ))}
                    {locations.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No locations found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawals">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.driver_id.slice(0, 8)}...</TableCell>
                        <TableCell>${Number(w.amount).toFixed(2)}</TableCell>
                        <TableCell>{w.contact_method}</TableCell>
                        <TableCell><Badge variant={w.status === 'completed' ? 'default' : 'secondary'}>{w.status}</Badge></TableCell>
                        <TableCell>{format(new Date(w.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="flex gap-1">
                          {w.status === 'pending' && (
                            <>
                              <Button size="sm" variant="default" onClick={() => updateWithdrawalStatus(w.id, 'completed')}>Approve</Button>
                              <Button size="sm" variant="destructive" onClick={() => updateWithdrawalStatus(w.id, 'rejected')}>Reject</Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {withdrawals.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No withdrawal requests</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminPanel;
