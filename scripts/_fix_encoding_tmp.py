from pathlib import Path

p = Path(__file__).resolve().parents[1] / "index.html"
raw = p.read_bytes()
text = raw.decode("utf-8", errors="replace")
print("len", len(text))
print("has Atenção", "Atenção" in text)
print("has intenções", "intenções" in text or "Intenções" in text)
print("has replacement", "\ufffd" in text)
print("has mojibake Ã", "Ã§" in text or "Ã£" in text)
idx = text.find("kpis-cancel-timing")
print("near-css", repr(text[idx - 90 : idx + 40]) if idx >= 0 else "n/a")
idx2 = text.find("nav === 'cancellations'")
print("near-remount", repr(text[idx2 : idx2 + 220]) if idx2 >= 0 else "n/a")
# BOM?
print("bom", raw[:3])
# Try reverse: utf-8 interpreted as cp1252 then saved as utf-8
if "Ã" in text or "\ufffd" in text:
    try:
        fixed = text.encode("cp1252", errors="strict").decode("utf-8")
        print("reverse-cp1252-ok", "Atenção" in fixed, "Intenção" in fixed or "intenção" in fixed)
        print("fixed-css", repr(fixed[fixed.find("kpis-cancel-timing") - 90 : fixed.find("kpis-cancel-timing") + 20]))
    except Exception as e:
        print("reverse-cp1252-fail", type(e).__name__, e)
        try:
            fixed = text.encode("latin-1", errors="strict").decode("utf-8")
            print("reverse-latin1-ok", "Atenção" in fixed)
        except Exception as e2:
            print("reverse-latin1-fail", type(e2).__name__, e2)
