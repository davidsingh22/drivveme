import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send, MessageSquare, CheckCircle, Clock, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useUnreadSupportMessages } from '@/hooks/useUnreadSupportMessages';

interface SupportMessage { id: string; subject: string; message: string; status: string; admin_reply: string | null; replied_at: string | null; created_at: string; }

export const HelpDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { user, isDriver } = useAuth();
  const { toast } = useToast();
  const { markAllAsRead } = useUnreadSupportMessages();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'new' | 'history'>('new');

  useEffect(() => {
    if (open && user) { fetchMessages(); markAllAsRead(); }
  }, [open, user]);

  const fetchMessages = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase.from('support_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setMessages(data || []);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('support_messages').insert({ user_id: user.id, user_role: isDriver ? 'driver' : 'rider', subject: subject.trim(), message: message.trim() });
      if (error) throw error;
      toast({ title: '✅ Message sent!' }); setSubject(''); setMessage(''); setView('history');
    } catch (error: any) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-primary" />Help & Support</DialogTitle></DialogHeader>
        <div className="flex gap-2 border-b border-border pb-2">
          <Button variant={view === 'new' ? 'default' : 'ghost'} size="sm" onClick={() => setView('new')}><Send className="h-4 w-4 mr-1" />New</Button>
          <Button variant={view === 'history' ? 'default' : 'ghost'} size="sm" onClick={() => setView('history')}><MessageSquare className="h-4 w-4 mr-1" />History</Button>
        </div>
        {view === 'new' ? (
          <form onSubmit={handleSubmit} className="space-y-4 flex-1">
            <div className="space-y-2"><label className="text-sm font-medium">Subject</label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" required /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Message</label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your issue..." rows={4} required /></div>
            <DialogFooter><Button type="submit" disabled={isSubmitting}>{isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Send className="h-4 w-4 mr-2" />Send</>}</Button></DialogFooter>
          </form>
        ) : (
          <ScrollArea className="flex-1 min-h-[200px] max-h-[400px]">
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : messages.length === 0 ? <div className="text-center py-8 text-muted-foreground">No messages yet</div> : (
              <div className="space-y-3 pr-4">
                {messages.map(msg => (
                  <div key={msg.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2"><h4 className="font-medium text-sm line-clamp-1">{msg.subject}</h4><Badge variant="outline">{msg.status}</Badge></div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{msg.message}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(msg.created_at), 'MMM d, yyyy h:mm a')}</p>
                    {msg.admin_reply && <div className="mt-2 p-2 bg-primary/10 rounded-md border border-primary/20"><p className="text-xs font-medium text-primary mb-1">Admin Reply:</p><p className="text-sm">{msg.admin_reply}</p></div>}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};