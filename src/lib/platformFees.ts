export function calculatePlatformFee(subtotalBeforeTax: number): number {
  if (subtotalBeforeTax < 15) return 3.50;
  if (subtotalBeforeTax <= 25) return 5.00;
  if (subtotalBeforeTax < 41) return 8.00;
  if (subtotalBeforeTax <= 60) return 10.00;
  return 15.00;
}

export function calculateDriverEarnings(fare: number): number {
  return fare - calculatePlatformFee(fare);
}

export function getPlatformFeeTier(fare: number): string {
  if (fare < 15) return 'Under $15';
  if (fare <= 25) return '$15-$25';
  if (fare <= 40) return '$25-$40';
  if (fare <= 60) return '$41-$60';
  return '$61+';
}
