import type { Certificado } from '../../domain/entities/certificado.entity'
import type { GeneradorPdf } from '../../domain/ports-out/pdf.port'

const escapar = (valor: string): string =>
  valor.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')

const textoAscii = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')

const texto = (
  valor: string,
  fuente: string,
  tamano: number,
  x: number,
  y: number,
  color = '0.09 0.15 0.33',
): string =>
  `${color} rg BT /${fuente} ${tamano} Tf ${x} ${y} Td (${escapar(textoAscii(valor))}) Tj ET`

export class PdfCertificadoGenerador implements GeneradorPdf {
  async generar(certificado: Certificado): Promise<Uint8Array> {
    const stream = [
      'q 0.2588 0.5216 0.9569 rg 48 704 18 18 re f 0.9176 0.2627 0.2314 rg 70 704 18 18 re f 0.9843 0.7373 0.0157 rg 48 682 18 18 re f 0.2039 0.6588 0.3294 rg 70 682 18 18 re f Q',
      texto('E', 'F2', 22, 55, 687, '1 1 1'),
      texto('EdTech', 'F2', 18, 98, 700),
      '0.2588 0.5216 0.9569 RG 1.5 w 48 658 m 564 658 l S',
      texto('CERTIFICADO DE FINALIZACION', 'F2', 24, 150, 590),
      texto('Se certifica que', 'F1', 13, 242, 530, '0.39 0.45 0.55'),
      texto(certificado.nombreTitular, 'F2', 29, 190, 478, '0.26 0.22 0.55'),
      texto('completo satisfactoriamente el curso', 'F1', 13, 194, 435, '0.39 0.45 0.55'),
      texto(certificado.titulo, 'F2', 20, 205, 388),
      '0.39 0.22 0.85 RG 2 w 276 332 60 60 re S 0.93 0.91 0.99 rg 286 342 40 40 re f',
      '0.39 0.22 0.85 RG 2 w 294 362 m 302 352 l 320 373 l S',
      '0.26 0.22 0.55 RG 1.5 w 66 205 m 80 184 87 212 100 195 c 119 180 125 204 126 204 c 132 204 138 190 150 197 c 164 205 178 194 185 202 S',
      '0.15 0.39 0.92 RG 1.5 w 365 205 m 378 185 386 211 394 195 c 410 181 413 204 413 204 c 420 204 426 190 438 198 c 454 207 468 194 480 202 S',
      texto('Direccion academica', 'F1', 10, 89, 172, '0.39 0.45 0.55'),
      texto('EdTech', 'F1', 10, 433, 172, '0.39 0.45 0.55'),
      '0.88 0.91 1 RG 1 w 48 142 m 564 142 l S',
      texto(
        `Codigo de verificacion: ${certificado.codigo.valor}`,
        'F2',
        11,
        48,
        112,
        '0.20 0.25 0.35',
      ),
      texto(
        `Emitido: ${certificado.emitidoAt.toISOString().slice(0, 10)}`,
        'F1',
        11,
        48,
        88,
        '0.39 0.45 0.55',
      ),
      texto('Documento verificable en EdTech', 'F1', 11, 392, 100, '0.39 0.45 0.55'),
    ].join('\n')
    const objetos = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
    ]
    let pdf = '%PDF-1.4\n'
    const offsets: number[] = [0]
    for (let i = 0; i < objetos.length; i++) {
      offsets.push(pdf.length)
      pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`
    }
    const inicio = pdf.length
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map(o => `${String(o).padStart(10, '0')} 00000 n `)
      .join(
        '\n',
      )}\ntrailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicio}\n%%EOF\n`
    return new TextEncoder().encode(pdf)
  }
}
