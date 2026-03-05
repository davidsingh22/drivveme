
-- ============================================
-- CREATE ALL MISSING TRIGGERS
-- ============================================

-- 1. Auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Auto-update updated_at on profiles
CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. Auto-update updated_at on driver_profiles
CREATE OR REPLACE TRIGGER set_driver_profiles_updated_at
  BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Auto-update updated_at on rides
CREATE OR REPLACE TRIGGER set_rides_updated_at
  BEFORE UPDATE ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. Auto-update updated_at on payments
CREATE OR REPLACE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. Update driver rating after new rating
CREATE OR REPLACE TRIGGER on_new_rating
  AFTER INSERT ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_driver_rating();

-- 7. Update driver stats on ride completion
CREATE OR REPLACE TRIGGER on_ride_status_change_stats
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_driver_stats();

-- 8. Sync ride_messages columns
CREATE OR REPLACE TRIGGER sync_ride_messages_columns
  BEFORE INSERT OR UPDATE ON public.ride_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ride_messages_v1_columns();

-- 9. Sync driver_locations from driver_profiles
CREATE OR REPLACE TRIGGER sync_driver_loc_from_profile
  AFTER UPDATE OF current_lat, current_lng, is_online ON public.driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_locations_from_profile();

-- 10. Create rider_location on rider role insert
CREATE OR REPLACE TRIGGER on_rider_role_created
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  WHEN (NEW.role = 'rider')
  EXECUTE FUNCTION public.create_rider_location_on_signup();

-- 11. Notify on new ride insert (calls edge function via pg_net)
CREATE OR REPLACE TRIGGER trg_notify_new_ride
  AFTER INSERT ON public.rides
  FOR EACH ROW
  WHEN (NEW.status = 'searching')
  EXECUTE FUNCTION public.notify_new_ride_insert();

-- 12. Notify on ride status change (calls edge function via pg_net)
CREATE OR REPLACE TRIGGER trg_notify_ride_status
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_ride_status_change();

-- 13. Auto-update updated_at on support_messages
CREATE OR REPLACE TRIGGER set_support_messages_updated_at
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
