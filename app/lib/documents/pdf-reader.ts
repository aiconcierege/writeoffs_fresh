import 'server-only'
import {join} from 'node:path'
import {pdfTextRows,statementPageText,type PdfTextItem} from './pdf-layout'
export async function readPdfPages(bytes:Uint8Array,limit=500){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc;try{doc=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,standardFontDataUrl:join(process.cwd(),'node_modules/pdfjs-dist/standard_fonts/')}).promise}catch{throw new Error('PDF_UNREADABLE')}
  try{
    if(doc.numPages<1||doc.numPages>limit)throw new Error('DOCUMENT_PAGE_LIMIT')
    const pages=[];let length=0
    for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent(),items=content.items.filter(item=>'str'in item) as PdfTextItem[]
      const text=statementPageText(items),plain=pdfTextRows(items).map(row=>row.map(i=>i.str.trim()).join(' ')).join('\n');length+=text.length
      const viewport=page.getViewport({scale:1})
      const words=items.filter(i=>i.str.trim()).map(i=>{
        const height=Math.abs(i.height??i.transform[3]??10)
        return {text:i.str,x:i.transform[4],y:viewport.height-i.transform[5]-height,width:i.width,height}
      })
      if(length>2_000_000)throw new Error('DOCUMENT_TEXT_LIMIT');pages.push({page:n,text,plain,width:viewport.width,height:viewport.height,words})
    }
    return pages
  }finally{await doc.destroy()}
}
