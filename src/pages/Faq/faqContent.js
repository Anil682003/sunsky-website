/* ═══════════════════════════════════════════════════════════════════════════
   FAQ content — the journey stages, and the questions that ship with the site.

   The FAQ is CMS-managed (sunsky-admin → CMS → FAQ). Everything in this file is
   the STARTING POINT and the safety net:

   • Starting point — SUNSKY opens the dashboard to a stocked FAQ rather than an
     empty table, and edits from there. Once the CMS holds questions they REPLACE
     everything below, so a question removed in the dashboard disappears from the
     site.
   • Safety net — the CMS lives behind the admin API. If that is unreachable the
     help page still answers the questions people actually ask, instead of
     showing an apology.

   The answers below deliberately describe HOW THE SITE WORKS and never invent a
   policy number. Deadlines, fees and cancellation terms differ per booking and
   per supplier, so those answers point at the booking conditions and at customer
   service rather than stating a figure that would be wrong for most readers.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The four stages of the journey, in order.
 *
 * The page is organised around WHERE THE READER IS, not around our internal
 * departments: someone whose flight was just cancelled should not have to read
 * past eight questions about baggage allowances to find us.
 *
 * `match` maps a CMS category onto a stage by title, so the dashboard can call
 * the stage "Voor je boekt" or "Before booking" and it still lands on the right
 * card. A CMS category that matches nothing becomes a card of its own, which is
 * what lets SUNSKY add a fifth topic without a code change.
 */
export const STAGES = [
  {
    key: 'before-booking',
    title: 'Before you book',
    blurb: 'Prices, what is included, packages, baggage and payment options.',
    match: [/before\s*(you\s*)?book/i, /voor\s*(je|u)?\s*boek/i, /booking\s*info/i],
  },
  {
    key: 'before-departure',
    title: 'After booking',
    blurb: 'Your confirmation, payments, changes, travel documents and check-in.',
    match: [/after\s*booking/i, /before\s*departure/i, /na\s*(je|de)?\s*boeking/i, /vertrek/i],
  },
  {
    key: 'during-trip',
    title: 'During your trip',
    blurb: 'Transfers, your hotel, flight changes, delays and reaching us fast.',
    match: [/during\s*(your|the)?\s*(trip|travel|holiday)/i, /tijdens/i, /on\s*holiday/i],
  },
  {
    key: 'after-trip',
    title: 'After your trip',
    blurb: 'Complaints, lost or damaged baggage, refunds and feedback.',
    match: [/after\s*(your|the)?\s*(trip|travel|holiday)/i, /na\s*(je|de)?\s*reis/i, /post[-\s]*travel/i],
  },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

/**
 * The stage a CMS category title belongs to, or null when it names something new.
 *
 * Tested in journey order, so "After booking and before departure" lands on
 * stage 2 rather than on stage 4, which is how a reader would file it too.
 */
export const stageForTitle = (title) => {
  const t = String(title ?? '').trim();
  if (!t) return null;
  for (const s of STAGES) {
    if (s.match.some((re) => re.test(t))) return s.key;
  }
  return null;
};

/**
 * The questions the site ships with.
 *
 * `featured: true` promotes a question into the "Most asked" strip at the top.
 * Keep that to five or six: the strip is a shortcut, and a shortcut with twelve
 * entries is just the list again.
 */
export const FALLBACK_FAQS = [
  /* ── 1. Before you book ────────────────────────────────────────────────── */
  {
    id: 'f-book-how',
    stage: 'before-booking',
    featured: true,
    question: 'How do I book?',
    answer:
      'Search for your destination and dates, choose the accommodation and board basis you want, then enter traveller details and pay.\n\nYou will receive a confirmation by email once the booking is complete. You do not need an account to book, but if you sign in, the booking is filed under My Booking straight away, which is the easiest place to find it later.',
  },
  {
    id: 'f-book-included',
    stage: 'before-booking',
    question: 'What is included in the price?',
    answer:
      'The price you see covers what is listed in the price breakdown at checkout, and nothing is added after you have paid. For a hotel that is the room and the board type you selected. For a package it is the flight, the accommodation and the board type, plus any transfer you added.\n\nBaggage, travel insurance, airport transfers and other extras are optional and are priced separately in the checkout, so you can see exactly what each one costs before you decide.',
  },
  {
    id: 'f-book-package',
    stage: 'before-booking',
    question: 'What is a dynamic package?',
    answer:
      'A dynamic package is a flight and a hotel combined into a single booking at the moment you search, rather than a fixed brochure holiday. Because the two are put together live, you get a much wider choice of departure dates, durations and hotels, and the combined price is often lower than booking each part separately.\n\nYou book it, pay for it and get support for it as one holiday, under one booking reference.',
  },
  {
    id: 'f-book-payment',
    stage: 'before-booking',
    featured: true,
    question: 'How do I pay, and is it secure?',
    answer:
      'You can pay by credit or debit card (Visa and Mastercard), Bancontact, iDEAL or PayPal. The methods available to you are shown in the payment step of the checkout.\n\nPayments are processed over an encrypted connection by a regulated payment provider whose systems are certified to the PCI-DSS standard. We never see or store your full card number.\n\nA deposit is payable at the time of booking, with the balance due before departure.',
  },
  {
    id: 'f-book-baggage',
    stage: 'before-booking',
    featured: true,
    question: 'Is baggage included?',
    answer:
      'It depends on the fare. In the extras step of the checkout we show, per traveller and per direction, what the fare already includes, so you can see at a glance whether hold baggage is part of the ticket or not.\n\nIf you need more than the fare includes, you can add cabin or hold baggage there for each traveller. Adding it at the time of booking is almost always cheaper than paying for it at the airport.',
  },
  {
    id: 'f-book-insurance',
    stage: 'before-booking',
    question: 'Do I need travel insurance?',
    answer:
      'Travel insurance is not compulsory but is strongly recommended.\n\nCancellation insurance in particular can cover costs you would otherwise lose if you had to cancel for a reason the policy covers.\n\nIn the add-ons step of the checkout you can choose cancellation cover, travel cover, or the two combined, and each option shows its price for your party and dates before you select it.',
  },
  {
    id: 'f-book-perperson',
    stage: 'before-booking',
    question: 'Are the prices shown per person or in total?',
    answer:
      'Search results show the total price for the whole party and the full stay you searched for, so what you compare between hotels is a like for like figure.\n\nThe checkout then breaks that total down line by line, including any extras you add and the booking fee, before you are asked to pay.',
  },
  {
    id: 'f-book-deposit',
    stage: 'before-booking',
    question: 'Do I have to pay the full amount straight away?',
    answer:
      'For some bookings you can pay a deposit now and the balance later. Where that applies, the checkout shows it as an option, along with the amount due today and the date the balance is due.\n\nWhether a deposit is possible depends on the holiday and on how close the departure date is. Bookings made close to departure normally have to be paid in full.',
  },

  /* ── 2. After booking, before departure ────────────────────────────────── */
  {
    id: 'f-dep-confirm',
    stage: 'before-departure',
    featured: true,
    question: 'When is my booking confirmed?',
    answer:
      'Your booking is confirmed when you receive our written confirmation. Until then, the price and availability shown are not guaranteed.\n\nThat confirmation normally arrives within a few minutes of payment, though a supplier who confirms manually can take longer. If it has not arrived within a few hours, check your spam folder and then contact us.',
  },
  {
    id: 'f-dep-where',
    stage: 'before-departure',
    question: 'Where can I find my booking?',
    answer:
      'Sign in and open My Booking. Everything to do with the holiday lives there: the confirmation, what has been paid and what is still outstanding, your travel documents and the details of every traveller.\n\nIf you booked as a guest, use the booking reference from your confirmation email, or create an account with the same email address you booked with.',
  },
  {
    id: 'f-dep-documents',
    stage: 'before-departure',
    featured: true,
    question: 'When do I receive my travel documents?',
    answer:
      'Travel documents are sent by email once your booking is paid in full, normally shortly before departure. You can also download them at any time from My Booking.\n\nTake them with you, either printed or on your phone. You will be asked for them at check-in.',
  },
  {
    id: 'f-dep-change',
    stage: 'before-departure',
    featured: true,
    question: 'Can I change my booking?',
    answer:
      'Changes are often possible, but they depend on the terms of the airline, hotel or other supplier involved, and some carry a fee.\n\nContact us as early as possible with your booking reference and we will tell you what is available and what it costs, before anything is changed.',
  },
  {
    id: 'f-dep-cancel',
    stage: 'before-departure',
    question: 'What happens if I need to cancel?',
    answer:
      'Cancellation charges depend on how close to departure you cancel and on the conditions of your booking. The scale that applies to you is set out in the General Travel Conditions and was shown before you booked.\n\nIf you took out cancellation insurance, costs you would otherwise lose may be covered where the reason for cancelling is one the policy covers.',
  },
  {
    id: 'f-dep-balance',
    stage: 'before-departure',
    question: 'How do I pay the remaining balance?',
    answer:
      'If you paid a deposit, the outstanding amount and its due date are shown in My Booking, and you can pay it there with the same methods you used for the deposit.\n\nWe will also remind you by email before the balance falls due. Paying on time matters, because an unpaid balance can lead to the booking being cancelled by the supplier.',
  },
  {
    id: 'f-dep-passport',
    stage: 'before-departure',
    question: 'What documents do I need to travel?',
    answer:
      'You are responsible for holding valid travel documents. Requirements vary by destination and by nationality, and they change.\n\nAs a rule you need a passport or identity card valid for the whole trip, and many destinations require a passport that stays valid for several months after your return date.\n\nSee Passport, Visa and Health Requirements under Terms & Traveller Rights for the detail, and check well before you leave: a holiday missed because of a document problem cannot be refunded.',
  },
  {
    id: 'f-dep-checkin',
    stage: 'before-departure',
    question: 'How does online check-in work?',
    answer:
      'Online check-in is handled by the airline, not by us. It usually opens between 48 and 24 hours before departure, and you complete it on the airline website using the airline booking reference shown on your travel documents.\n\nSome airlines charge for checking in at the airport instead, so it is worth doing online as soon as it opens.',
  },
  {
    id: 'f-dep-extras',
    stage: 'before-departure',
    question: 'Can I add baggage or other extras after booking?',
    answer:
      'Usually yes. Extra baggage, an airport transfer or a seat request can often still be added after the booking is confirmed, subject to availability and to the airline price at that moment.\n\nContact us with your booking reference and tell us what you would like to add. Prices for extras added later are set by the airline and are normally higher than at the time of booking.',
  },
  {
    id: 'f-dep-name',
    stage: 'before-departure',
    question: 'The name on my booking is wrong. What should I do?',
    answer:
      'Tell us as soon as you notice. Names on a flight booking have to match the passport exactly, and airlines treat a name change very differently from a spelling correction: a small typo can often be fixed, while changing to a different traveller usually means rebooking.\n\nThe sooner you contact us, the more options there are and the less it is likely to cost.',
  },

  /* ── 3. During your trip ───────────────────────────────────────────────── */
  {
    id: 'f-trip-contact',
    stage: 'during-trip',
    question: 'How do I contact SUNSKY while I am travelling?',
    answer:
      'During office hours, call +32 11 57 44 27 or email info@sunsky.be, and have your booking reference to hand so we can find the booking immediately.\n\nFor an urgent problem during your trip that cannot wait for opening hours, use the traveller emergency line on +32 497 54 38 16. That line is for emergencies while travelling, not for general questions, changes or new bookings.\n\nYour travel documents also list the local contacts you need on the spot, such as the transfer company and the hotel.',
  },
  {
    id: 'f-trip-transfer',
    stage: 'during-trip',
    question: 'My airport transfer has not arrived. What should I do?',
    answer:
      'Call the local transfer supplier first, using the number on your transfer voucher. They are on the ground and can usually locate the driver within minutes. Your voucher also states the meeting point, which is often not directly outside the arrivals door.\n\nIf you cannot reach them, contact us and we will chase it. Please do not arrange and pay for your own taxi before speaking to one of us, because an unapproved cost is much harder to reclaim afterwards.',
  },
  {
    id: 'f-trip-hotel',
    stage: 'during-trip',
    question: 'There is a problem with my hotel room. What should I do?',
    answer:
      'Report it at the hotel reception straight away and give them the chance to put it right. Most issues, from a room that does not match what was booked to something that is not working, are solved on the spot.\n\nIf the hotel does not resolve it, contact us while you are still there. A problem we hear about during the stay can often be fixed or compensated. The same problem reported after you get home rarely can be, because by then nothing can be verified.',
  },
  {
    id: 'f-trip-delay',
    stage: 'during-trip',
    question: 'My flight is delayed or cancelled. What are my rights?',
    answer:
      'For flights departing from the EU, and for flights into the EU on an EU airline, EU Regulation 261/2004 gives you the right to assistance from the airline and, for longer delays and cancellations within the airline control, to compensation. The airline handles this, so keep your boarding passes and any receipts.\n\nIf the disruption affects the rest of your holiday, such as a transfer you will now miss, contact us so we can move what can be moved.',
  },
  {
    id: 'f-trip-schedule',
    stage: 'during-trip',
    question: 'My flight times have changed. What happens now?',
    answer:
      'Airlines do adjust their schedules, sometimes months ahead and occasionally at short notice. When that happens on your booking we email you the new times and tell you what it means for the rest of the holiday, including any transfer that has to move with it.\n\nIf the new times do not work for you, reply to that email or call us and we will go through the alternatives.',
  },
  {
    id: 'f-trip-wrong',
    stage: 'during-trip',
    question: 'What if something goes wrong while I am away?',
    answer:
      'Report the problem to the supplier and to our emergency line straight away, so it can be put right on the spot. Giving us that opportunity is a condition of your contract.\n\nIf it cannot be resolved locally, our complaints procedure is set out under Terms & Traveller Rights.',
  },
  {
    id: 'f-trip-emergency',
    stage: 'during-trip',
    question: 'What should I do in an emergency?',
    answer:
      'In a medical or safety emergency, always call the local emergency services first. Across the EU that number is 112.\n\nThen contact your travel insurer, whose emergency line is on your policy and who handles medical costs and repatriation.\n\nLet us know as well, on the traveller emergency line +32 497 54 38 16, so we can help with the travel side, such as changing a return flight.',
  },

  /* ── 4. After your trip ────────────────────────────────────────────────── */
  {
    id: 'f-after-complaint',
    stage: 'after-trip',
    question: 'How do I make a complaint?',
    answer:
      'Email us with your booking reference, what went wrong, and any photos or documents that support it. The more concrete the detail, the faster we can take it up with the hotel or airline.\n\nPlease get in touch as soon as you can after returning. Suppliers apply their own time limits for handling complaints, and a late report can leave us with no way to pursue it.',
  },
  {
    id: 'f-after-baggage',
    stage: 'after-trip',
    question: 'My baggage was damaged or did not arrive. What should I do?',
    answer:
      'Report it at the airport before you leave the baggage hall and get a written report, usually called a PIR. Without that report an airline will normally not accept a claim at all.\n\nBaggage is the airline responsibility, so the claim goes to them, and your travel insurance may cover it as well. Send us a copy of the report and we will help you put the claim together.',
  },
  {
    id: 'f-after-refund',
    stage: 'after-trip',
    question: 'When will I receive my refund?',
    answer:
      'Once a refund has been agreed we pay it back to the method you paid with. How long it takes depends on the supplier, because we can only pass on money once the hotel or airline has released it, and on your bank, which typically needs a few working days after we have sent it.\n\nIf a refund is taking longer than you expected, contact us with your booking reference and we will tell you exactly where it is.',
  },
  {
    id: 'f-after-review',
    stage: 'after-trip',
    question: 'Can I leave a review?',
    answer:
      'Please do. You can leave a review through the link at the bottom of this page, and it takes about a minute.\n\nReviews are read by people deciding on their own holiday, so an honest account of how yours went, good or bad, is genuinely useful to them and to us.',
  },
  {
    id: 'f-after-invoice',
    stage: 'after-trip',
    question: 'Can I get a copy of my invoice or booking confirmation?',
    answer:
      'Yes. Sign in and open My Booking, where the confirmation and the invoice for every booking stay available to download after you return.\n\nIf you booked as a guest, contact us with your booking reference and we will email them to you.',
  },
];

export default FALLBACK_FAQS;
