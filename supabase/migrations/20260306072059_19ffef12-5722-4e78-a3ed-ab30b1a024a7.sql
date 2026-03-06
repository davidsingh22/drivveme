
-- Create trigger for ride status changes (notifies rider via edge function)
CREATE OR REPLACE TRIGGER trg_notify_ride_status
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_ride_status_change();

-- Create trigger for new ride inserts (notifies nearby drivers)
CREATE OR REPLACE TRIGGER trg_notify_new_ride
  AFTER INSERT ON public.rides
  FOR EACH ROW
  WHEN (NEW.status = 'searching')
  EXECUTE FUNCTION public.notify_new_ride_insert();
