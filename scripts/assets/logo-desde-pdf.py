import re, sys
src=open(sys.argv[1]).read()
paths=re.findall(r'<path[^>]*/>', src)
def write(out, idx, box, title):
    x0,y0,x1,y1=box; pad=4
    vb=f'{x0-pad:.1f} {y0-pad:.1f} {x1-x0+2*pad:.1f} {y1-y0+2*pad:.1f}'
    body='\n'.join(paths[i] for i in idx)
    open(out,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}"><title>{title}</title>\n{body}\n</svg>\n')
write(sys.argv[2], range(36), (134.5,163.1,1408.2,684.7), 'Rincel')
write(sys.argv[3], range(28,36), (134.5,163.1,1408.2,574.7), 'Rincel')
