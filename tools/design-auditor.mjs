#!/usr/bin/env node
/**
 * Auditor navegable de diseño para EdTech.
 *
 * Recorre las rutas públicas y autenticación sin mutar datos. Mide señales que
 * afectan si una interfaz se entiende: jerarquía, overflow, targets, nombres
 * accesibles, contraste aproximado, foco, errores de navegador y navegación.
 * Genera capturas para revisar el resultado humano junto con el reporte.
 *
 * Requiere el Chromium y playwright-core globales del harness Anrrous.
 * Uso: node tools/design-auditor.mjs [--base http://localhost:3000]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { join } from 'node:path'

process.env.NODE_PATH ??= '/home/hp/.local/share/fnm/node-versions/v22.23.2/installation/lib/node_modules'
Module._initPaths()
const { chromium } = createRequire(import.meta.url)('playwright-core')

const argumento = (nombre, defecto) => {
  const indice = process.argv.indexOf(`--${nombre}`)
  return indice >= 0 ? process.argv[indice + 1] ?? defecto : defecto
}

const base = argumento('base', 'http://localhost:3000').replace(/\/$/, '')
const salida = argumento('out', '/tmp/edtech-design-audit')
const sinCapturas = process.argv.includes('--no-screenshots')
const viewports = [
  { nombre: 'desktop', width: 1440, height: 900 },
  { nombre: 'tablet', width: 768, height: 1024 },
  { nombre: 'mobile', width: 390, height: 844 },
]
const rutas = [
  { nombre: 'home', path: '/' },
  { nombre: 'catalogo', path: '/cursos' },
  { nombre: 'login', path: '/login' },
  { nombre: 'registro', path: '/register' },
  { nombre: 'recuperacion', path: '/recuperar' },
  { nombre: 'nivelacion', path: '/nivelacion' },
  { nombre: 'diagnostico', path: '/diagnostico' },
  { nombre: 'admin-login', path: '/admin/login' },
]

const medir = async page => page.evaluate(() => {
  const visible = element => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
  }
  const nombre = element => (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  const rgb = value => {
    const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i)
    if (!match || match[4] === '0') return null
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
  }
  const fondo = element => {
    let actual = element
    while (actual && actual !== document.documentElement) {
      const color = rgb(getComputedStyle(actual).backgroundColor)
      // Las capas rgba se componen con lo que hay debajo. Para este auditor
      // aproximado seguimos hasta una superficie opaca y evitamos falsos
      // positivos al medir texto sobre fondos translúcidos.
      if (color && color[3] >= 0.98) return color
      actual = actual.parentElement
    }
    return [5, 9, 14, 1]
  }
  const luminancia = color => {
    const canales = color.slice(0, 3).map(channel => {
      const normalizado = channel / 255
      return normalizado <= 0.03928 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2]
  }
  const contraste = (foreground, background) => {
    const claro = Math.max(luminancia(foreground), luminancia(background))
    const oscuro = Math.min(luminancia(foreground), luminancia(background))
    return (claro + 0.05) / (oscuro + 0.05)
  }
  const interactivos = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(visible)
  const sinNombre = interactivos.filter(element => !nombre(element)).map(element => element.tagName.toLowerCase()).slice(0, 12)
  const enlaceTextoContinuo = element => element.classList.contains('sr-only') || (element.tagName === 'A' && getComputedStyle(element).display === 'inline' && !element.closest('header,nav'))
  const targetsPequenos = interactivos
    .map(element => ({ element, box: element.getBoundingClientRect() }))
    .filter(item => !enlaceTextoContinuo(item.element))
    .filter(item => item.box.width < 24 || item.box.height < 24)
    .map(item => ({ tag: item.element.tagName.toLowerCase(), label: nombre(item.element) }))
    .slice(0, 12)
  const muestrasContraste = [...document.querySelectorAll('h1,h2,h3,p,a,button,label,input,textarea')]
    .filter(visible)
    .slice(0, 180)
    .map(element => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      const tamano = Number.parseFloat(style.fontSize)
      return { label: nombre(element), ratio: Number(contraste(rgb(style.color) || [0, 0, 0, 1], fondo(element)).toFixed(2)), large: tamano >= 24 || (tamano >= 18.66 && style.fontWeight >= 700), box: { width: Math.round(box.width), height: Math.round(box.height) } }
    })
  const bajoContraste = muestrasContraste.filter(item => item.ratio < (item.large ? 3 : 4.5)).slice(0, 12)
  const enlaces = [...document.querySelectorAll('a')].filter(visible).map(element => ({ label: nombre(element), href: element.getAttribute('href') || '' }))
  return {
    title: document.title,
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
    main: document.querySelectorAll('main').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    interactiveCount: interactivos.length,
    unnamedInteractive: sinNombre,
    smallTargets: targetsPequenos,
    lowContrast: bajoContraste,
    links: enlaces,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    animatedVisible: [...document.querySelectorAll('*')].filter(visible).some(element => {
      const style = getComputedStyle(element)
      return (style.animationName !== 'none' && Number.parseFloat(style.animationDuration) > 0.05) || Number.parseFloat(style.transitionDuration) > 0.05
    }),
  }
})

const resumirErrores = lista => [...new Set(lista.map(error => String(error).slice(0, 180)))].slice(0, 8)

const probarScroll = async (page, viewport) => {
  const fracciones = [0, 0.2, 0.4, 0.6, 0.8, 1]
  const puntos = []
  const maximo = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight))
  for (const fraccion of fracciones) {
    await page.evaluate(valor => window.scrollTo(0, valor), maximo * fraccion)
    await page.waitForTimeout(450)
    const captura = !sinCapturas
      ? join(salida, `${viewport.nombre}-home-scroll-${Math.round(fraccion * 100)}.png`)
      : undefined
    if (captura) await page.screenshot({ path: captura, fullPage: false })
    puntos.push(await page.evaluate(fraccionActual => ({
      fraccion: fraccionActual,
      y: Math.round(window.scrollY),
      captura: fraccionActual === 0 ? undefined : `home-scroll-${Math.round(fraccionActual * 100)}.png`,
      titles: [...document.querySelectorAll('.story-panel h2')]
        .filter(element => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0.05
        })
        .map(element => element.textContent?.trim())
        .filter(Boolean),
    }), fraccion))
  }
  const panelCount = await page.locator('.story-panel h2').count()
  await page.evaluate(() => window.scrollTo(0, 0))
  const titlesSeen = [...new Set(puntos.flatMap(punto => punto.titles))]
  return { viewport: viewport.nombre, panelCount, titlesSeen, puntos }
}

const ejecutar = async () => {
  mkdirSync(salida, { recursive: true })
  const ejecutable = process.env.CHROME_BIN || '/home/hp/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
  const browser = await chromium.launch({ executablePath: ejecutable, headless: true })
  const resultados = []
  const erroresCriticos = []
  let pruebaMovimientoReducido = null
  const pruebasScroll = []

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    for (const ruta of rutas) {
      const page = await context.newPage()
      const erroresPagina = []
      const peticionesFallidas = []
      page.on('pageerror', error => erroresPagina.push(error))
      page.on('requestfailed', request => peticionesFallidas.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'falló'}`))
      let status = 0
      let medicion = null
      try {
        const respuesta = await page.goto(`${base}${ruta.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        status = respuesta?.status() ?? 0
        await page.waitForTimeout(350)
        medicion = await medir(page)
        if (!sinCapturas) await page.screenshot({ path: join(salida, `${viewport.nombre}-${ruta.nombre}.png`), fullPage: true })
      } catch (error) {
        erroresPagina.push(error)
      }
      const errores = resumirErrores(erroresPagina)
      const fallos = resumirErrores(peticionesFallidas)
      const resultado = { viewport: viewport.nombre, ruta: ruta.path, status, ...medicion, pageErrors: errores, failedRequests: fallos }
      resultados.push(resultado)
      if (status >= 500 || errores.length || (medicion?.overflow ?? false)) erroresCriticos.push(resultado)
      await page.close()
    }
    await context.close()
  }
  for (const viewport of viewports.filter(item => item.nombre === 'desktop' || item.nombre === 'mobile')) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    const page = await context.newPage()
    try {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(350)
      pruebasScroll.push(await probarScroll(page, viewport))
    } catch (error) {
      pruebasScroll.push({ viewport: viewport.nombre, panelCount: 0, titlesSeen: [], error: String(error) })
    }
    await page.close()
    await context.close()
  }
  const contextoMovimientoReducido = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const paginaMovimientoReducido = await contextoMovimientoReducido.newPage()
  try {
    await paginaMovimientoReducido.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await paginaMovimientoReducido.waitForTimeout(350)
    const medicionReducida = await medir(paginaMovimientoReducido)
    pruebaMovimientoReducido = {
      matches: medicionReducida.reduceMotion,
      animatedVisible: medicionReducida.animatedVisible,
    }
  } catch (error) {
    pruebaMovimientoReducido = { matches: false, animatedVisible: true, error: String(error) }
  }
  await paginaMovimientoReducido.close()
  await contextoMovimientoReducido.close()
  await browser.close()

  const home = resultados.find(resultado => resultado.viewport === 'desktop' && resultado.ruta === '/')
  const contratos = ['/cursos', '/login', '/register'].every(path => home?.links?.some(link => link.href === path))
  const resumen = {
    base,
    generatedAt: new Date().toISOString(),
    viewports,
    routes: rutas.length,
    samples: resultados.length,
    checks: {
      http: resultados.every(resultado => resultado.status >= 200 && resultado.status < 400),
      noPageErrors: resultados.every(resultado => resultado.pageErrors.length === 0),
      noHorizontalOverflow: resultados.every(resultado => !resultado.overflow),
      semanticLandmarks: resultados.every(resultado => resultado.lang && resultado.main === 1 && resultado.h1 <= 1),
      namedInteractions: resultados.every(resultado => resultado.unnamedInteractive.length === 0),
      headerNavigation: contratos,
      reducedMotion: pruebaMovimientoReducido?.matches === true && pruebaMovimientoReducido.animatedVisible === false,
      scrollNarrative: pruebasScroll.every(prueba => !prueba.error && (prueba.panelCount === 0 || prueba.titlesSeen.length === prueba.panelCount)),
    },
    warnings: {
      lowContrastSamples: resultados.reduce((total, resultado) => total + resultado.lowContrast.length, 0),
      smallTargetSamples: resultados.reduce((total, resultado) => total + resultado.smallTargets.length, 0),
      reducedMotionObserved: pruebaMovimientoReducido?.matches === true,
      reducedMotionCheck: pruebaMovimientoReducido,
      scrollNarrative: pruebasScroll,
    },
    criticalSamples: erroresCriticos.map(resultado => ({ viewport: resultado.viewport, ruta: resultado.ruta, status: resultado.status, pageErrors: resultado.pageErrors, failedRequests: resultado.failedRequests, overflow: resultado.overflow })),
    results: resultados,
  }
  writeFileSync(join(salida, 'report.json'), JSON.stringify(resumen, null, 2))
  console.log(JSON.stringify({ ...resumen, results: undefined }, null, 2))
  if (erroresCriticos.length) process.exitCode = 1
}

ejecutar().catch(error => {
  console.error(`design-auditor: ${error.message}`)
  process.exitCode = 2
})
