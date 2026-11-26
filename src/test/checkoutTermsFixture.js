/**
 * A server "Garantie en voorwaarden" view (POST /website/checkout-terms) for checkout tests.
 *
 * The shared setup mocks fetchCheckoutTerms with this, built from the booking body the page
 * sends, so every checkout test reaches a payment step with real-looking terms: one travel
 * checkbox, plus the Allianz checkbox when cover was chosen. Tests about the terms themselves
 * override the mock.
 */
const seg = (markup) => {
  const out = [];
  const re = /\[([A-Z_]+):([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(markup))) {
    if (m.index > last) out.push({ text: markup.slice(last, m.index) });
    out.push({ link: m[1], text: m[2] });
    last = re.lastIndex;
  }
  if (last < markup.length) out.push({ text: markup.slice(last) });
  return out;
};
const decl = (code, markup) => {
  const segments = seg(markup);
  return { code, segments, text: segments.map((x) => x.text).join('') };
};
const doc = (id, documentType, name, url, status = 'ACCEPTED') => ({ documentId: id, versionId: id * 10, versionLabel: '2026.1', documentType, name, label: name, url, status });

export function termsViewFor(body = {}) {
  const insurances = (body.insurances || []).map((i) => (i.type === 'cancel' ? 'CANCELLATION' : 'ASSISTANCE'));
  const isPackage = !!(body.hotel && (body.flight || body.transfer));
  const general = doc(1, 'GENERAL_CONDITIONS', 'Algemene reisvoorwaarden', '/p/terms#algemene');
  const special = doc(2, 'SPECIAL_CONDITIONS', 'Bijzondere reisvoorwaarden van SUNSKY', '/p/terms#bijzondere');
  const travelDocuments = [general, special];
  if (isPackage) travelDocuments.push(doc(3, 'STANDARD_INFO_FORM', 'Standaardinformatieformulier voor pakketreizen', '/p/terms#standaard', 'ACKNOWLEDGED'));
  travelDocuments.push({ ...doc(4, 'CANCELLATION_CONDITIONS', 'Annuleringsvoorwaarden', '/p/terms#annulering'), label: 'Annulerings- en wijzigingsvoorwaarden' });
  const products = insurances.map((p) => ({
    product: p,
    label: p === 'CANCELLATION' ? 'Annuleringsverzekering' : 'Reisbijstandsverzekering',
    documents: [{ ...doc(p === 'CANCELLATION' ? 9 : 11, 'INSURANCE_CONDITIONS', `Voorwaarden ${p}`, `https://cdn.test/${p}.pdf`), label: `Verzekeringsvoorwaarden ${p.toLowerCase()}` }],
  }));
  return {
    textVersion: 'test',
    language: body.language || 'nl',
    market: 'BE',
    legalBookingType: isPackage ? 'PACKAGE' : 'SINGLE_SERVICE',
    legalRole: isPackage ? 'ORGANISER' : 'RETAILER',
    legalRoleLabel: isPackage ? 'Organisator van de pakketreis' : 'Verkoper van een afzonderlijke reisdienst',
    sectionTitle: 'Garantie en voorwaarden',
    travelInfo: decl('TRAVEL_INFO', 'Ik heb kennisgenomen van de [TRAVEL_DESCRIPTION:beschrijving van mijn reis], de [IMPORTANT_TRAVEL_INFO:belangrijke reisinformatie] en het [TRAVEL_ADVICE:actuele reisadvies].'),
    travelDocuments,
    travelDeclaration: decl('TRAVEL_ACCEPTANCE', 'Ik bevestig dat de ingevoerde reizigersgegevens correct zijn. Ik ga akkoord met de [GENERAL_CONDITIONS:algemene reisvoorwaarden], de [SPECIAL_CONDITIONS:bijzondere reisvoorwaarden van SUNSKY] en de overige toepasselijke boekingsvoorwaarden. Ik bevestig dat ik kennis heb genomen van de bovenstaande reisinformatie.'),
    insurance: products.length ? {
      title: 'Verzekeringen',
      products,
      declaration: decl('INSURANCE_ACCEPTANCE', products.length > 1
        ? 'Ik ga akkoord met de voorwaarden van mijn gekozen verzekeringen en bevestig dat ik kennis heb genomen van de bijbehorende informatiedocumenten.'
        : 'Ik ga akkoord met de voorwaarden van mijn gekozen verzekering en bevestig dat ik kennis heb genomen van de bijbehorende informatiedocumenten.'),
    } : null,
    info: [decl('PRIVACY', 'Meer informatie over de verwerking van je persoonsgegevens vind je in onze [PRIVACY_STATEMENT:privacyverklaring].')],
    finalTitle: 'Definitieve boeking',
    finalDeclaration: [
      decl('FINAL_OBLIGATION', 'Door je boeking te bevestigen, ga je een betalingsverplichting aan voor het volledige boekingsbedrag.'),
      decl('FINAL_WITHDRAWAL', 'Op deze reisboeking is geen wettelijk [WITHDRAWAL_INFO:herroepingsrecht] van toepassing. Bij annulering gelden de toepasselijke [CANCELLATION_CONDITIONS:annuleringsvoorwaarden].'),
    ],
    payButtonTemplate: 'Boek en betaal {amount}',
    links: {
      GENERAL_CONDITIONS: general,
      SPECIAL_CONDITIONS: special,
      CANCELLATION_CONDITIONS: travelDocuments.find((d) => d.documentType === 'CANCELLATION_CONDITIONS'),
      PRIVACY_STATEMENT: doc(6, 'PRIVACY_STATEMENT', 'privacyverklaring', '/p/privacy#privacyverklaring', 'PROVIDED'),
      WITHDRAWAL_INFO: doc(17, 'WITHDRAWAL_INFO', 'herroepingsrecht', '/p/terms#herroepingsrecht', 'PROVIDED'),
      TRAVEL_ADVICE: { documentType: 'TRAVEL_ADVICE', url: 'https://diplomatie.belgium.be/nl/reisadviezen', name: 'Reisadvies', status: 'ACKNOWLEDGED' },
      IMPORTANT_TRAVEL_INFO_DOCS: [],
    },
    requiredCheckboxes: products.length ? ['TRAVEL_ACCEPTANCE', 'INSURANCE_ACCEPTANCE'] : ['TRAVEL_ACCEPTANCE'],
    blocked: false,
    missing: [],
    termsKey: `test-terms-${isPackage ? 'package' : 'single'}-${insurances.join('+') || 'none'}`,
  };
}

export default termsViewFor;
