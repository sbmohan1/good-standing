/**
 * A deliberately small Markdown → HTML renderer for the documents Good Standing generates
 * (headings, paragraphs, lists, tables, blockquotes, bold, links, rules; underscores are left alone so file names survive). Everything is
 * HTML-escaped first: record values come from uploaded documents and must never become markup.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\\\|/g, "|")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length;
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
      i++;
    } else if (line.trim() === "---") {
      out.push("<hr>");
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) rows.push(lines[i++] ?? "");
      const [head, , ...body] = rows;
      out.push(
        `<table><thead><tr>${splitRow(head ?? "").map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${splitRow(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i] ?? "")) items.push((lines[i++] ?? "").replace(/^(- |\d+\. )/, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
    } else if (line.startsWith("> ")) {
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^(#{1,3} |\||- |\d+\. |> |---)/.test(lines[i] ?? "")) para.push(lines[i++] ?? "");
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

/** Open a print-ready copy so the founder can save it as a PDF from the browser's print dialog. */
export function printMarkdown(title: string, markdown: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body { font: 13px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; max-width: 760px; margin: 32px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin: 0 0 8px; } h2 { font-size: 16px; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; } th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f5f5f7; } blockquote { margin: 12px 0; padding: 8px 12px; background: #f5f5f7; border-left: 3px solid #999; }
    a { color: #333; } li { margin-bottom: 4px; } hr { border: 0; border-top: 1px solid #ddd; margin: 24px 0; }
    @page { margin: 18mm; }
  </style></head><body>${markdownToHtml(markdown)}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  return true;
}
