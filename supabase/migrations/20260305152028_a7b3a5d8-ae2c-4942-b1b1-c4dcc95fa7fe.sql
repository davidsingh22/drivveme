
-- =============================================
-- CONSOLIDATED MIGRATION FROM QUEBEC RIDE
-- =============================================

-- 1. Create enums
CREATE TYPE public.user_role AS ENUM ('rider', 'driver', 'admin');
CREATE TYPE public.language_preference AS ENUM ('en', 'fr');
CREATE TYPE public.ride_status AS ENUM ('pending_payment', 'searching', 'driver_assigned', 'driver_en_route', 'arrived', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE public.document_type AS ENUM ('license', 'insurance', 'registration');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT,
  email TEXT,
  language language_preference NOT NULL DEFAULT 'en',
  avatar_url TEXT,
  onesignal_player_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Driver profiles
CREATE TABLE public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  license_number TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  license_plate TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  average_rating DECIMAL(3,2) DEFAULT 5.00,
  total_rides INTEGER DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0.00,
  stripe_account_id TEXT,
  priority_driver_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  driver_license_url TEXT,
  profile_picture_url TEXT,
  has_criminal_record BOOLEAN DEFAULT false,
  agreement_accepted BOOLEAN DEFAULT false,
  agreement_accepted_at TIMESTAMP WITH TIME ZONE,
  application_status TEXT DEFAULT 'pending' CHECK (application_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Rides table
CREATE TABLE public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  distance_km DECIMAL(8,2),
  estimated_duration_minutes INTEGER,
  estimated_fare DECIMAL(10,2) NOT NULL,
  actual_fare DECIMAL(10,2),
  platform_fee DECIMAL(10,2) DEFAULT 5.00,
  driver_earnings DECIMAL(10,2),
  promo_discount NUMERIC DEFAULT 0,
  subtotal_before_tax NUMERIC DEFAULT 0,
  gst_amount NUMERIC DEFAULT 0,
  qst_amount NUMERIC DEFAULT 0,
  tip_amount NUMERIC DEFAULT 0,
  tip_status TEXT DEFAULT NULL,
  status ride_status NOT NULL DEFAULT 'searching',
  acceptance_time_seconds INTEGER DEFAULT NULL,
  notification_tier INTEGER DEFAULT 1,
  notified_driver_ids UUID[] DEFAULT '{}',
  last_notification_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  pickup_at TIMESTAMP WITH TIME ZONE,
  dropoff_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID REFERENCES auth.users(id),
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL,
  payer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  payment_type TEXT NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Driver documents
CREATE TABLE public.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_type document_type NOT NULL,
  file_url TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  expires_at DATE,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Ratings
CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL UNIQUE,
  rider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 9. Translations
CREATE TABLE public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  en TEXT NOT NULL,
  fr TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 10. Push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- 11. Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ride_id UUID NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Custom locations
CREATE TABLE public.custom_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 13. Saved cards
CREATE TABLE public.saved_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  card_brand TEXT NOT NULL,
  card_last_four TEXT NOT NULL,
  card_exp_month INTEGER NOT NULL,
  card_exp_year INTEGER NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 14. Ride locations (single latest row per ride for realtime tracking)
CREATE TABLE public.ride_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Ride location history (append-only)
CREATE TABLE public.ride_location_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION NULL,
  speed DOUBLE PRECISION NULL,
  accuracy DOUBLE PRECISION NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 16. Withdraw requests
CREATE TABLE public.withdraw_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  contact_method TEXT NOT NULL CHECK (contact_method IN ('email', 'phone')),
  contact_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID
);

-- 17. Driver locations (real-time)
CREATE TABLE public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed_kph DOUBLE PRECISION,
  is_online BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 18. Ride messages
CREATE TABLE public.ride_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_user_id UUID,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('driver', 'rider')),
  message TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 19. Rider locations
CREATE TABLE public.rider_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 20. Driver agreements
CREATE TABLE public.driver_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_independent_contractor BOOLEAN NOT NULL DEFAULT false,
  is_responsible_for_taxes BOOLEAN NOT NULL DEFAULT false,
  agrees_to_terms BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 21. Rider agreements
CREATE TABLE public.rider_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id UUID NOT NULL,
  agrees_to_terms BOOLEAN NOT NULL DEFAULT false,
  agrees_to_disclosure BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- 22. Rider destinations
CREATE TABLE public.rider_destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  last_visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 23. Support messages
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  replied_at TIMESTAMP WITH TIME ZONE,
  replied_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdraw_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_rider(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'rider'::user_role) $$;

CREATE OR REPLACE FUNCTION public.is_driver(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'driver'::user_role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'::user_role) $$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert rider or driver role only" ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role IN ('rider'::user_role, 'driver'::user_role) AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "Admins can view all user roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete user roles" ON public.user_roles FOR DELETE USING (is_admin(auth.uid()));

-- profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Drivers can view rider profiles for their rides" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rides WHERE rides.driver_id = auth.uid() AND rides.rider_id = profiles.user_id AND rides.status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress')));
CREATE POLICY "Riders can view driver profiles for their rides" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rides WHERE rides.rider_id = auth.uid() AND rides.driver_id = profiles.user_id AND rides.status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress', 'completed')));
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (is_admin(auth.uid()));

-- driver_profiles
CREATE POLICY "Drivers can view their own driver profile" ON public.driver_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own driver profile" ON public.driver_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Drivers can update their own driver profile" ON public.driver_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Riders can view driver profiles for their rides" ON public.driver_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rides WHERE rides.rider_id = auth.uid() AND rides.driver_id = driver_profiles.user_id));

-- rides
CREATE POLICY "Riders can view their own rides" ON public.rides FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Drivers can view their own rides" ON public.rides FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can view searching rides" ON public.rides FOR SELECT USING (is_driver(auth.uid()) AND status = 'searching'::ride_status);
CREATE POLICY "Riders can create rides" ON public.rides FOR INSERT WITH CHECK (auth.uid() = rider_id AND public.is_rider(auth.uid()));
CREATE POLICY "Riders can update their own rides" ON public.rides FOR UPDATE TO authenticated USING (auth.uid() = rider_id);
CREATE POLICY "Drivers can update rides they accepted" ON public.rides FOR UPDATE TO authenticated USING (auth.uid() = driver_id);
CREATE POLICY "drivers_can_accept_searching_rides" ON public.rides FOR UPDATE TO authenticated
  USING (is_driver(auth.uid()) AND status = 'searching' AND driver_id IS NULL) WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Admins can view all rides" ON public.rides FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update any ride" ON public.rides FOR UPDATE USING (is_admin(auth.uid()));

-- payments
CREATE POLICY "Users can view their own payments" ON public.payments FOR SELECT USING (auth.uid() = payer_id);
CREATE POLICY "Users can view payments for their rides" ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rides WHERE rides.id = payments.ride_id AND (rides.rider_id = auth.uid() OR rides.driver_id = auth.uid())));
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (public.is_admin(auth.uid()));

-- driver_documents
CREATE POLICY "Drivers can view their own documents" ON public.driver_documents FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can upload their own documents" ON public.driver_documents FOR INSERT WITH CHECK (auth.uid() = driver_id AND public.is_driver(auth.uid()));
CREATE POLICY "Drivers can update their own documents" ON public.driver_documents FOR UPDATE USING (auth.uid() = driver_id);

-- ratings
CREATE POLICY "Users can view ratings for their rides" ON public.ratings FOR SELECT USING (auth.uid() = rider_id OR auth.uid() = driver_id);
CREATE POLICY "Riders can create ratings for completed rides" ON public.ratings FOR INSERT
  WITH CHECK (auth.uid() = rider_id AND public.is_rider(auth.uid()) AND EXISTS (SELECT 1 FROM public.rides WHERE rides.id = ratings.ride_id AND rides.rider_id = auth.uid() AND rides.status = 'completed'));

-- translations
CREATE POLICY "Anyone can read translations" ON public.translations FOR SELECT USING (true);

-- push_subscriptions
CREATE POLICY "Users can read own push subscriptions" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own push subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all push subscriptions" ON public.push_subscriptions FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete push subscriptions" ON public.push_subscriptions FOR DELETE USING (is_admin(auth.uid()));

-- notifications
CREATE POLICY "read_own_notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "drivers_can_notify_rider_for_assigned_rides" ON public.notifications FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = notifications.ride_id AND r.driver_id = auth.uid() AND notifications.user_id = r.rider_id));
CREATE POLICY "riders_can_notify_driver_for_their_rides" ON public.notifications FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM rides r WHERE r.id = notifications.ride_id AND r.rider_id = auth.uid() AND notifications.user_id = r.driver_id AND r.status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress')));
CREATE POLICY "riders_can_delete_notifications_for_their_rides" ON public.notifications FOR DELETE
  USING (type = 'new_ride' AND EXISTS (SELECT 1 FROM rides r WHERE r.id = notifications.ride_id AND r.rider_id = auth.uid()));

-- custom_locations
CREATE POLICY "Anyone can view active custom locations" ON public.custom_locations FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can insert custom locations" ON public.custom_locations FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update custom locations" ON public.custom_locations FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete custom locations" ON public.custom_locations FOR DELETE USING (is_admin(auth.uid()));

-- saved_cards
CREATE POLICY "Users can view their own saved cards" ON public.saved_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own saved cards" ON public.saved_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own saved cards" ON public.saved_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own saved cards" ON public.saved_cards FOR DELETE USING (auth.uid() = user_id);

-- ride_locations
CREATE POLICY "Drivers can insert their own locations" ON public.ride_locations FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Riders can view locations for their rides" ON public.ride_locations FOR SELECT USING (EXISTS (SELECT 1 FROM rides WHERE rides.id = ride_locations.ride_id AND rides.rider_id = auth.uid()));
CREATE POLICY "Drivers can view their own locations" ON public.ride_locations FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can update their own locations" ON public.ride_locations FOR UPDATE USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- ride_location_history
CREATE POLICY "Drivers can insert their own location history" ON public.ride_location_history FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Drivers can view their own location history" ON public.ride_location_history FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Riders can view location history for their rides" ON public.ride_location_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.rides WHERE rides.id = ride_location_history.ride_id AND rides.rider_id = auth.uid()));
CREATE POLICY "Admins can view all location history" ON public.ride_location_history FOR SELECT USING (public.is_admin(auth.uid()));

-- withdraw_requests
CREATE POLICY "Drivers can view their own withdraw requests" ON public.withdraw_requests FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers can create withdraw requests" ON public.withdraw_requests FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Admins can view all withdraw requests" ON public.withdraw_requests FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can update withdraw requests" ON public.withdraw_requests FOR UPDATE USING (is_admin(auth.uid()));

-- driver_locations
CREATE POLICY "Admins can view all driver locations" ON public.driver_locations FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Drivers can view their own location" ON public.driver_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Drivers can insert their own location" ON public.driver_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Drivers can update their own location" ON public.driver_locations FOR UPDATE USING (auth.uid() = user_id);

-- ride_messages
CREATE POLICY "ride_messages_select_policy" ON public.ride_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_messages.ride_id AND (r.rider_id = auth.uid() OR r.driver_id = auth.uid())));
CREATE POLICY "ride_messages_insert_policy" ON public.ride_messages FOR INSERT
  WITH CHECK ((sender_id = auth.uid() OR sender_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_messages.ride_id AND r.status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress')
      AND ((r.rider_id = auth.uid() AND sender_role = 'rider') OR (r.driver_id = auth.uid() AND sender_role = 'driver'))));

-- rider_locations
CREATE POLICY "Riders can insert their own location" ON public.rider_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Riders can update their own location" ON public.rider_locations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Riders can view their own location" ON public.rider_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all rider locations" ON public.rider_locations FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete rider locations" ON public.rider_locations FOR DELETE USING (is_admin(auth.uid()));

-- driver_agreements
CREATE POLICY "Drivers can insert their own agreement" ON public.driver_agreements FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Drivers can view their own agreement" ON public.driver_agreements FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Admins can view all driver agreements" ON public.driver_agreements FOR SELECT USING (public.is_admin(auth.uid()));

-- rider_agreements
CREATE POLICY "Riders can insert their own agreement" ON public.rider_agreements FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Riders can view their own agreement" ON public.rider_agreements FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admins can view all rider agreements" ON public.rider_agreements FOR SELECT USING (is_admin(auth.uid()));

-- rider_destinations
CREATE POLICY "Users can view their own destinations" ON public.rider_destinations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own destinations" ON public.rider_destinations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own destinations" ON public.rider_destinations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own destinations" ON public.rider_destinations FOR DELETE USING (auth.uid() = user_id);

-- support_messages
CREATE POLICY "Users can create their own support messages" ON public.support_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own support messages" ON public.support_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all support messages" ON public.support_messages FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can update support messages" ON public.support_messages FOR UPDATE USING (is_admin(auth.uid()));

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_rides_updated_at BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_saved_cards_updated_at BEFORE UPDATE ON public.saved_cards FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_ride_locations_updated_at BEFORE UPDATE ON public.ride_locations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_support_messages_updated_at BEFORE UPDATE ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$ BEGIN INSERT INTO public.profiles (user_id, email) VALUES (NEW.id, NEW.email); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update driver rating on new rating
CREATE OR REPLACE FUNCTION public.update_driver_rating()
RETURNS TRIGGER AS $$ BEGIN UPDATE public.driver_profiles SET average_rating = (SELECT COALESCE(AVG(rating), 5.00) FROM public.ratings WHERE driver_id = NEW.driver_id) WHERE user_id = NEW.driver_id; RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_rating_created AFTER INSERT ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_driver_rating();

-- Update driver stats on ride complete
CREATE OR REPLACE FUNCTION public.update_driver_stats()
RETURNS TRIGGER AS $$ BEGIN IF NEW.status = 'completed' AND OLD.status != 'completed' THEN UPDATE public.driver_profiles SET total_rides = total_rides + 1, total_earnings = total_earnings + COALESCE(NEW.driver_earnings, 0) WHERE user_id = NEW.driver_id; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_ride_completed AFTER UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.update_driver_stats();

-- Sync ride_messages v1 columns
CREATE OR REPLACE FUNCTION public.sync_ride_messages_v1_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN NEW.sender_user_id := COALESCE(NEW.sender_user_id, NEW.sender_id); NEW.body := COALESCE(NEW.body, NEW.message); NEW.sender_id := COALESCE(NEW.sender_id, NEW.sender_user_id); NEW.message := COALESCE(NEW.message, NEW.body); RETURN NEW; END; $$;
CREATE TRIGGER trg_sync_ride_messages_v1_columns BEFORE INSERT OR UPDATE ON public.ride_messages FOR EACH ROW EXECUTE FUNCTION public.sync_ride_messages_v1_columns();

-- Sync driver_locations from driver_profiles
CREATE OR REPLACE FUNCTION public.sync_driver_locations_from_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
    INSERT INTO public.driver_locations (driver_id, user_id, lat, lng, heading, speed_kph, is_online, updated_at)
    VALUES (NEW.user_id, NEW.user_id, NEW.current_lat, NEW.current_lng, NULL, NULL, NEW.is_online, now())
    ON CONFLICT (driver_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, is_online = EXCLUDED.is_online, updated_at = now();
  ELSE
    IF NEW.is_online = false THEN UPDATE public.driver_locations SET is_online = false, updated_at = now() WHERE driver_id = NEW.user_id; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sync_driver_locations_from_profile AFTER INSERT OR UPDATE OF current_lat, current_lng, is_online ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_driver_locations_from_profile();

-- Create rider_location on signup
CREATE OR REPLACE FUNCTION public.create_rider_location_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rider_locations (user_id, lat, lng, accuracy, is_online, last_seen_at, updated_at)
  VALUES (NEW.user_id, 45.5017, -73.5673, 10000, true, now(), now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER create_rider_location_on_profile_insert AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_rider_location_on_signup();

-- Security definer functions for ride messaging
CREATE OR REPLACE FUNCTION public.can_access_ride_messages(p_ride_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rides WHERE id = p_ride_id AND (rider_id = p_user_id OR driver_id = p_user_id))
$$;

CREATE OR REPLACE FUNCTION public.can_send_ride_message(p_ride_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rides WHERE id = p_ride_id AND (rider_id = p_user_id OR driver_id = p_user_id) AND status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress'))
$$;

-- Atomic ride accept function
CREATE OR REPLACE FUNCTION public.accept_ride(p_ride_id UUID, p_driver_id UUID, p_acceptance_time_seconds INTEGER DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ride_id UUID;
BEGIN
  UPDATE rides SET driver_id = p_driver_id, status = 'driver_assigned', accepted_at = now(), acceptance_time_seconds = p_acceptance_time_seconds
  WHERE id = p_ride_id AND status = 'searching' AND driver_id IS NULL RETURNING id INTO v_ride_id;
  RETURN v_ride_id;
END; $$;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_rides_rider_id ON public.rides(rider_id);
CREATE INDEX idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX idx_rides_status ON public.rides(status);
CREATE INDEX idx_driver_profiles_is_online ON public.driver_profiles(is_online);
CREATE INDEX idx_driver_profiles_location ON public.driver_profiles(current_lat, current_lng);
CREATE INDEX idx_payments_ride_id ON public.payments(ride_id);
CREATE INDEX idx_ratings_driver_id ON public.ratings(driver_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX notifications_user_id_created_at_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_ride_locations_ride_id ON public.ride_locations(ride_id);
CREATE INDEX idx_ride_locations_created_at ON public.ride_locations(ride_id, created_at DESC);
CREATE UNIQUE INDEX ride_locations_ride_id_unique ON public.ride_locations(ride_id);
CREATE INDEX idx_ride_location_history_ride_created_at ON public.ride_location_history(ride_id, created_at DESC);
CREATE INDEX idx_ride_location_history_driver_created_at ON public.ride_location_history(driver_id, created_at DESC);
CREATE INDEX idx_ride_messages_ride_id ON public.ride_messages(ride_id);
CREATE INDEX idx_ride_messages_created_at ON public.ride_messages(created_at);
CREATE INDEX idx_rider_agreements_rider_id ON public.rider_agreements(rider_id);
CREATE UNIQUE INDEX idx_rider_destinations_user_location ON public.rider_destinations(user_id, lat, lng);
CREATE INDEX idx_rider_destinations_user_id ON public.rider_destinations(user_id);
CREATE INDEX idx_driver_locations_online ON public.driver_locations(is_online) WHERE is_online = true;

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdraw_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- REPLICA IDENTITY FULL for realtime UPDATE payloads
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.driver_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.ride_locations REPLICA IDENTITY FULL;
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;

-- =============================================
-- STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-licenses', 'driver-licenses', false) ON CONFLICT (id) DO NOTHING;

-- Storage policies - avatars
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies - driver-licenses
CREATE POLICY "Drivers can upload their own license" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'driver-licenses' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Drivers can view their own license" ON storage.objects FOR SELECT USING (bucket_id = 'driver-licenses' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Drivers can update their own license" ON storage.objects FOR UPDATE USING (bucket_id = 'driver-licenses' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins can view all driver licenses" ON storage.objects FOR SELECT USING (bucket_id = 'driver-licenses' AND public.is_admin(auth.uid()));

-- =============================================
-- TRIGGER: Ride status change → push notification via pg_net
-- =============================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_ride_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _supabase_url text := 'https://bqpocvswrtqntlomdyzf.supabase.co';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcG9jdnN3cnRxbnRsb21keXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzQxMDYsImV4cCI6MjA4ODI1MDEwNn0.w3DoUs-_xtQUhSxckXu4Pyl2Lbn13iw_OasFJfxHcUQ';
  _payload jsonb;
BEGIN
  RAISE LOG 'notify_ride_status_change FIRED: ride=% old=% new=%', NEW.id, OLD.status, NEW.status;
  _payload := jsonb_build_object('ride_id', NEW.id, 'new_status', NEW.status, 'old_status', OLD.status, 'rider_id', NEW.rider_id, 'driver_id', NEW.driver_id);
  PERFORM net.http_post(url := _supabase_url || '/functions/v1/ride-status-push', body := _payload, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon_key));
  RAISE LOG 'notify_ride_status_change POST dispatched for ride %', NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_ride_status_change failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $function$;

CREATE TRIGGER on_ride_status_change AFTER UPDATE OF status ON public.rides FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.notify_ride_status_change();

-- TRIGGER: New ride INSERT → notify drivers
CREATE OR REPLACE FUNCTION public.notify_new_ride_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _url text := 'https://bqpocvswrtqntlomdyzf.supabase.co/functions/v1/notify-drivers-new-ride';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcG9jdnN3cnRxbnRsb21keXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzQxMDYsImV4cCI6MjA4ODI1MDEwNn0.w3DoUs-_xtQUhSxckXu4Pyl2Lbn13iw_OasFJfxHcUQ';
  _payload jsonb;
BEGIN
  RAISE LOG 'notify_new_ride_insert FIRED: ride=% status=%', NEW.id, NEW.status;
  _payload := jsonb_build_object('ride_id', NEW.id, 'pickup_address', NEW.pickup_address, 'dropoff_address', NEW.dropoff_address, 'estimated_fare', NEW.estimated_fare, 'pickup_lat', NEW.pickup_lat, 'pickup_lng', NEW.pickup_lng, 'rider_id', NEW.rider_id, 'source', 'trigger');
  PERFORM net.http_post(url := _url, body := _payload, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon_key));
  RAISE LOG 'notify_new_ride_insert POST dispatched for ride %', NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_ride_insert failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_new_ride_insert AFTER INSERT ON public.rides FOR EACH ROW EXECUTE FUNCTION public.notify_new_ride_insert();

-- Add comments
COMMENT ON COLUMN public.rides.promo_discount IS 'The 7.5% promotional discount amount applied to base fare';
COMMENT ON COLUMN public.rides.subtotal_before_tax IS 'Fare after promo discount, before Quebec taxes';
COMMENT ON COLUMN public.rides.gst_amount IS 'Federal GST (5%) applied to subtotal';
COMMENT ON COLUMN public.rides.qst_amount IS 'Quebec QST (9.975%) applied to subtotal';
COMMENT ON COLUMN public.rides.tip_status IS 'Tracks tip lifecycle: pending (rider submitted), charged (admin charged card)';
