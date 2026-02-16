// ExportTOCPagesToPDF.jsx
// Adobe InDesign ExtendScript
// Exports each page (or spread) as a separate PDF named by Table of Contents entries.
// Reads the document's TOC style, finds paragraphs with TOC paragraph styles,
// maps each to its page, and exports that page with the TOC entry text as the filename.

#targetengine "main";

function sanitizeFileName(name) {
    // Remove or replace characters illegal in filenames
    var s = name.replace(/[\:\/\*\?\"\<\>\|\\]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    s = s.substring(0, 100); // Limit length
    return s || "Untitled";
}

function getParagraphStyleNamesFromTOC(doc) {
    var names = [];
    if (!doc.tocStyles || doc.tocStyles.length === 0) return names;
    var toc = doc.tocStyles[0];
    if (!toc.tocStyleEntries || toc.tocStyleEntries.length === 0) return names;
    for (var i = 0; i < toc.tocStyleEntries.length; i++) {
        var entry = toc.tocStyleEntries[i];
        try {
            if (entry.paragraphStyleName) names.push(entry.paragraphStyleName);
        } catch (e) {}
    }
    return names;
}

function getPageForParagraph(paragraph) {
    var story = paragraph.parentStory;
    if (!story || !story.textContainers || story.textContainers.length === 0) return null;

    // Character offset of this paragraph in the story
    var startOffset = 0;
    var pars = story.paragraphs;
    for (var p = 0; p < paragraph.index; p++) {
        startOffset += pars[p].contents.length + 1; // +1 for paragraph return
    }

    var offset = 0;
    for (var c = 0; c < story.textContainers.length; c++) {
        var container = story.textContainers[c];
        var len = (container.contents && container.contents.length) || 0;
        if (startOffset >= offset && startOffset < offset + len) {
            var spread = container.parent;
            while (spread && spread.constructor.name !== "Spread" && spread.constructor.name !== "Page") {
                spread = spread.parent;
            }
            if (!spread) return null;
            if (spread.constructor.name === "Page") return spread;
            // Spread: return primary page (first page of spread)
            return spread.pages[0];
        }
        offset += len;
    }
    return null;
}

function collectTOCEntries(doc, styleNames) {
    var entries = [];

    for (var s = 0; s < doc.stories.length; s++) {
        var story = doc.stories[s];
        if (!story.paragraphs || story.paragraphs.length === 0) continue;

        for (var i = 0; i < story.paragraphs.length; i++) {
            var par = story.paragraphs[i];
            var styleName = "";
            try {
                styleName = par.appliedParagraphStyle.name;
            } catch (e) {
                continue;
            }
            if (styleNames.indexOf(styleName) === -1) continue;

            var name = par.contents.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
            if (!name) continue;

            var page = getPageForParagraph(par);
            if (!page) continue;

            entries.push({
                name: name,
                page: page,
                pageNumber: page.documentPageIndex + 1
            });
        }
    }

    // Sort by page number
    entries.sort(function (a, b) {
        return a.pageNumber - b.pageNumber;
    });
    return entries;
}

function exportPageToPDF(doc, pageNumber, filePath, useSpreads) {
    var preset = doc.pdfExportPresets.length > 0 ? doc.pdfExportPresets[0] : app.pdfExportPresets.item(0);

    try {
        // Set page range (InDesign uses 1-based page numbers)
        app.pdfExportPreferences.pageRange = String(pageNumber);
        app.pdfExportPreferences.viewPDF = false;
        if (useSpreads) {
            app.pdfExportPreferences.spreadControl = SpreadControlOptions.USE_SPREAD_PAGES;
        } else {
            app.pdfExportPreferences.spreadControl = SpreadControlOptions.USE_ALIGNMENT_PAGES;
        }

        doc.exportFile(ExportFormat.PDF_TYPE, File(filePath), false, preset);
        return true;
    } catch (e) {
        return false;
    }
}

function main() {
    if (app.documents.length === 0) {
        alert("Please open an InDesign document.");
        return;
    }

    var doc = app.activeDocument;
    var styleNames = getParagraphStyleNamesFromTOC(doc);

    if (styleNames.length === 0) {
        alert("No TOC styles found, or no paragraph styles are assigned in the TOC style.\n\nSet up a TOC style (Layout > Table of Contents Style) and assign paragraph styles to it.");
        return;
    }

    var entries = collectTOCEntries(doc, styleNames);

    if (entries.length === 0) {
        alert("No TOC-style paragraphs found in the document.\n\nMake sure your headings use the paragraph styles that are included in your TOC style.");
        return;
    }

    // Ask for folder
    var folder = doc.filePath;
    if (!folder) folder = Folder.myDocuments;
    folder = folder.selectDlg("Choose folder for exported PDFs");
    if (!folder) return;

    var useSpreads = confirm("Export as spreads? (Cancel = one PDF per page)");

    var errors = [];
    var exported = 0;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        var baseName = sanitizeFileName(entry.name);
        var path = new File(folder.fsName + "/" + baseName + ".pdf");
        var counter = 1;
        while (path.exists) {
            path = new File(folder.fsName + "/" + baseName + "_" + counter + ".pdf");
            counter++;
        }

        var ok = exportPageToPDF(doc, entry.pageNumber, path, useSpreads);
        if (ok) {
            exported++;
        } else {
            errors.push(entry.name + " -> " + baseName + ".pdf");
        }
    }

    alert("Exported " + exported + " of " + entries.length + " PDF(s) to:\n" + folder.fsName + (errors.length ? "\n\nFailed: " + errors.join(", ") : ""));
}

main();
