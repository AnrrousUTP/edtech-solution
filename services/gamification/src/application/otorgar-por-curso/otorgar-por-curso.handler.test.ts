import { describe, expect, test } from 'bun:test'
import { FakeClock, UniqueId, validarContra } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { OtorgarPorCursoHandler } from './otorgar-por-curso.handler'
import { GenerarPdfHandler } from '../generar-pdf/generar-pdf.handler'
import { VerificarCertificadoHandler } from '../consultar-gamificacion/consultar-gamificacion.handler'
import {
  FakeAlmacenPdf,
  FakeColaCertificados,
  FakeGeneradorPdf,
  InMemoryCertificadoRepository,
  InMemoryPerfilRepository,
  aleatorioFijo,
} from '../dobles'

const USUARIO = crypto.randomUUID()
const CURSO = crypto.randomUUID()

const montar = () => {
  const perfiles = new InMemoryPerfilRepository()
  const certificados = new InMemoryCertificadoRepository()
  const cola = new FakeColaCertificados()
  const publisher = new InMemoryEventPublisher()
  const reloj = new FakeClock(new Date('2026-08-28T12:00:00Z'))
  const handler = new OtorgarPorCursoHandler(
    perfiles,
    certificados,
    cola,
    publisher,
    reloj,
    aleatorioFijo(),
  )
  return { perfiles, certificados, cola, publisher, reloj, handler }
}

const cmd = {
  _tag: 'OtorgarPorCurso' as const,
  usuarioId: USUARIO,
  cursoId: CURSO,
  cursoTitulo: 'CSS desde Cero',
}

describe('OtorgarPorCursoHandler', () => {
  test('completar un curso otorga insignia, emite certificado y lo encola para el PDF', async () => {
    const { handler, cola, publisher, certificados } = montar()
    const r = await handler.execute(cmd)

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.insigniaOtorgada).toBe(true)
      expect(r.value.certificadoNuevo).toBe(true)
    }
    expect(certificados.certificados.size).toBe(1)
    expect(cola.encolados).toHaveLength(1)

    const insignia = publisher.porTipo('gamification.insignia-otorgada.v1')[0]
    const certificado = publisher.porTipo('gamification.certificado-emitido.v1')[0]
    expect(validarContra('gamification.insignia-otorgada.v1', insignia!.payload())).toEqual({
      valido: true,
    })
    expect(validarContra('gamification.certificado-emitido.v1', certificado!.payload())).toEqual({
      valido: true,
    })
  })

  test('I-7: reprocesar curso-completado NO otorga una segunda insignia ni un segundo certificado', async () => {
    const { handler, certificados, publisher, cola } = montar()
    await handler.execute(cmd)
    const segunda = await handler.execute(cmd)

    expect(segunda.ok).toBe(true)
    if (segunda.ok) {
      expect(segunda.value.insigniaOtorgada).toBe(false)
      expect(segunda.value.certificadoNuevo).toBe(false)
    }
    expect(certificados.certificados.size).toBe(1)
    expect(cola.encolados).toHaveLength(1)
    expect(publisher.porTipo('gamification.insignia-otorgada.v1')).toHaveLength(2) // CURSO + PRIMER_CURSO
    expect(publisher.porTipo('gamification.certificado-emitido.v1')).toHaveLength(1)
  })

  test('el primer curso otorga además la insignia PRIMER_CURSO; el segundo no', async () => {
    const { handler, perfiles } = montar()
    await handler.execute(cmd)
    await handler.execute({ ...cmd, cursoId: crypto.randomUUID(), cursoTitulo: 'HTML' })

    const perfil = await perfiles.porUsuario(UniqueId.desde(USUARIO))
    const primeros = perfil?.insignias.filter(i => i.criterio === 'PRIMER_CURSO') ?? []
    expect(primeros).toHaveLength(1)
  })

  test('el flujo completo: certificado → PDF en el almacén → verificación pública por código', async () => {
    const { handler, certificados, cola } = montar()
    await handler.execute(cmd)

    const generador = new FakeGeneradorPdf()
    const almacen = new FakeAlmacenPdf()
    const pdfHandler = new GenerarPdfHandler(certificados, generador, almacen)

    const generado = await pdfHandler.execute({
      _tag: 'GenerarPdf',
      certificadoId: cola.encolados[0]!,
    })
    expect(generado.ok).toBe(true)
    expect(almacen.guardados.size).toBe(1)

    // Reprocesar el mensaje de la cola interna NO regenera el PDF
    await pdfHandler.execute({ _tag: 'GenerarPdf', certificadoId: cola.encolados[0]! })
    expect(generador.llamadas).toBe(1)

    const certificado = await certificados.porId(UniqueId.desde(cola.encolados[0]!))
    const verificar = new VerificarCertificadoHandler(certificados, almacen)
    const verificacion = await verificar.execute({
      _tag: 'VerificarCertificado',
      codigo: certificado!.codigo.valor,
    })

    expect(verificacion.ok).toBe(true)
    if (verificacion.ok) {
      expect(verificacion.value.titulo).toBe('CSS desde Cero')
      expect(verificacion.value.tipo).toBe('MENOR')
      expect(verificacion.value.pdfUrl).toContain('firma=')
    }
  })

  test('un código inexistente no verifica', async () => {
    const { certificados } = montar()
    const verificar = new VerificarCertificadoHandler(certificados, new FakeAlmacenPdf())
    const r = await verificar.execute({ _tag: 'VerificarCertificado', codigo: 'EDT-AAAA-BBBB' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CERTIFICADO_NO_ENCONTRADO')
  })

  test('un código con formato inválido se rechaza sin tocar la base', async () => {
    const { certificados } = montar()
    const verificar = new VerificarCertificadoHandler(certificados, new FakeAlmacenPdf())
    const r = await verificar.execute({ _tag: 'VerificarCertificado', codigo: 'no-es-codigo' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CODIGO_INVALIDO')
  })
})

describe('PDF real', () => {
  test('el generador produce un PDF con cabecera y EOF válidos', async () => {
    const { handler, certificados, cola } = montar()
    await handler.execute(cmd)
    const certificado = await certificados.porId(UniqueId.desde(cola.encolados[0]!))

    const { PdfCertificadoGenerador } = await import('../../infrastructure/out/pdf.generador')
    const pdf = await new PdfCertificadoGenerador().generar(certificado!)
    const texto = new TextDecoder().decode(pdf)

    expect(texto.startsWith('%PDF-1.4')).toBe(true)
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(texto).toContain('CSS desde Cero')
    expect(texto).toContain(certificado!.codigo.valor)
  })
})
