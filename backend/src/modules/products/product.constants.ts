/**
 * One definition of "new", used by the New badge, the New Arrivals page, its price bounds and the home page's "Just arrived"
 * row, so they can never disagree. A product is new when it is among the NEW_ARRIVAL_PER_CATEGORY most recently published
 * products of its own category that a shopper can see, and was published within the last NEW_ARRIVAL_DAYS days. A badge on
 * every product tells a shopper nothing, so the cap keeps it meaningful; applying it per category (not across the whole
 * shop) stops one busy category, such as the one uploaded last, from taking every badge.
 */
export const NEW_ARRIVAL_DAYS = 30;
export const NEW_ARRIVAL_PER_CATEGORY = 4;
export const newArrivalSince = (now = Date.now()): Date => new Date(now - NEW_ARRIVAL_DAYS * 86_400_000);
