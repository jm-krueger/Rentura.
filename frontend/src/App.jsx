import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function App() {
  /* ─── state ───────────────────────────────────────────── */
  const [file, setFile] = useState(null);
  const [response, setResp] = useState({ checks: [], summary: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ─── helpers ─────────────────────────────────────────── */
  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') {
      setFile(f);
      setResp({ checks: [], summary: '' });
      setError('');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') onFileChange({ target: { files: [f] } });
  };

  /* ─── call backend ───────────────────────────────────── */
  const startAnalysis = async () => {
    if (!file) return;
    setLoading(true);
    setResp({ checks: [], summary: '' });
    setError('');

    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('http://localhost:8000/api/analyse', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setResp(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  /* ─── derived flags ───────────────────────────────────── */
  const hasResult = Boolean(response.summary && response.summary.trim());

  /* ─── UI ─────────────────────────────────────────────── */
  return (
    <>
      {/* outer bg wrapper */}
      <div
        className="flex flex-col min-h-screen"
        style={{
          backgroundImage: "url('/mybg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* header */}
        <div className="drag-region flex items-center h-8 px-4 text-white text-sm bg-transparent">
          <span className="select-none font-semibold">Rentura</span>
        </div>

        {/* main scroll area */}
        <div className="flex flex-col items-center justify-start flex-1 overflow-y-auto py-10 px-4">
          {/* white hero panel */}
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl p-10 space-y-8">
            <h1 className="text-3xl font-extrabold text-center text-gray-800">Rentura – Der Mietvertragscheck für Wohnraummieten</h1>

            {/* ─── Landing‑only section ────────────────────────────── */}
            {!hasResult && (
              <>
                {/* intro paragraph */}
                <p className="text-sm text-gray-700 leading-relaxed">
                  Hat auch Ihr Vermieter rechtswidrige Klauseln in Ihren Vertrag aufgenommen? Ist eine Klausel rechtswidrig, ist diese als nichtig anzusehen. Dann müssen Sie sich and den enstprechenden Teil nicht halten. Prüfen Sie hier Ihren Mietvertrag!
                </p>

                {/* upload zone */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 p-8 text-center cursor-pointer hover:border-blue-500 transition"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => document.getElementById('fileInput').click()}
                >
                  <input type="file" id="fileInput" accept="application/pdf" onChange={onFileChange} className="hidden" />
                  {file ? (
                    <p className="text-sm font-medium">📄 {file.name}</p>
                  ) : (
                    <p className="text-sm text-gray-600">Mietvertrag als PDF hierher ziehen oder klicken, um das Dokument auszuwählen</p>
                  )}
                </div>

                {/* run button */}
                <button
                  onClick={startAnalysis}
                  disabled={loading || !file}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-50"
                >
                  {loading ? 'Analyse läuft…' : 'Mietvertrag prüfen'}
                </button>
              </>
            )}

            {/* error */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
            )}

            {/* ─── Response‑only section ───────────────────────────── */}
            {hasResult && (
              <>
                {/* summary – paired line (description + probability) */}
                <div className="bg-blue-50/60 border-l-4 border-blue-400 p-4 rounded-xl space-y-3">
                  <h2 className="font-semibold text-gray-800">Wir haben Ihren gesamten Vertrag geprüft. Folgende Klauseln könnten nichtig sein:</h2>
                  <p></p>

                  {(() => {
                    // prepare rows by pairing each description line with the following probability line
                    const lines = response.summary.split(/\n/).filter((ln) => ln.trim());
                    const rows = [];
                    for (let i = 0; i < lines.length; i++) {
                      const desc = lines[i];
                      const probLine = lines[i + 1] && /Wahrscheinlichkeit der Unwirksamkeit/i.test(lines[i + 1]) ? lines[i + 1] : null;
                      if (!probLine) continue; // only paired data

                      // extract the numeric score (0-10) from the probability line
                      const scoreMatch = probLine.match(/(\d{1,2})\s*\/\s*10/);
                      const score = scoreMatch ? Number(scoreMatch[1]) : null;
                      const dotCount = score !== null ? Math.max(0, Math.min(5, score - 5)) : 0; // new: 6→1 … 10→5

                       // ignore unproblematic Klauseln (Score ≤ 5 ⇒ 0 Punkte)
                       if (dotCount === 0) {
                         i++;          // also skip the following probability line
                         continue;     // don’t add the row at all
                       }


                      // clean description
                      const cleanText = desc
                        .replace(/^[•*-]\s*/, '')
                        .replace(/\s*[:(]?\s*\d{1,2}\s*\/\s*10\)?/, '')
                        .trim();

                      rows.push({ text: cleanText, dotCount, score });
                      i++; // skip following line
                    }

                    rows.sort((a, b) => b.dotCount - a.dotCount);

                    // ─── NEW: nothing found? show message ─────────────────────────
                    if (rows.length === 0) {
                      return (
                        <p className="text-sm text-gray-700">
                          Es scheint als wären alle Klausel in Ihrem Vertrag zulässig.
                        </p>
                      );
                    }

                    // 🔽🔽 sort descending by dotCount (or score) so highest probability appears first
                    rows.sort((a, b) => b.dotCount - a.dotCount);

                    return rows.map(({ text, dotCount }, idx) => (
                      <div key={idx} className="flex items-center text-sm">
                        {/* description */}
                        <span className="flex-1 text-gray-700 pr-4">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>
                            {text}
                          </ReactMarkdown>
                        </span>

                        {/* dots */}
                        <div className="flex gap-1 shrink-0">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <span
                              key={j}
                              className={
                                j < dotCount
                                  ? 'w-3 h-3 bg-blue-600 rounded-full inline-block'
                                  : 'w-3 h-3 border border-gray-300 rounded-full inline-block'
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* lawyer suggestions – show only on result page */}
                <div className="space-y-1 text-sm">
                  <h2 className="font-semibold">Sie möchten Ihren Vertrag verbindlich prüfen lassen?</h2>
                  <p>Finde hier Mietrechts-Expert:innen in Ihrer Nähe!</p>
                  <a href="https://www.langrechtsanwalt.com/" className="text-blue-600 underline" target="_blank" rel="noreferrer">
                    Dr. Lang Rechtsanwalt
                  </a>
                  <br />
                  <a href="https://schmid-mietrecht.de" className="text-blue-600 underline" target="_blank" rel="noreferrer">
                    Anwaltsbüro Schmid
                  </a>
                  <br />
                  <a href="https://kanzlei-berger.com" className="text-blue-600 underline" target="_blank" rel="noreferrer">
                    Fachanwältin Dr. Berger
                  </a>
                </div>
              </>
            )}

            {/* disclaimer */}
            <p className="text-xs text-gray-500 mt-6">
              Hinweis: Laden Sie keine persönlichen Daten hoch. Rentura ersetzt keine Rechtsberatung. Für eine verbindliche Einschätzung wenden Sie sich bitte an
              eine zugelassene Rechtsanwältin oder einen Rechtsanwalt.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
