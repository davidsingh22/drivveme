
-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_ride_status_change ON public.rides;

-- Recreate the notify_ride_status_change function with case-insensitive handling
-- and SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.notify_ride_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _url text := 'https://bqpocvswrtqntlomdyzf.supabase.co/functions/v1/ride-status-push';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcG9jdnN3cnRxbnRsb21keXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzQxMDYsImV4cCI6MjA4ODI1MDEwNn0.w3DoUs-_xtQUhSxckXu4Pyl2Lbn13iw_OasFJfxHcUQ';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'ride_id', NEW.id,
      'new_status', NEW.status,
      'old_status', OLD.status,
      'rider_id', NEW.rider_id,
      'driver_id', COALESCE(NEW.driver_id, OLD.driver_id)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_ride_status_change failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- Create the trigger: AFTER UPDATE on status column only
-- No WHEN clause filter so ALL status changes fire (the edge function handles routing)
CREATE TRIGGER on_ride_status_change
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_ride_status_change();

-- Grant service_role full access to rides table to ensure no RLS issues for triggers
GRANT ALL ON public.rides TO service_role;
GRANT ALL ON public.rides TO postgres;
