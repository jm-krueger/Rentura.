from pathlib import Path
import json, textwrap
from typing import List
from openai import OpenAI
from analyser import extract_full_text

import pytesseract
from pdf2image import convert_from_path

BASE_DIR   = Path(__file__).parent
PROMPT_DIR = BASE_DIR / "prompts"


def get_api_key() -> str:
    key_path = BASE_DIR / "RenameKey.txt"
    if not key_path.exists():
        raise RuntimeError(f"API-Key Datei fehlt: {key_path}")
    return key_path.read_text(encoding="utf-8").strip()


def extract_text_with_ocr(pdf_path: Path) -> str:
    """Extract text from scanned PDFs using OCR."""
    images = convert_from_path(str(pdf_path))
    text = ""
    for img in images:
        text += pytesseract.image_to_string(img, lang='deu')  # Use 'eng' if your PDFs are English
    return text


def run_prompts(pdf_path: Path, model="gpt-4.1") -> dict:
    client = OpenAI(api_key=get_api_key())

    # Try normal extraction first
    contract = extract_full_text(pdf_path).strip()

    # Fallback to OCR if the extracted text is very short
    if len(contract) < 100:
        print(f"Warnung: Normaler Text-Extrakt fehlgeschlagen. OCR wird verwendet für: {pdf_path}")
        contract = extract_text_with_ocr(pdf_path)

    # Limit text to the first 15,000 characters
    contract = contract[:15000]

    checks: List[dict] = []
    for pfile in sorted(PROMPT_DIR.glob("*.txt")):
        base_prompt = pfile.read_text(encoding="utf-8")
        user_msg = f"{base_prompt}\n\nVertragstext:\n{contract}"

        chat = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Du bist Fachanwalt für Mietrecht."},
                {"role": "user", "content": user_msg},
            ],
            temperature=0,
        )
        checks.append({
            "prompt": pfile.stem,
            "answer": chat.choices[0].message.content.strip()
        })

    # ---- summary -------------------------------------------------
    summary_prompt = textwrap.dedent(f"""
        Fasse die folgenden Antworten in **höchstens 10** Problem-Paaren zusammen.

        ***AUSGABEFORMAT (bitte exakt einhalten)***
        Für jedes Problem genau zwei Zeilen — nichts davor, nichts danach:

        • <Kurze Problembeschreibung>
        Wahrscheinlichkeit der Unwirksamkeit (wobei 10 bedeutet, dass die Klausel sicher unwirksam ist): <Zahl 1-10>/10

        Antworten:
        {json.dumps(checks, ensure_ascii=False, indent=2)}
    """)

    summary = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Du bist Fachanwalt für Mietrecht."},
            {"role": "user",   "content": summary_prompt},
        ],
        temperature=0,
    ).choices[0].message.content.strip()

    return {"checks": checks, "summary": summary}
