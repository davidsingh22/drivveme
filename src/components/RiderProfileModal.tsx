import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, User } from 'lucide-react';
import ProfileDebugInfo from '@/components/ProfileDebugInfo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface RiderProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RiderProfileModal = ({ open, onOpenChange }: RiderProfileModalProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setFirstName(profile?.first_name || '');
      setLastName(profile?.last_name || '');
      setPhone(profile?.phone_number || '');
      setAvatarUrl(profile?.avatar_url || '');
    }
    onOpenChange(newOpen);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Invalid file type', variant: 'destructive' }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'File too large', variant: 'destructive' }); return; }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      toast({ title: 'Photo uploaded' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally { setIsUploading(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone_number: phone.trim() || null,
        avatar_url: avatarUrl || null,
      }).eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: 'Profile updated' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'R';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('nav.profile')}</DialogTitle></DialogHeader>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        </div>
        <ProfileDebugInfo userId={user?.id} />
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

export default RiderProfileModal;