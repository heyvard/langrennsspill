#!/usr/bin/env node
// Headless canvas-screenshot for sesjoner uten tilkoblet nettleser (f.eks. remote sandbox).
// Bruk: pnpm screenshot [--out <path>] [--width N] [--height N] [--wait ms] [--build]
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { createServer, build, preview } from 'vite'

function parseArgs(argv) {
  const args = { out: '.claude/screenshots/latest.png', width: 1280, height: 800, wait: 1500, build: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.out = argv[++i]
    else if (a === '--width') args.width = Number(argv[++i])
    else if (a === '--height') args.height = Number(argv[++i])
    else if (a === '--wait') args.wait = Number(argv[++i])
    else if (a === '--build') args.build = true
    else throw new Error(`Ukjent flagg: ${a}`)
  }
  return args
}

async function startServer(useBuild) {
  if (useBuild) {
    await build()
    const server = await preview({ preview: { port: 0 } })
    const address = server.resolvedUrls.local[0]
    return { url: address, close: () => new Promise((res) => server.httpServer.close(res)) }
  }
  const server = await createServer({ server: { port: 0 } })
  await server.listen()
  const address = server.resolvedUrls.local[0]
  return { url: address, close: () => server.close() }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outPath = resolve(args.out)
  await mkdir(dirname(outPath), { recursive: true })

  const server = await startServer(args.build)
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  })

  try {
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } })
    const consoleIssues = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') consoleIssues.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', (err) => consoleIssues.push(`[pageerror] ${err.message}`))

    await page.goto(server.url, { waitUntil: 'load' })
    await page.waitForSelector('canvas', { timeout: 15000 })
    await page.waitForTimeout(args.wait)

    const canvas = page.locator('canvas').first()
    await canvas.screenshot({ path: outPath })

    console.log(`Screenshot lagret: ${outPath}`)
    if (consoleIssues.length > 0) {
      console.log('\nKonsoll-varsler/feil under lasting:')
      for (const line of consoleIssues) console.log(`  ${line}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
