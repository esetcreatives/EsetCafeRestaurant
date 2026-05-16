/**
 * downloadReceiptAsPDF
 *
 * Renders the receipt HTML element (by id) into a canvas with html2canvas,
 * then saves it as a single-page PDF using jsPDF.
 * Falls back to PNG download if PDF generation fails.
 */
export async function downloadReceiptAsPDF(
  elementId: string,
  filename: string = 'receipt.pdf'
): Promise<void> {
  // Dynamically import to keep initial bundle size small
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`[downloadReceiptAsPDF] Element #${elementId} not found`);
    return;
  }

  // Make sure the element is visible before capturing
  const originalDisplay = element.style.display;
  const originalVisibility = element.style.visibility;
  const originalPosition = element.style.position;

  element.style.display = 'block';
  element.style.visibility = 'visible';
  element.style.position = 'fixed';
  element.style.top = '-9999px';
  element.style.left = '-9999px';

  try {
    const canvas = await html2canvas(element, {
      scale: 3, // High-DPI for crisp receipt text
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // Receipt is ~80mm wide — use that as the PDF page width
    const imgData = canvas.toDataURL('image/png');
    const pxPerMm = canvas.width / 80; // canvas width / receipt width in mm
    const pdfWidth = 80;
    const pdfHeight = canvas.height / pxPerMm;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(filename);
  } catch (err) {
    console.error('[downloadReceiptAsPDF] PDF generation failed, falling back to PNG:', err);

    // Fallback: download as PNG image
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const link = document.createElement('a');
    link.download = filename.replace('.pdf', '.png');
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    // Restore original styles
    element.style.display = originalDisplay;
    element.style.visibility = originalVisibility;
    element.style.position = originalPosition;
    element.style.top = '';
    element.style.left = '';
  }
}
