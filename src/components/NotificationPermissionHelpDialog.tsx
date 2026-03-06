import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface NotificationPermissionHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPermissionHelpDialog({ open, onOpenChange }: NotificationPermissionHelpDialogProps) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable Notifications</DialogTitle>
          <DialogDescription>
            Follow these steps to enable push notifications:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isIOS ? (
            <>
              <p className="text-sm">1. Open this app from your Home Screen (Add to Home Screen first)</p>
              <p className="text-sm">2. Go to Settings → Notifications → find this app</p>
              <p className="text-sm">3. Enable "Allow Notifications"</p>
            </>
          ) : (
            <>
              <p className="text-sm">1. Click the lock/info icon in your browser's address bar</p>
              <p className="text-sm">2. Find "Notifications" and set it to "Allow"</p>
              <p className="text-sm">3. Reload the page</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}