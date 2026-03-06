
DROP TRIGGER IF EXISTS trg_notify_ride_status ON public.rides;
DROP TRIGGER IF EXISTS trg_notify_new_ride ON public.rides;

CREATE TRIGGER trg_notify_ride_status
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_ride_status_change();

CREATE TRIGGER trg_notify_new_ride
  AFTER INSERT ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_ride_insert();
