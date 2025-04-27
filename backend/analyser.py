
#!/usr/bin/env python3
"""
rental_clause_analysis.py  (corrected version)

Analyse German rental contracts (PDF) clause‑by‑clause.

* Extract full text from PDF (PyMuPDF)
* Split into clauses using § / numeral headings
* Classify each clause against user‑supplied list
* Check clause for typical issues
* Output JSON

See README for details.
"""
import os, sys, re, json, argparse, textwrap
from pathlib import Path
import fitz  # PyMuPDF


def extract_full_text(pdf_path: Path) -> str:
    doc = fitz.open(pdf_path)
    pages = [p.get_text('text') for p in doc]
    text = "\n".join(pages)
    text = text.replace("\r", "")
    text = re.sub(r"-\n(?=\w)", "", text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    return text.strip()

