"""Резервный рендер через установленный Word и растеризацию штатным render_docx.py."""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw
import os

base = Path(__file__).resolve().parent
qa = base / '.qa'
docs = base.parents[1] / 'docs'
skill = Path(os.environ['DOCUMENTS_SKILL_DIR']) if 'DOCUMENTS_SKILL_DIR' in os.environ else next(
    (Path.home()/'.codex/plugins/cache/openai-primary-runtime/documents').glob('*/skills/documents'))
spec = importlib.util.spec_from_file_location('docx_renderer', skill/'render_docx.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
# LibreOffice на этой машине отсутствует; PDF экспортирован установленным Word.
renderer.convert_to_pdf = lambda *args, **kwargs: (str(qa/'native-word.pdf'), 'Native Microsoft Word export')
pages=renderer.rasterize(str(docs/'analystgym-economics-b2c-2026-10-26.docx'),
                       str(qa/'render'),110,False,False)
thumbs=[]
for i,path in enumerate(pages,1):
    im=Image.open(path).convert('RGB')
    im.thumbnail((420,594))
    canvas=Image.new('RGB',(440,624),'#dddddd')
    canvas.paste(im,((440-im.width)//2,20))
    ImageDraw.Draw(canvas).text((12,605),str(i),fill='black')
    thumbs.append(canvas)
for j in range(0,len(thumbs),4):
    group=thumbs[j:j+4]
    sheet=Image.new('RGB',(880,624*2),'#dddddd')
    for k,t in enumerate(group):sheet.paste(t,((k%2)*440,(k//2)*624))
    sheet.save(qa/f'contact-{j//4+1}.png')
print(f'Rendered {len(pages)} pages')
