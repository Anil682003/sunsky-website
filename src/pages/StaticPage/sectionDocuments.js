/**
 * The PDFs attached to a CMS section, as [{ url, name, size, label }].
 * Since 25 Nov 2026 the admin saves a LIST (`documents`, up to 5 per section; Levent: "2 or 3").
 * Pages saved before hold one PDF in documentUrl/Name/Size/Label: read as a list of one.
 */
export function sectionDocuments(section) {
  const list = Array.isArray(section?.documents) && section.documents.length
    ? section.documents
    : section?.documentUrl
      ? [{ url: section.documentUrl, name: section.documentName, size: section.documentSize, label: section.documentLabel }]
      : [];
  return list.filter((d) => d && typeof d.url === 'string' && d.url.trim());
}
