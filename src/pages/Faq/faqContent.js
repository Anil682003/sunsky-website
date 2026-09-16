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
    title: 'Voor je boekt',
    blurb: 'Prijzen, wat inbegrepen is, pakketreizen, bagage en betaalmogelijkheden.',
    match: [/before\s*(you\s*)?book/i, /voor\s*(je|u)?\s*boek/i, /booking\s*info/i],
  },
  {
    key: 'before-departure',
    title: 'Na je boeking',
    blurb: 'Je bevestiging, betalingen, wijzigingen, reisdocumenten en inchecken.',
    match: [/after\s*booking/i, /before\s*departure/i, /na\s*(je|de)?\s*boeking/i, /vertrek/i],
  },
  {
    key: 'during-trip',
    title: 'Tijdens je reis',
    blurb: 'Transfers, je hotel, gewijzigde vluchten, vertragingen en ons snel bereiken.',
    match: [/during\s*(your|the)?\s*(trip|travel|holiday)/i, /tijdens/i, /on\s*holiday/i],
  },
  {
    key: 'after-trip',
    title: 'Na je reis',
    blurb: 'Klachten, verloren of beschadigde bagage, terugbetalingen en feedback.',
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
    question: 'Hoe boek ik?',
    answer:
      'Zoek je bestemming en data, kies de accommodatie en het maaltijdtype dat je wil, vul daarna de gegevens van de reizigers in en betaal.\n\nZodra de boeking rond is, krijg je een bevestiging per e-mail. Je hebt geen account nodig om te boeken, maar als je inlogt staat je boeking meteen onder Mijn boeking. Daar vind je ze later het gemakkelijkst terug.',
  },
  {
    id: 'f-book-included',
    stage: 'before-booking',
    question: 'Wat is inbegrepen in de prijs?',
    answer:
      'De prijs die je ziet dekt wat in het prijsoverzicht bij het afrekenen staat, en er komt niets bij nadat je betaald hebt. Bij een hotel is dat de kamer en het maaltijdtype dat je koos. Bij een pakketreis is dat de vlucht, de accommodatie en het maaltijdtype, plus een transfer als je die toevoegde.\n\nBagage, reisverzekering, luchthaventransfers en andere extra\'s zijn optioneel en worden apart geprijsd bij het afrekenen, zodat je precies ziet wat elk van hen kost voor je beslist.',
  },
  {
    id: 'f-book-package',
    stage: 'before-booking',
    question: 'Wat is een dynamische pakketreis?',
    answer:
      'Een dynamische pakketreis is een vlucht en een hotel die op het moment van je zoekopdracht tot één boeking worden samengesteld, in plaats van een vaste brochurereis. Omdat beide live worden gecombineerd, heb je veel meer keuze in vertrekdata, reisduur en hotels, en ligt de gecombineerde prijs vaak lager dan wanneer je elk deel apart boekt.\n\nJe boekt ze, betaalt ze en krijgt er ondersteuning voor als één reis, onder één boekingsnummer.',
  },
  {
    id: 'f-book-payment',
    stage: 'before-booking',
    featured: true,
    question: 'Hoe betaal ik, en is dat veilig?',
    answer:
      'Je kan betalen met kredietkaart of debetkaart (Visa en Mastercard), Bancontact, iDEAL of PayPal. Welke methodes voor jou beschikbaar zijn, zie je in de betaalstap bij het afrekenen.\n\nBetalingen verlopen via een beveiligde verbinding bij een gereguleerde betaalprovider waarvan de systemen gecertificeerd zijn volgens de PCI-DSS-standaard. Wij zien of bewaren je volledige kaartnummer nooit.\n\nBij de boeking betaal je een voorschot, het saldo is verschuldigd voor vertrek.',
  },
  {
    id: 'f-book-baggage',
    stage: 'before-booking',
    featured: true,
    question: 'Is bagage inbegrepen?',
    answer:
      'Dat hangt af van het tarief. In de stap met extra\'s bij het afrekenen tonen we per reiziger en per richting wat het tarief al bevat, zodat je in één oogopslag ziet of ruimbagage bij het ticket hoort of niet.\n\nHeb je meer nodig dan het tarief bevat, dan kan je daar per reiziger handbagage of ruimbagage bijnemen. Bagage bijboeken op het moment van de boeking is vrijwel altijd goedkoper dan ze op de luchthaven betalen.',
  },
  {
    id: 'f-book-insurance',
    stage: 'before-booking',
    question: 'Heb ik een reisverzekering nodig?',
    answer:
      'Een reisverzekering is niet verplicht, maar wel sterk aanbevolen.\n\nZeker een annulatieverzekering kan kosten dekken die je anders kwijt bent als je moet annuleren om een reden die de polis dekt.\n\nIn de stap met extra\'s bij het afrekenen kan je kiezen voor annulatiedekking, reisdekking of beide samen. Bij elke optie zie je de prijs voor jouw reisgezelschap en data voor je ze selecteert.',
  },
  {
    id: 'f-book-perperson',
    stage: 'before-booking',
    question: 'Zijn de getoonde prijzen per persoon of in totaal?',
    answer:
      'Zoekresultaten tonen de totaalprijs voor het volledige reisgezelschap en het volledige verblijf waarop je zocht, zodat je hotels op een eerlijke manier met elkaar vergelijkt.\n\nBij het afrekenen wordt dat totaal daarna lijn per lijn opgesplitst, inclusief de extra\'s die je toevoegt en de boekingskosten, voor je gevraagd wordt te betalen.',
  },
  {
    id: 'f-book-deposit',
    stage: 'before-booking',
    question: 'Moet ik meteen het volledige bedrag betalen?',
    answer:
      'Bij sommige boekingen kan je nu een voorschot betalen en het saldo later. Waar dat van toepassing is, toont het afrekenscherm die mogelijkheid, samen met het bedrag dat vandaag verschuldigd is en de datum waarop het saldo vervalt.\n\nOf een voorschot mogelijk is, hangt af van de reis en van hoe dicht de vertrekdatum is. Boekingen kort voor vertrek moeten normaal in één keer volledig betaald worden.',
  },

  /* ── 2. After booking, before departure ────────────────────────────────── */
  {
    id: 'f-dep-confirm',
    stage: 'before-departure',
    featured: true,
    question: 'Wanneer is mijn boeking bevestigd?',
    answer:
      'Je boeking is bevestigd zodra je onze schriftelijke bevestiging ontvangt. Tot dan zijn de getoonde prijs en beschikbaarheid niet gegarandeerd.\n\nDie bevestiging komt normaal binnen enkele minuten na de betaling, al kan een leverancier die manueel bevestigt langer nodig hebben. Is ze na enkele uren nog niet toegekomen, kijk dan in je spammap en neem daarna contact met ons op.',
  },
  {
    id: 'f-dep-where',
    stage: 'before-departure',
    question: 'Waar vind ik mijn boeking terug?',
    answer:
      'Log in en open Mijn boeking. Alles wat met de reis te maken heeft staat daar: de bevestiging, wat betaald is en wat nog openstaat, je reisdocumenten en de gegevens van elke reiziger.\n\nBoekte je als gast, gebruik dan het boekingsnummer uit je bevestigingsmail, of maak een account aan met hetzelfde e-mailadres waarmee je boekte.',
  },
  {
    id: 'f-dep-documents',
    stage: 'before-departure',
    featured: true,
    question: 'Wanneer ontvang ik mijn reisdocumenten?',
    answer:
      'Reisdocumenten worden per e-mail verstuurd zodra je boeking volledig betaald is, normaal kort voor vertrek. Je kan ze ook op elk moment downloaden via Mijn boeking.\n\nNeem ze mee, geprint of op je telefoon. Bij het inchecken wordt ernaar gevraagd.',
  },
  {
    id: 'f-dep-change',
    stage: 'before-departure',
    featured: true,
    question: 'Kan ik mijn boeking wijzigen?',
    answer:
      'Wijzigen kan vaak, maar het hangt af van de voorwaarden van de luchtvaartmaatschappij, het hotel of de betrokken leverancier, en sommige wijzigingen brengen kosten met zich mee.\n\nNeem zo vroeg mogelijk contact met ons op met je boekingsnummer. Wij vertellen je wat mogelijk is en wat het kost, voor er iets gewijzigd wordt.',
  },
  {
    id: 'f-dep-cancel',
    stage: 'before-departure',
    question: 'Wat gebeurt er als ik moet annuleren?',
    answer:
      'Annulatiekosten hangen af van hoe kort voor vertrek je annuleert en van de voorwaarden van je boeking. De schaal die op jou van toepassing is, staat in de Algemene Reisvoorwaarden en werd getoond voor je boekte.\n\nHeb je een annulatieverzekering afgesloten, dan kunnen kosten die je anders kwijt bent gedekt zijn, als de reden van annulatie door de polis gedekt wordt.',
  },
  {
    id: 'f-dep-balance',
    stage: 'before-departure',
    question: 'Hoe betaal ik het openstaande saldo?',
    answer:
      'Betaalde je een voorschot, dan zie je het openstaande bedrag en de vervaldatum in Mijn boeking. Je kan het daar betalen met dezelfde methodes als bij het voorschot.\n\nWe herinneren je ook per e-mail voor het saldo vervalt. Op tijd betalen is belangrijk: een onbetaald saldo kan ertoe leiden dat de leverancier de boeking annuleert.',
  },
  {
    id: 'f-dep-passport',
    stage: 'before-departure',
    question: 'Welke documenten heb ik nodig om te reizen?',
    answer:
      'Je bent zelf verantwoordelijk voor geldige reisdocumenten. De vereisten verschillen per bestemming en per nationaliteit, en ze veranderen.\n\nAls regel heb je een paspoort of identiteitskaart nodig die geldig is voor de hele reis, en veel bestemmingen vragen een paspoort dat na je terugkeer nog enkele maanden geldig blijft. Sommige bestemmingen vragen of raden ook vaccinaties aan.\n\nRaadpleeg ruim voor vertrek het officiële reisadvies van de overheid voor je bestemming. Een reis die niet doorgaat door een probleem met documenten kan niet terugbetaald worden. Twijfel je wat voor jouw boeking geldt, neem dan contact met ons op en we wijzen je de juiste bron.',
  },
  {
    id: 'f-dep-checkin',
    stage: 'before-departure',
    question: 'Hoe werkt online inchecken?',
    answer:
      'Online inchecken gebeurt bij de luchtvaartmaatschappij, niet bij ons. Het opent meestal tussen 48 en 24 uur voor vertrek, en je doet het op de website van de maatschappij met het boekingsnummer van de luchtvaartmaatschappij dat op je reisdocumenten staat.\n\nSommige maatschappijen rekenen kosten aan om op de luchthaven in te checken, dus doe het online zodra het kan.',
  },
  {
    id: 'f-dep-extras',
    stage: 'before-departure',
    question: 'Kan ik na het boeken nog bagage of andere extra\'s toevoegen?',
    answer:
      'Meestal wel. Extra bagage, een luchthaventransfer of een stoelvoorkeur kunnen vaak nog toegevoegd worden nadat de boeking bevestigd is, afhankelijk van de beschikbaarheid en van de prijs van de luchtvaartmaatschappij op dat moment.\n\nNeem contact met ons op met je boekingsnummer en laat weten wat je wil bijnemen. Prijzen voor later toegevoegde extra\'s worden bepaald door de luchtvaartmaatschappij en liggen normaal hoger dan op het moment van de boeking.',
  },
  {
    id: 'f-dep-name',
    stage: 'before-departure',
    question: 'De naam op mijn boeking klopt niet. Wat nu?',
    answer:
      'Laat het ons weten zodra je het merkt. Namen op een vluchtboeking moeten exact overeenkomen met het paspoort, en luchtvaartmaatschappijen behandelen een naamswijziging heel anders dan een schrijffout: een kleine tikfout kan vaak rechtgezet worden, terwijl overzetten naar een andere reiziger meestal opnieuw boeken betekent.\n\nHoe sneller je contact opneemt, hoe meer mogelijkheden er zijn en hoe minder het waarschijnlijk kost.',
  },

  /* ── 3. During your trip ───────────────────────────────────────────────── */
  {
    id: 'f-trip-contact',
    stage: 'during-trip',
    question: 'Hoe bereik ik SUNSKY terwijl ik op reis ben?',
    answer:
      'Bel tijdens de kantooruren +32 11 57 44 27 of mail naar info@sunsky.be, en hou je boekingsnummer bij de hand zodat we je boeking meteen kunnen terugvinden.\n\nVoor een dringend probleem tijdens je reis dat niet kan wachten tot onze openingsuren, gebruik je de noodlijn voor reizigers op +32 497 54 38 16. Die lijn is bedoeld voor noodgevallen onderweg, niet voor algemene vragen, wijzigingen of nieuwe boekingen.\n\nOp je reisdocumenten staan ook de lokale contactgegevens die je ter plaatse nodig hebt, zoals de transfermaatschappij en het hotel.',
  },
  {
    id: 'f-trip-transfer',
    stage: 'during-trip',
    question: 'Mijn luchthaventransfer is niet komen opdagen. Wat moet ik doen?',
    answer:
      'Bel eerst de lokale transferleverancier op het nummer dat op je transfervoucher staat. Zij zijn ter plaatse en vinden de chauffeur meestal binnen enkele minuten terug. Op je voucher staat ook het afgesproken ontmoetingspunt, dat vaak niet vlak buiten de aankomsthal ligt.\n\nKrijg je hen niet te pakken, neem dan contact met ons op en wij gaan erachteraan. Regel en betaal geen eigen taxi voor je een van ons gesproken hebt: een niet-goedgekeurde kost is achteraf veel moeilijker terug te vorderen.',
  },
  {
    id: 'f-trip-hotel',
    stage: 'during-trip',
    question: 'Er is een probleem met mijn hotelkamer. Wat moet ik doen?',
    answer:
      'Meld het meteen aan de receptie van het hotel en geef hen de kans om het recht te zetten. De meeste problemen, van een kamer die niet overeenkomt met wat geboekt werd tot iets dat niet werkt, worden ter plaatse opgelost.\n\nLost het hotel het niet op, neem dan contact met ons op terwijl je er nog bent. Een probleem dat we tijdens het verblijf horen, kan vaak nog opgelost of vergoed worden. Datzelfde probleem pas na je thuiskomst melden kan zelden nog, omdat er dan niets meer vast te stellen valt.',
  },
  {
    id: 'f-trip-delay',
    stage: 'during-trip',
    question: 'Mijn vlucht heeft vertraging of is geannuleerd. Wat zijn mijn rechten?',
    answer:
      'Voor vluchten die uit de EU vertrekken, en voor vluchten naar de EU met een EU-maatschappij, geeft Verordening (EG) 261/2004 je recht op bijstand van de luchtvaartmaatschappij en, bij langere vertragingen en annulaties binnen de controle van de maatschappij, op compensatie. De luchtvaartmaatschappij handelt dit af, dus bewaar je instapkaarten en eventuele bewijsstukken.\n\nRaakt de verstoring de rest van je reis, bijvoorbeeld een transfer die je nu mist, neem dan contact met ons op zodat we kunnen verplaatsen wat verplaatst kan worden.',
  },
  {
    id: 'f-trip-schedule',
    stage: 'during-trip',
    question: 'Mijn vluchturen zijn gewijzigd. Wat nu?',
    answer:
      'Luchtvaartmaatschappijen passen hun uurregeling soms aan, soms maanden op voorhand en af en toe op korte termijn. Gebeurt dat bij jouw boeking, dan mailen we je de nieuwe uren en leggen we uit wat dat betekent voor de rest van de reis, inclusief een transfer die mee moet verschuiven.\n\nPassen de nieuwe uren je niet, antwoord dan op die mail of bel ons, en we overlopen samen de alternatieven.',
  },
  {
    id: 'f-trip-wrong',
    stage: 'during-trip',
    question: 'Wat als er iets misloopt terwijl ik weg ben?',
    answer:
      'Meld het probleem meteen aan de leverancier en aan onze noodlijn, zodat het ter plaatse rechtgezet kan worden. Ons die kans geven is een voorwaarde van je overeenkomst.\n\nKan het lokaal niet opgelost worden, neem dan contact met ons op zodra je thuis bent. Wij nemen het dan namens jou op met het hotel of de luchtvaartmaatschappij. Bewaar foto\'s, bonnetjes of schriftelijke vaststellingen: dat is wat een leverancier zal vragen.',
  },
  {
    id: 'f-trip-emergency',
    stage: 'during-trip',
    question: 'Wat moet ik doen bij een noodgeval?',
    answer:
      'Bel bij een medisch of veiligheidsnoodgeval altijd eerst de lokale hulpdiensten. In de hele EU is dat 112.\n\nNeem daarna contact op met je reisverzekeraar. Hun noodnummer staat op je polis en zij regelen medische kosten en repatriëring.\n\nLaat het ook ons weten, via de noodlijn voor reizigers op +32 497 54 38 16, zodat we kunnen helpen met het reisgedeelte, bijvoorbeeld het verplaatsen van een terugvlucht.',
  },

  /* ── 4. After your trip ────────────────────────────────────────────────── */
  {
    id: 'f-after-complaint',
    stage: 'after-trip',
    question: 'Hoe dien ik een klacht in?',
    answer:
      'Mail ons met je boekingsnummer, wat er misliep en eventuele foto\'s of documenten die dat staven. Hoe concreter de details, hoe sneller we het kunnen opnemen met het hotel of de luchtvaartmaatschappij.\n\nNeem zo snel mogelijk na je terugkeer contact op. Leveranciers hanteren hun eigen termijnen voor het behandelen van klachten, en een late melding kan ons zonder mogelijkheden zetten om ze nog te behartigen.',
  },
  {
    id: 'f-after-baggage',
    stage: 'after-trip',
    question: 'Mijn bagage was beschadigd of is niet aangekomen. Wat moet ik doen?',
    answer:
      'Meld het op de luchthaven voor je de bagagehal verlaat en vraag een schriftelijk rapport, meestal een PIR genoemd. Zonder dat rapport aanvaardt een luchtvaartmaatschappij een claim normaal gezien niet.\n\nBagage is de verantwoordelijkheid van de luchtvaartmaatschappij, dus de claim gaat naar hen, en ook je reisverzekering kan dekking bieden. Bezorg ons een kopie van het rapport en we helpen je de claim samen te stellen.',
  },
  {
    id: 'f-after-refund',
    stage: 'after-trip',
    question: 'Wanneer krijg ik mijn terugbetaling?',
    answer:
      'Zodra een terugbetaling is afgesproken, storten we ze terug via de methode waarmee je betaalde. Hoe lang dat duurt hangt af van de leverancier, omdat wij het geld pas kunnen doorstorten zodra het hotel of de luchtvaartmaatschappij het heeft vrijgegeven, en van je bank, die daarna doorgaans enkele werkdagen nodig heeft.\n\nDuurt een terugbetaling langer dan je verwachtte, neem dan contact met ons op met je boekingsnummer en we zeggen je precies waar ze zit.',
  },
  {
    id: 'f-after-review',
    stage: 'after-trip',
    question: 'Kan ik een review achterlaten?',
    answer:
      'Heel graag. Je kan een review achterlaten via de link onderaan deze pagina, en het duurt ongeveer een minuut.\n\nReviews worden gelezen door mensen die hun eigen reis aan het kiezen zijn. Een eerlijk verslag van hoe die van jou verliep, goed of slecht, is dus echt nuttig voor hen en voor ons.',
  },
  {
    id: 'f-after-invoice',
    stage: 'after-trip',
    question: 'Kan ik een kopie krijgen van mijn factuur of boekingsbevestiging?',
    answer:
      'Ja. Log in en open Mijn boeking. De bevestiging en de factuur van elke boeking blijven daar ook na je terugkeer beschikbaar om te downloaden.\n\nBoekte je als gast, neem dan contact met ons op met je boekingsnummer en we mailen ze je door.',
  },
];

export default FALLBACK_FAQS;
