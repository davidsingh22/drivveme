type Listener = (rideId: string) => void;

let _pendingRideId: string | null = null;
const _listeners: Set<Listener> = new Set();

export function setPendingRideFromNotification(rideId: string) {
  console.log('[PendingRideStore] 📥 Stored pending ride:', rideId);
  _pendingRideId = rideId;
  _listeners.forEach((fn) => {
    try { fn(rideId); } catch (e) { console.warn('[PendingRideStore] listener error:', e); }
  });
}

export function consumePendingRide(): string | null {
  const id = _pendingRideId;
  if (id) {
    console.log('[PendingRideStore] 📤 Consumed pending ride:', id);
    _pendingRideId = null;
  }
  return id;
}

export function peekPendingRide(): string | null {
  return _pendingRideId;
}

export function onPendingRide(listener: Listener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}
