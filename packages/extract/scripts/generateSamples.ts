/**
 * Generates the synthetic Lumen Labs documents used by the demo and the extraction eval.
 * Lumen Labs, Inc. and every person, address and number here are fictional. The text is written
 * for this project; it is not a legal template and is not copied from Stripe Atlas documents.
 *
 * Run: pnpm --filter @good-standing/extract samples
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../samples");

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 72;
const BODY_SIZE = 11;
const LINE_GAP = 5;

type Block = { kind: "title" | "heading" | "para" | "small"; text: string };

interface SampleDoc {
  fileName: string;
  title: string;
  pages: Block[][];
}

const FOOTER = "SAMPLE: fictional company created for the Good Standing demo. Not a legal template.";

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    fileName: "Lumen Labs - Certificate of Incorporation (SAMPLE).pdf",
    title: "Certificate of Incorporation of Lumen Labs, Inc. (SAMPLE)",
    pages: [
      [
        { kind: "title", text: "CERTIFICATE OF INCORPORATION OF LUMEN LABS, INC." },
        { kind: "small", text: "Delaware File Number: SAMPLE-7654321" },
        { kind: "heading", text: "FIRST" },
        { kind: "para", text: "The name of the corporation is Lumen Labs, Inc. (the \"Corporation\")." },
        { kind: "heading", text: "SECOND" },
        {
          kind: "para",
          text: "The Corporation's registered office in the State of Delaware is located at 100 Example Avenue, Suite 1, Wilmington, Delaware 19801, a fictional address. The registered agent at that address is Example Registered Agent Services, a fictional company.",
        },
        { kind: "heading", text: "THIRD" },
        {
          kind: "para",
          text: "The Corporation may engage in any lawful act or activity for which corporations may be organized under the General Corporation Law of the State of Delaware.",
        },
        { kind: "heading", text: "FOURTH" },
        {
          kind: "para",
          text: "The total number of shares of stock which the Corporation is authorized to issue is 10,000,000 shares of Common Stock, par value $0.00001 per share.",
        },
      ],
      [
        { kind: "heading", text: "FIFTH" },
        {
          kind: "para",
          text: "The Board of Directors may adopt, amend or repeal the bylaws of the Corporation. Elections of directors need not be by written ballot unless the bylaws so provide.",
        },
        { kind: "heading", text: "SIXTH" },
        {
          kind: "para",
          text: "To the fullest extent permitted by the General Corporation Law of the State of Delaware, a director of the Corporation shall not be personally liable to the Corporation or its stockholders for monetary damages for breach of fiduciary duty as a director.",
        },
        { kind: "heading", text: "SEVENTH" },
        {
          kind: "para",
          text: "The incorporator is Alex Example, 100 Example Avenue, Suite 1, Wilmington, Delaware 19801, a fictional person.",
        },
        { kind: "heading", text: "FILING" },
        { kind: "para", text: "Filed with the Delaware Secretary of State on February 10, 2026." },
      ],
    ],
  },
  {
    fileName: "Lumen Labs - Stock Purchase Agreement (SAMPLE).pdf",
    title: "Founder Stock Purchase Agreement, Lumen Labs, Inc. (SAMPLE)",
    pages: [
      [
        { kind: "title", text: "FOUNDER STOCK PURCHASE AGREEMENT" },
        {
          kind: "para",
          text: "This Founder Stock Purchase Agreement (the \"Agreement\") is dated as of February 12, 2026, between Lumen Labs, Inc., a Delaware corporation (the \"Company\"), and Priya Raman (the \"Purchaser\").",
        },
        { kind: "heading", text: "1. Purchase of Shares" },
        {
          kind: "para",
          text: "On the terms of this Agreement, the Purchaser shall purchase 8,000,000 shares of Common Stock of the Company (the \"Shares\") at a price of $0.00001 per share, for a total purchase price of $80.00, paid in cash at signing.",
        },
        { kind: "heading", text: "2. Vesting" },
        {
          kind: "para",
          text: "The Shares vest over four years. Twenty-five percent vest on the first anniversary of the date of this Agreement, and the remainder vest in equal monthly installments over the following thirty-six months, subject to the Purchaser's continued service.",
        },
        { kind: "heading", text: "3. Section 83(b) Election" },
        {
          kind: "para",
          text: "The Purchaser understands that any election under Section 83(b) of the Internal Revenue Code must be filed with the IRS within 30 days after the Shares are issued, and that the Purchaser is responsible for that filing.",
        },
      ],
      [
        { kind: "heading", text: "4. General" },
        {
          kind: "para",
          text: "This Agreement is governed by the laws of the State of Delaware. It is the entire agreement between the parties about the Shares and may be amended only in writing signed by both parties.",
        },
        { kind: "heading", text: "Signatures" },
        { kind: "para", text: "LUMEN LABS, INC.    By: Priya Raman, Chief Executive Officer" },
        { kind: "para", text: "PURCHASER    Priya Raman" },
      ],
    ],
  },
  {
    fileName: "Lumen Labs - Delaware Franchise Tax Notice (SAMPLE).pdf",
    title: "Delaware Franchise Tax Notice, Lumen Labs, Inc. (SAMPLE)",
    pages: [
      [
        { kind: "title", text: "ANNUAL FRANCHISE TAX NOTICE (SAMPLE)" },
        {
          kind: "small",
          text: "Fictional sample for the Good Standing demo, showing the kind of notice a Delaware corporation receives. Not issued by the State of Delaware.",
        },
        { kind: "para", text: "Corporation: LUMEN LABS, INC." },
        { kind: "para", text: "Delaware File Number: SAMPLE-7654321" },
        { kind: "para", text: "Tax Year: 2026" },
        { kind: "heading", text: "Amount Due" },
        { kind: "para", text: "Franchise Tax: $85,165.00" },
        { kind: "para", text: "Annual Report Filing Fee: $50.00" },
        { kind: "para", text: "Total Due: $85,215.00" },
        { kind: "para", text: "Payment and annual report due by March 1, 2027." },
        {
          kind: "para",
          text: "This amount was calculated using the Authorized Shares method. Corporations may use the Assumed Par Value Capital method by reporting gross assets and issued shares in the annual report.",
        },
      ],
    ],
  },
];

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWatermark(page: PDFPage, bold: PDFFont): void {
  // Drawn last so the body text stays in reading order when extracted.
  page.drawText("SAMPLE: fictional company", {
    x: 120,
    y: 240,
    size: 44,
    font: bold,
    color: rgb(0.85, 0.2, 0.2),
    opacity: 0.18,
    rotate: degrees(35),
  });
}

async function renderDoc(doc: SampleDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setAuthor("Good Standing demo (fictional)");
  pdf.setSubject("SAMPLE: fictional company");
  // Fixed dates keep the generated bytes stable between runs.
  pdf.setCreationDate(new Date("2026-11-21T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-11-21T00:00:00Z"));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE.width - MARGIN * 2;

  doc.pages.forEach((blocks, index) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - MARGIN;

    for (const block of blocks) {
      const font = block.kind === "title" || block.kind === "heading" ? bold : regular;
      const size = block.kind === "title" ? 14 : block.kind === "small" ? 9 : BODY_SIZE;
      if (block.kind === "heading") y -= 8;
      for (const line of wrap(block.text, font, size, maxWidth)) {
        page.drawText(line, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) });
        y -= size + LINE_GAP;
      }
      y -= block.kind === "title" ? 12 : 6;
    }

    page.drawText(`${FOOTER}  Page ${index + 1} of ${doc.pages.length}`, {
      x: MARGIN,
      y: 40,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.45, 0.45),
    });
    drawWatermark(page, bold);
  });

  return pdf.save();
}

async function main(): Promise<void> {
  for (const doc of SAMPLE_DOCS) {
    const bytes = await renderDoc(doc);
    await writeFile(path.join(outDir, doc.fileName), bytes);
    process.stdout.write(`wrote samples/${doc.fileName} (${bytes.length} bytes)\n`);
  }
}

await main();
