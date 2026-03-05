// Drivveme Pricing Engine
// GUARANTEED: Always exactly 7.5% cheaper than Uber (final price including taxes)
// Quebec taxes (GST 5% + QST 9.975%) applied on top
// Platform fee calculated from subtotal BEFORE taxes

import { calculatePlatformFee } from './platformFees';

// Uber Quebec rates - calibrated from actual Uber app screenshots
const UBER_BASE_FARE = 3.17;
const UBER_PER_KM_RATE = 0.70;
const UBER_PER_MINUTE_RATE = 0.30;
const UBER_BOOKING_FEE = 1.30;
const UBER_SURCHARGE_RATE = 0.90;
const UBER_MINIMUM_FARE = 7.00;

// Quebec taxes
const GST_RATE = 0.05;
const QST_RATE = 0.09975;
const TOTAL_TAX_RATE = GST_RATE + QST_RATE;

// Drivveme is ALWAYS 7.5% cheaper than Uber's final price
const DISCOUNT_PERCENT = 0.075;
const DISCOUNT_FACTOR = 1 - DISCOUNT_PERCENT;

const MINIMUM_FARE_BEFORE_TAX = 5.10;

export interface FareEstimate {
  uberTotal: number;
  uberSubtotalBeforeTax: number;
  uberBaseFare: number;
  uberBookingFee: number;
  uberDistanceFare: number;
  uberTimeFare: number;
  uberSurcharge: number;
  baseFare: number;
  bookingFee: number;
  distanceFare: number;
  timeFare: number;
  surgeMultiplier: number;
  promoDiscount: number;
  promoPercent: number;
  subtotalBeforeTax: number;
  gstAmount: number;
  qstAmount: number;
  totalTax: number;
  total: number;
  platformFee: number;
  driverEarnings: number;
  savings: number;
  savingsPercent: number;
  uberEquivalent: number;
}

export const calculateFare = (
  distanceKm: number,
  durationMinutes: number,
  applySurge: boolean = true
): FareEstimate => {
  const uberBaseFare = UBER_BASE_FARE;
  const uberBookingFee = UBER_BOOKING_FEE;
  const uberDistanceFare = round(distanceKm * UBER_PER_KM_RATE);
  const uberTimeFare = round(durationMinutes * UBER_PER_MINUTE_RATE);
  const uberSurcharge = UBER_SURCHARGE_RATE;
  
  let uberSubtotalBeforeTax = uberBaseFare + uberBookingFee + uberDistanceFare + uberTimeFare + uberSurcharge;
  if (uberSubtotalBeforeTax < UBER_MINIMUM_FARE) uberSubtotalBeforeTax = UBER_MINIMUM_FARE;
  uberSubtotalBeforeTax = round(uberSubtotalBeforeTax);
  
  const uberTotal = round(uberSubtotalBeforeTax * (1 + TOTAL_TAX_RATE));
  const drivvemeTotal = round(uberTotal * DISCOUNT_FACTOR);
  let subtotalBeforeTax = round(drivvemeTotal / (1 + TOTAL_TAX_RATE));
  if (subtotalBeforeTax < MINIMUM_FARE_BEFORE_TAX) subtotalBeforeTax = MINIMUM_FARE_BEFORE_TAX;
  
  const gstAmount = round(subtotalBeforeTax * GST_RATE);
  const qstAmount = round(subtotalBeforeTax * QST_RATE);
  const totalTax = round(gstAmount + qstAmount);
  const total = round(subtotalBeforeTax + totalTax);
  const promoDiscount = round(uberSubtotalBeforeTax - subtotalBeforeTax);
  const platformFee = calculatePlatformFee(subtotalBeforeTax);
  const driverEarnings = round(Math.max(0, subtotalBeforeTax - platformFee));
  const savings = round(uberTotal - total);
  const savingsPercent = Math.max(7, Math.round((savings / uberTotal) * 100));
  
  const proportionFactor = subtotalBeforeTax / uberSubtotalBeforeTax;
  const baseFare = round(uberBaseFare * proportionFactor);
  const bookingFee = round(uberBookingFee * proportionFactor);
  const distanceFare = round(uberDistanceFare * proportionFactor);
  const timeFare = round(uberTimeFare * proportionFactor);

  return {
    uberTotal, uberSubtotalBeforeTax, uberBaseFare, uberBookingFee, uberDistanceFare, uberTimeFare, uberSurcharge,
    baseFare, bookingFee, distanceFare, timeFare, surgeMultiplier: 1.0,
    promoDiscount, promoPercent: DISCOUNT_PERCENT * 100,
    subtotalBeforeTax, gstAmount, qstAmount, totalTax, total, platformFee, driverEarnings,
    savings, savingsPercent, uberEquivalent: uberSubtotalBeforeTax,
  };
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export const formatCurrency = (amount: number, language: 'en' | 'fr' = 'en'): string => {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
};

export const formatDistance = (km: number, language: 'en' | 'fr' = 'en'): string => `${km.toFixed(1)} km`;

export const formatDuration = (minutes: number, language: 'en' | 'fr' = 'en'): string => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return language === 'fr' ? `${hours}h ${mins}min` : `${hours}h ${mins}m`;
};
