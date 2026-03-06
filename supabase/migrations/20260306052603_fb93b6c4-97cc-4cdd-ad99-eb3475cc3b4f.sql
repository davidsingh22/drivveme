
UPDATE auth.users 
SET email_confirmed_at = now(),
    updated_at = now()
WHERE email = 'alsenesa@hotmail.com' 
  AND email_confirmed_at IS NULL;
