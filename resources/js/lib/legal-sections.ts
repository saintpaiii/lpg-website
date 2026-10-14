// Terms & Policies are stored as Markdown, but the admin edits them as plain sections:
// an introduction, then numbered sections with a title, an optional paragraph and bullet points.
// parseLegal() turns the stored Markdown into sections; buildLegal() turns them back into Markdown.

export type LegalSection = { heading: string; points: string[]; paragraph: string };
export type LegalDraft = { intro: string; sections: LegalSection[] };

/** Remove inline Markdown so the admin only ever sees plain words. */
function plain(text: string): string {
    return text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) → text
        .replace(/\*\*(.+?)\*\*/g, '$1')            // **bold** → bold
        .replace(/__(.+?)__/g, '$1')
        .replace(/^#{3,6}\s+/, '');                 // ### Sub-heading → Sub-heading
}

/** Paragraph lines → one string; blank lines between paragraphs are kept. */
function joinParagraphs(lines: string[]): string {
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseLegal(markdown: string): LegalDraft {
    const introLines: string[] = [];
    const sections: (LegalSection & { paraLines: string[] })[] = [];
    let current: (LegalSection & { paraLines: string[] }) | null = null;
    let prevWasText = false;   // previous line was paragraph text (lines that follow directly belong to the same paragraph)

    for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
        const line = raw.trimEnd();
        const heading = line.match(/^##\s+(.*)$/);
        if (heading) {
            prevWasText = false;
            current = { heading: plain(heading[1]).replace(/^\d+[.)]\s*/, '').trim(), points: [], paragraph: '', paraLines: [] };
            sections.push(current);
            continue;
        }
        if (!current) {
            introLines.push(plain(line));
            continue;
        }
        const point = line.match(/^\s*[-*]\s+(.*)$/);
        if (point) {
            current.points.push(plain(point[1]).trim());
            prevWasText = false;
        } else if (line.trim() !== '') {
            // A new paragraph (not directly under the previous text line) gets a blank line before it
            if (current.paraLines.length && !prevWasText) current.paraLines.push('');
            current.paraLines.push(plain(line.trim()));
            prevWasText = true;
        } else {
            prevWasText = false;
        }
    }

    return {
        intro: joinParagraphs(introLines),
        sections: sections.map((s) => ({ heading: s.heading, points: s.points, paragraph: joinParagraphs(s.paraLines) })),
    };
}

export function buildLegal(draft: LegalDraft): string {
    const blocks: string[] = [];
    if (draft.intro.trim()) blocks.push(draft.intro.trim());

    let n = 0;
    for (const s of draft.sections) {
        const heading = s.heading.trim();
        const points = s.points.map((p) => p.trim()).filter(Boolean);
        const paragraph = s.paragraph.trim();
        if (!heading && !points.length && !paragraph) continue;

        n += 1;
        blocks.push(`## ${n}. ${heading}`);
        if (paragraph) blocks.push(paragraph);
        if (points.length) blocks.push(points.map((p) => `- ${p}`).join('\n'));
    }

    return blocks.join('\n\n') + '\n';
}
