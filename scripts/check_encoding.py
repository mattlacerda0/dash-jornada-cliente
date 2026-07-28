from pathlib import Path
import re

t = Path("index.html").read_text(encoding="utf-8")
for m in re.finditer(r"Reuni.{0,6}", t):
    s = m.group()
    print("reuni", s, [hex(ord(c)) for c in s])
    break
i = t.find('data-nav="meetings"')
print("nav", repr(t[i : i + 90]))
j = t.find("Como interpretamos")
print("alert", repr(t[j : j + 200]))
k = t.find("kpis-cancel-primary")
print("css", repr(t[k - 50 : k + 30]))
