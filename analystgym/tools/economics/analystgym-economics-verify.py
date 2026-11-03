"""Проверки итоговых документов без изменения файлов."""
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from docx import Document

root=Path(__file__).resolve().parents[2] / 'docs'
path=root/'analystgym-economics-b2c-2026-10-26.docx'
doc=Document(path)
md=(root/'economics.md').read_text(encoding='utf-8')
assert '99 332' in md and '139 832' in md and '-13 242' in md
assert len(doc.tables)==14, len(doc.tables)
rows=[line for line in md.splitlines() if line.startswith('|')]
assert len(rows)>60 and all(line.endswith('|') for line in rows)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(path) as z:
    styles=etree.fromstring(z.read('word/styles.xml'))
    titles=styles.xpath('//w:style[@w:styleId="Title"]',namespaces=ns)
    assert titles and not titles[0].xpath('.//w:pBdr',namespaces=ns)
assert '107 500' in md and '101 650' in md and '9 USD' in md
assert '50 000 ₽' in md and '31 500 ₽' in md and '16 350 ₽' in md
assert len(list((Path(__file__).resolve().parent / '.qa/render').glob('page-*.png')))==10
print('Verified: 10 rendered pages, 14 tables, mentoring economics and limits; no title border')
