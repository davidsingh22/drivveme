import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Lock, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';

const ACTIVE_STATUSES = ['driver_assigned', 'driver_en_route', 'arrived', 'in_progress'];

interface RideMessage {
  id: string; ride_id: string; sender_id: string; sender_user_id: string | null;
  sender_role: 'driver' | 'rider'; message: string; body: string | null; created_at: string;
}

interface RideChatProps {
  rideId: string; rideStatus: string; role: 'driver' | 'rider';
  otherPartyName?: string; onClose?: () => void; embedded?: boolean;
}

export default function RideChat({ rideId, rideStatus, role, otherPartyName = role === 'driver' ? 'Rider' : 'Driver', onClose, embedded = false }: RideChatProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isActive = ACTIVE_STATUSES.includes(rideStatus);
  const isEnded = rideStatus === 'completed' || rideStatus === 'cancelled';

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchMessages = useCallback(async () => {
    if (!rideId || !user?.id) return;
    setIsLoading(true); setError(null);
    try {
      const { data, error: fetchError } = await supabase.from('ride_messages').select('*').eq('ride_id', rideId).order('created_at', { ascending: true });
      if (fetchError) { setError(fetchError.message); return; }
      setMessages((data || []).map(m => ({ ...m, sender_role: m.sender_role as 'driver' | 'rider' })));
    } catch (err: any) { setError(err.message || 'Failed to load messages'); }
    finally { setIsLoading(false); }
  }, [rideId, user?.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!rideId || !user?.id) return;
    const channel = supabase.channel(`ride-chat-${rideId}-${role}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` }, (payload) => {
        const newMsg = payload.new as RideMessage;
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, { ...newMsg, sender_role: newMsg.sender_role as 'driver' | 'rider' }]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rideId, user?.id, role]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !user?.id || !rideId || !isActive) return;
    setIsSending(true);
    try {
      const { error: insertError } = await supabase.from('ride_messages').insert({
        ride_id: rideId, sender_id: user.id, sender_user_id: user.id,
        sender_role: role, message: newMessage.trim(), body: newMessage.trim(),
      });
      if (insertError) { toast({ title: 'Error', description: insertError.message, variant: 'destructive' }); return; }
      setNewMessage('');
    } catch (err: any) { toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' }); }
    finally { setIsSending(false); }
  }, [newMessage, user?.id, rideId, isActive, role, toast]);

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString(language === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });

  const containerClass = embedded ? 'flex flex-col h-full' : 'fixed inset-0 z-50 bg-background flex flex-col';

  return (
    <div className={containerClass}>
      <div className="p-4 border-b bg-card flex items-center gap-3">
        {onClose && <Button variant="ghost" size="sm" onClick={onClose} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>}
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><MessageSquare className="h-5 w-5 text-primary" /></div>
          <div><p className="font-semibold">Ride Messages</p><p className="text-xs text-muted-foreground">{otherPartyName}</p></div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchMessages} disabled={isLoading}><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
      </div>
      {error && <div className="p-4 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5" /><p className="text-sm">{error}</p></div>}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && messages.length === 0 && <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {!isLoading && messages.length === 0 && !error && <div className="text-center text-muted-foreground py-8"><MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" /><p>No messages yet.</p></div>}
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => {
            const isOwn = msg.sender_role === role;
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${isOwn ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                  <p className="text-sm">{msg.body || msg.message}</p>
                  <p className={`text-xs mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(msg.created_at)}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t bg-card">
        {isEnded ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-2"><Lock className="h-4 w-4" /><span className="text-sm">Ride ended. Messaging closed.</span></div>
        ) : isActive ? (
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-center gap-2">
            <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="flex-1" disabled={isSending} maxLength={500} autoFocus={!embedded} />
            <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}><Send className="h-4 w-4" /></Button>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-2"><Lock className="h-4 w-4" /><span className="text-sm">Messaging not available.</span></div>
        )}
      </div>
    </div>
  );
}