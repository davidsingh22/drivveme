
-- Since handle_new_user trigger will auto-assign admin role on signup,
-- and the user hasn't signed up yet, we'll note that the trigger is ready.
-- The user needs to sign up through the app UI.
-- Let's verify the trigger exists on auth.users
SELECT tgname, tgrelid::regclass, proname 
FROM pg_trigger t 
JOIN pg_proc p ON t.tgfoid = p.oid 
WHERE proname = 'handle_new_user';
