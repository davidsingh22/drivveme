CREATE POLICY "Riders can view driver locations for their active rides"
ON public.driver_locations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides
    WHERE rides.driver_id = driver_locations.driver_id
      AND rides.rider_id = auth.uid()
      AND rides.status IN ('driver_assigned', 'driver_en_route', 'arrived', 'in_progress')
  )
);