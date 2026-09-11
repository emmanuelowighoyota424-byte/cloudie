type PdfContent = {
  title?: string
  subtitle?: string
  fields?: Record<string, unknown>
  body?: string
  sections?: Array<{ heading: string; body?: string }>
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, ' ')
}

function textLines(content: PdfContent) {
  const lines: string[] = []
  if (content.title) lines.push(content.title)
  if (content.subtitle) lines.push(content.subtitle)
  if (content.body) lines.push(content.body)
  for (const [key, value] of Object.entries(content.fields ?? {})) lines.push(`${key}: ${String(value)}`)
  for (const section of content.sections ?? []) {
    lines.push(section.heading)
    if (section.body) lines.push(section.body)
  }
  return lines.flatMap((line) => {
    const normalized = String(line).replace(/\s+/g, ' ').trim()
    if (!normalized) return ['']
    const words = normalized.split(' ')
    const chunks: string[] = []
    let current = ''
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 88) {
        chunks.push(current)
        current = word
      } else current = (current + ' ' + word).trim()
    }
    if (current) chunks.push(current)
    return chunks
  }).slice(0, 55)
}

export function renderPdf(content: PdfContent): Uint8Array {
  const lines = textLines(content)
  const stream = ['BT', '/F1 18 Tf', '54 760 Td']
  lines.forEach((line, index) => {
    if (index === 1) stream.push('/F1 11 Tf')
    if (index > 0) stream.push('0 -16 Td')
    stream.push(`(${pdfEscape(line)}) Tj`)
  })
  stream.push('ET')
  const body = stream.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(body, 'utf8')} >>\nstream\n${body}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export function isPdf(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  return header === '%PDF-'
}
