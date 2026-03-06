-- Insert rider role for patsy@hotmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('cd6488bf-8a2a-4d94-aa7b-11bdf91f6c15', 'rider')
ON CONFLICT (user_id, role) DO NOTHING;