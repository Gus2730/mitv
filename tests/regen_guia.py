# Mueve las horas de la guía de prueba para que el primer programa empiece hace 10 minutos
import gzip,re,datetime
p='media/guia.xml.gz'; s=gzip.open(p,'rt').read()
f='%Y%m%d%H%M%S'; ts=[datetime.datetime.strptime(m,f) for m in re.findall(r'(\d{14}) \+0000',s)]
shift=(datetime.datetime.now(datetime.UTC).replace(tzinfo=None)-datetime.timedelta(minutes=10))-min(ts)
s=re.sub(r'(\d{14}) \+0000',lambda m:(datetime.datetime.strptime(m.group(1),f)+shift).strftime(f)+' +0000',s)
gzip.open(p,'wt').write(s)
