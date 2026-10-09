# GTM container setup — `GTM-5S2JNLWZ`

The website emits four events into the dataLayer. This container forwards them to GA4
`G-X4N72FR2YL`. Import the JSON beside this file, or build it by hand from section 3.

**Nothing reaches GA4 until this is done.** The site side is finished and deployed; the
container is currently published and empty.

---

## 1. Import (2 minutes)

1. `tagmanager.google.com` → open `GTM-5S2JNLWZ`
2. **Admin → Import Container**
3. Choose `gtm-sunsky-ga4-container.json`
4. Workspace: **New**, name it `GA4 funnel`
5. Import option: **Merge → Rename conflicting tags, triggers and variables**
   (Merge, not Overwrite. Overwrite discards anything already in the container.)
6. Review the preview. It should list 12 variables, 4 triggers, 5 tags, and delete nothing.
7. **Confirm**

Then go to section 4 and verify BEFORE publishing.

If the import errors, the file is only a shortcut — build it by hand from section 3 instead.

---

## 2. What it creates, and why

| | |
|---|---|
| 12 Data Layer Variables | one per field the site emits |
| 4 Custom Event triggers | `search`, `view_item`, `begin_checkout`, `purchase` |
| 1 Google Tag | GA4 `G-X4N72FR2YL`, on All Pages |
| 4 GA4 Event tags | one per funnel event |

Two settings matter more than the rest:

**Every trigger requires `tracking_environment` equals `production`.** The site stamps that
field on every event from `VITE_TRACKING_ENV`. A development or UAT build sends
`development`, so it cannot reach the live property even if someone points it at this
container by mistake. Do not remove that condition.

**Every tag requires `analytics_storage` consent.** The site already pushes Consent Mode v2
defaults with everything denied and updates them when the visitor chooses, so GTM only has to
respect them. The container itself is not even loaded until consent is given.

**Ecommerce comes straight from the dataLayer.** The site emits GA4's own shape:
`ecommerce.value`, `ecommerce.currency`, `ecommerce.transaction_id` and `ecommerce.items[]`.
The event tags use *Send Ecommerce data = Data Layer*. Never hand-map those four; mapping them
manually is how `purchase` ends up with no revenue.

---

## 3. Building it by hand, if the import fails

**Variables** → New → Data Layer Variable. Name each `DLV - <key>`, Data Layer Variable Name
exactly the key, version 2:

```
product_type  country  destination  hotel_id  hotel_name  departure_date
departure_airport  duration  adults  children  board_type  tracking_environment
```

**Triggers** → New → Custom Event, one per event name below. Set *Some Custom Events* with
the condition `DLV - tracking_environment` **equals** `production`:

```
search    view_item    begin_checkout    purchase
```

**Tags:**

- *Google Tag*, Tag ID `G-X4N72FR2YL`, trigger **All Pages**.
- Four *GA4 Event* tags. Event name = the event. Measurement ID = the Google Tag above.
  For `view_item`, `begin_checkout` and `purchase` tick **Send Ecommerce data**, source
  **Data Layer**. Under *Event Parameters* add the dimension variables. Trigger = the
  matching custom event trigger.

Then on every tag: **Consent Settings → Require additional consent → `analytics_storage`**.

---

## 4. Verify before publishing

GTM **Preview** → `https://holidaybooking.be`.

1. **Before accepting cookies**: no GA4 tag should fire. The container should not even load.
2. Accept cookies, then: run a search, open a hotel, start a checkout.
   `search`, `view_item` and `begin_checkout` should fire with their fields populated.
3. GA4 → Reports → **Realtime** should show the same events within a minute.
4. Make a test booking. Exactly **one** `purchase`, with the real booking reference as
   `transaction_id` and the charged amount as `value`.
5. **Refresh the confirmation page.** No second `purchase`. The site deduplicates by booking
   reference, but see it with your own eyes.
6. A failed supplier booking must produce **no** `purchase` at all.

Only then **Submit → Publish**.

---

## 5. Still outstanding on the Google side

- **Turn off Enhanced Measurement** on the GA4 data stream. The site sends its own `search`
  and `purchase`; leaving it on counts them twice.
- **The stream URL is `https://www.sunsky.be`**, not holidaybooking.be. Correct if the site
  is moving there; wrong if it is not. Decide before submitting anything to Search Console.
- **Google Ads**: no conversion action exists yet. When there is one, add a *Google Ads
  Conversion Tracking* tag with conversion value `{{DLV - ...}}` from `ecommerce.value`,
  currency `EUR`, transaction ID from `ecommerce.transaction_id`, on the **purchase** trigger,
  requiring `ad_storage` consent.
