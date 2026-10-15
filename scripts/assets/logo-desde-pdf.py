"""
Deriva los SVG web del logo a partir del SVG que produce `pdftocairo -svg`
sobre assets-rincel/marca/logo-oficial.pdf. No redibuja ni recolorea: solo
recorta el lienzo (viewBox) al contenido y separa trazos existentes.

Uso:
  pdftocairo -svg assets-rincel/marca/logo-oficial.pdf /tmp/logo.svg
  python3 scripts/assets/logo-desde-pdf.py /tmp/logo.svg public/marca/logo-rincel.svg public/marca/logo-rincel-wordmark.svg

Índices de trazos en el PDF original (36 trazos):
  0–27  leyenda "Internet · Telefonía · Celulares"
  28–33 palabra "rincel"
  34–35 símbolo de encendido sobre la "i"
Las cajas se calcularon muestreando las curvas de cada trazo.
"""
import re
import sys

src = open(sys.argv[1]).read()
paths = re.findall(r"<path[^>]*/>", src)
assert len(paths) == 36, f"Se esperaban 36 trazos, hay {len(paths)}: ¿cambió el PDF?"


def write(out, idx, box, title):
    x0, y0, x1, y1 = box
    pad = 4
    vb = f"{x0 - pad:.1f} {y0 - pad:.1f} {x1 - x0 + 2 * pad:.1f} {y1 - y0 + 2 * pad:.1f}"
    body = "\n".join(paths[i] for i in idx)
    with open(out, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}"><title>{title}</title>\n{body}\n</svg>\n')


# Logo completo (palabra + símbolo + leyenda).
write(sys.argv[2], range(36), (134.5, 163.1, 1408.2, 684.7), "Rincel")
# Solo la palabra con el símbolo (variante que también aparece en la paleta oficial).
write(sys.argv[3], range(28, 36), (134.5, 163.1, 1408.2, 574.7), "Rincel")
