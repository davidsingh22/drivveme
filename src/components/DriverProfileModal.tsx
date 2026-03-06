import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, User, Bell } from 'lucide-react';
import ProfileDebugInfo from '@/components/ProfileDebugInfo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resyncMedianOneSignal } from '@/lib/medianOneSignalAuthLink';

interface DriverProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DriverProfileModal = ({ open, onOpenChange }: DriverProfileModalProps) => {
  const { user, profile, driverProfile, refreshProfile, refreshDriverProfile } = useAuth();
  const { toast } = useToast();
  
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [vehicleMake, setVehicleMake] = useState(driverProfile?.vehicle_make || '');
  const [vehicleModel, setVehicleModel] = useState(driverProfile?.vehicle_model || '');
  const [vehicleColor, setVehicleColor] = useState(driverProfile?.vehicle_color || '');
  const [licensePlate, setLicensePlate] = useState(driverProfile?.license_plate || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setFirstName(profile?.first_name || '');
      setLastName(profile?.last_name || '');
      setPhone(profile?.phone_number || '');
      setVehicleMake(driverProfile?.vehicle_make || '');
      setVehicleModel(driverProfile?.vehicle_model || '');
      setVehicleColor(driverProfile?.vehicle_color || '');
      setLicensePlate(driverProfile?.license_plate || '');
      setAvatarUrl(profile?.avatar_url || '');
    }
    onOpenChange(newOpen);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Invalid file', variant: 'destructive' }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'Too large', variant: 'destructive' }); return; }
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally { setIsUploading(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error: profileError } = await supabase.from('profiles').update({
        first_name: firstName.trim() || null, last_name: lastName.trim() || null,
        phone_number: phone.trim() || null, avatar_url: avatarUrl || null,
      }).eq('user_id', user.id);
      if (profileError) throw profileError;

      const { error: driverError } = await supabase.from('driver_profiles').update({
        vehicle_make: vehicleMake.trim() || null, vehicle_model: vehicleModel.trim() || null,
        vehicle_color: vehicleColor.trim() || null, license_plate: licensePlate.trim() || null,
      }).eq('user_id', user.id);
      if (driverError) throw driverError;

      await Promise.all([refreshProfile(), refreshDriverProfile()]);
      toast({ title: 'Profile updated' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'D';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex justify-center">
            <div className="relative">
              <Avatar className="h-24 w-24 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full shadow-lg">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Vehicle Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Make</Label><Input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} /></div>
              <div className="space-y-2"><Label>Model</Label><Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Color</Label><Input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} /></div>
              <div className="space-y-2"><Label>License Plate</Label><Input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} /></div>
            </div>
          </div>
        </div>
        <ProfileDebugInfo userId={user?.id} />
        <Button
          size="lg"
          className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            if (!user?.id) return;
            try {
              const median = (window as any).median;
              if (median?.onesignal) {
                console.log('[SyncButton] Calling register()');
                try { median.onesignal.register(); } catch {}
                console.log('[SyncButton] Calling login({ externalId:', user.id, '})');
                median.onesignal.login({ externalId: user.id });
              }
            } catch (e) { console.error('[SyncButton] Median error:', e); }
            resyncMedianOneSignal(user.id);
            toast({ title: '🔔 Syncing push notifications…', description: `Device linked to ${user.id}` });
          }}
        >
          <Bell className="h-5 w-5 mr-2" />
          SYNC PUSH NOTIFICATIONS
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button className="flex-1 gradient-primary" onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DriverProfileModal;