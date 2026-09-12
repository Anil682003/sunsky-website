/**
 * CMS free text, ready to render as a text node.
 *
 * Content from the CMS is stored and rendered as PLAIN TEXT on purpose: neither
 * project has an HTML sanitizer, so anything markup-shaped is echoed as text
 * rather than trusted as markup. That is the right call and this does not
 * change it. Nothing here ever produces HTML.
 *
 * What it does fix is the one place that rule surprised an author. A line break
 * typed into a backend textarea used to collapse to a space on the site, so
 * people reached for `<br>` instead and saw it printed literally. Real newlines
 * are now honoured by the stylesheet (`white-space: pre-line`), and the `<br>`
 * already sitting in live content is mapped to the newline it was standing in
 * for, so those pages read correctly without anyone having to go back and edit
 * them.
 *
 * Only the break tag is translated. Every other angle bracket is left exactly
 * as typed, and still renders as visible text.
 */
export const cmsText = (value) =>
  String(value ?? '')
    // Windows and old Mac line endings first, so only one kind is handled below.
    .replace(/\r\n?/g, '\n')
    // <br>, <br/>, <br />, <BR>, and any newline the author pressed right after
    // it. The live footer text reads "SUNSKY.<br>\nZorgvuldig…": they typed the
    // tag AND hit Enter, so translating the tag on its own would leave two
    // breaks and an unwanted blank line. The pair means one break.
    .replace(/<br\s*\/?>[ \t]*\n?/gi, '\n');

export default cmsText;
