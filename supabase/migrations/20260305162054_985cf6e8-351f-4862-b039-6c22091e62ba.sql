
-- 1. Create a public-facing view for profiles that excludes PII (email, phone, stripe_customer_id)
-- Used when other users (drivers/riders) view each other's profiles during rides
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  first_name,
  last_name,
  avatar_url,
  language,
  created_at,
  updated_at
FROM public.profiles;

-- 2. Create a public-facing view for saved_cards that excludes stripe_payment_method_id
CREATE OR REPLACE VIEW public.saved_cards_safe
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  nickname,
  card_brand,
  card_last_four,
  card_exp_month,
  card_exp_year,
  is_default,
  created_at,
  updated_at
FROM public.saved_cards;
