// Verifikasi aturan layout shell: statis + browser (Playwright).
// Jalankan: npm run check:layout
//
// Statis  : analisis src/App.tsx, Sheet.tsx, Dashboard.tsx, index.css, index.html, theme.tsx
// Browser : build VITE_SHELL_PREVIEW=true, preview server port 4174, Playwright Chromium

import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync, spawn, type ChildProcess } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const QA_DIR = resolve(ROOT, 'docs/qa/verify')

function read(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

type Check = { name: string; pass: boolean; detail?: string }
const results: Check[] = []

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail })
}

// ── 1. STATIS ─────────────────────────────────────────────────────────────────

const app     = read('src/App.tsx')
const sheet   = read('src/ui/Sheet.tsx')
const dash    = read('src/pages/Dashboard.tsx')
const css     = read('src/index.css')
const html    = read('index.html')
const theme   = read('src/lib/theme.tsx')
const txPage  = read('src/pages/Transactions.tsx')
const invPage = read('src/pages/Investments.tsx')
const recPage = read('src/pages/Recurring.tsx')

// Tab bar: md:hidden tanpa display di inline style
check(
  'Tab bar: className="md:hidden" pada nav bawah',
  /className="md:hidden[^"]*"[^>]*aria-label="Navigasi bawah"|aria-label="Navigasi bawah"[^>]*className="md:hidden[^"]*"/.test(app),
)
const tbStyleBlock = app.match(/aria-label="Navigasi bawah"[\s\S]{0,300}?style=\{\{([\s\S]{0,500}?)\}\}/)
check(
  'Tab bar: tidak ada display di inline style',
  !(tbStyleBlock?.[1] ?? '').includes('display'),
  'display di inline style mengalahkan md:hidden',
)

// Sidebar/rail: single nav hidden md:flex
check(
  'Sidebar/rail: className hidden md:flex nav-side (single nav)',
  /className="hidden md:flex nav-side"/.test(app),
  'nav samping harus hidden md:flex nav-side',
)
check(
  'Tidak ada pola lama hidden md:flex lg:hidden',
  !/className="hidden md:flex lg:hidden"/.test(app),
)

// Animasi tab: tanpa transform y
check(
  'Animasi tab: tanpa transform y (jaga position:fixed Sheet)',
  !/initial=\{\{[^}]*\by\b/.test(app) && !/exit=\{\{[^}]*\by\b/.test(app),
)

// ModeToggle hanya satu
const mtCount = (app.match(/<ModeToggle/g) || []).length
check('ModeToggle hanya satu kali di header', mtCount === 1, `ditemukan ${mtCount} kali`)

// Sheet: createPortal + footer prop
check('Sheet: createPortal ke document.body', sheet.includes('createPortal') && sheet.includes('document.body'))
check('Sheet: prop footer tersedia', sheet.includes('footer?'))

// CSS nav-side
check('CSS: .nav-side terdefinisi', css.includes('.nav-side {'))
check('CSS: .nav-side-btn terdefinisi', css.includes('.nav-side-btn {'))

// CSS sheet: display hanya di [open]
const baseBlock = css.match(/\.sheet-dialog\s*\{([^}]+)\}/)?.[1] ?? ''
check('CSS: .sheet-dialog base tanpa display', !baseBlock.includes('display'),
  '.sheet-dialog base punya display — dialog tampil meski showModal() belum dipanggil')
check('CSS: .sheet-dialog[open] ada dengan display',
  css.includes('.sheet-dialog[open]') && /\.sheet-dialog\[open\]\s*\{[^}]*display/.test(css))
check('CSS: .sheet-footer terdefinisi', css.includes('.sheet-footer {'))
// Sheet scrollbar styling
check('CSS: .sheet-content scrollbar-width thin', css.includes('scrollbar-width: thin'))

// Halaman: form id + tombol footer
check('Transactions: form id="form-tx"', txPage.includes('id="form-tx"'))
check('Transactions: tombol form="form-tx"', txPage.includes('form="form-tx"'))
check('Investments: form id="form-inv"', invPage.includes('id="form-inv"'))
check('Investments: tombol form="form-inv"', invPage.includes('form="form-inv"'))
check('Recurring: form id="form-rec"', recPage.includes('id="form-rec"'))
check('Recurring: tombol form="form-rec"', recPage.includes('form="form-rec"'))

// Dashboard empty state
check('Dashboard: empty state tidak memakai num-hero',
  !/num-hero[^<]*Belum ada data|Belum ada data[^<]*num-hero/.test(dash))

// Token CSS
for (const t of ['--z-header','--z-nav','--z-backdrop','--z-sheet','--z-toast'])
  check(`CSS: token ${t}`, css.includes(t))
for (const t of ['--header-h','--rail-w','--sidebar-w','--tabbar-h'])
  check(`CSS: token ${t}`, css.includes(t))

// Default palet B
check('index.html: default palet b', html.includes('data-palette="b"') && html.includes("|| 'b'"))
check('theme.tsx: default palet b', theme.includes("|| 'b'"))

// ── 2. BROWSER (Playwright) ───────────────────────────────────────────────────

const PREVIEW_PORT = 4174
const PREVIEW_DIST = resolve(ROOT, 'dist-preview')
const WIDTHS = [390, 767, 768, 1000, 1023, 1024, 1440]
const SCREENSHOT_WIDTHS = [390, 768, 1000, 1440]
const PAGE_TABS = ['home', 'tx', 'inv', 'rec', 'set']
const SHEET_DEFS = [
  { hash: 'tx',  label: 'Sheet-TambahTransaksi', btnText: 'Tambah' },
  { hash: 'inv', label: 'Sheet-CatatDCA',         btnText: 'Catat DCA' },
  { hash: 'rec', label: 'Sheet-TambahRutin',      btnText: 'Tambah' },
]

let serverProc: ChildProcess | null = null

async function startServer(): Promise<void> {
  return new Promise((res) => {
    serverProc = spawn('npx', ['vite', 'preview', '--outDir', PREVIEW_DIST, '--port', String(PREVIEW_PORT)], {
      cwd: ROOT, stdio: 'pipe',
    })
    const done = () => setTimeout(res, 400)
    serverProc.stderr?.on('data', (d: Buffer) => { if (d.toString().includes('localhost')) done() })
    serverProc.stdout?.on('data', (d: Buffer) => { if (d.toString().includes('localhost')) done() })
    setTimeout(res, 3000)
  })
}

function stopServer() {
  serverProc?.kill('SIGTERM')
  serverProc = null
}

async function runPlaywright() {
  let pw: typeof import('playwright')
  try { pw = await import('playwright') } catch {
    console.log('\n  ⚠ Playwright tidak tersedia — lewati uji browser')
    return
  }

  console.log('\n  Membangun versi pratinjau...')
  try {
    execSync('npx vite build --outDir dist-preview --logLevel warn', {
      cwd: ROOT, env: { ...process.env, VITE_SHELL_PREVIEW: 'true' }, stdio: 'pipe',
    })
  } catch (e: unknown) {
    check('Build pratinjau', false, String(e).slice(0, 200))
    return
  }
  check('Build pratinjau', true)

  console.log('  Memulai server pratinjau...')
  await startServer()

  const BASE = `http://localhost:${PREVIEW_PORT}`
  const browser = await pw.chromium.launch()

  try {
    // Konsol browser bersih — kumpulkan error/warning di semua tab
    {
      const TABS_HASH = ['home', 'tx', 'inv', 'rec', 'set']
      const consoleErrors: string[] = []
      const p = await browser.newPage()
      p.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          const txt = msg.text()
          // Abaikan warning browser bawaan tentang SW saat preview
          if (/service.worker|insecure|deprecated/i.test(txt)) return
          consoleErrors.push(`[${msg.type()}] ${txt.slice(0, 120)}`)
        }
      })
      await p.setViewportSize({ width: 390, height: 700 })
      for (const tab of TABS_HASH) {
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(300)
      }
      check('Browser: konsol bersih di semua tab (390px)', consoleErrors.length === 0,
        consoleErrors.slice(0, 5).join(' | '))
      await p.close()
    }

    // Palet default B (localStorage kosong)
    {
      const p = await browser.newPage()
      await p.goto(BASE)
      const pal = await p.evaluate("document.documentElement.getAttribute('data-palette')")
      check('Browser: default palet B (localStorage kosong)', pal === 'b', `palet: ${pal}`)
      await p.close()
    }

    // Shell VITE_SHELL_PREVIEW merender tanpa auth
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 1024, height: 768 })
      await p.goto(BASE)
      const ok = await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 })
        .then(() => true).catch(() => false)
      check('Browser: Shell pratinjau merender tanpa auth', ok)
      await p.close()
    }

    // Nav eksklusif — hitung nav yang terlihat di tiap lebar
    for (const w of WIDTHS) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 700 })
      await p.goto(BASE)
      await p.waitForSelector('[data-testid]', { timeout: 8000 }).catch(() => {})

      // Gunakan string evaluate — hindari __name dari tsx
      const res = await p.evaluate(`(function() {
        var vis = function(el) {
          if (!el) return false;
          var s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && (s.position === 'fixed' || el.offsetParent !== null);
        };
        var tb = document.querySelector('[aria-label="Navigasi bawah"]');
        var sn = document.querySelector('[aria-label="Navigasi"]');
        return { tb: vis(tb), sn: vis(sn) };
      })()`) as { tb: boolean; sn: boolean }

      const cnt = [res.tb, res.sn].filter(Boolean).length
      check(`Nav ${w}px: tepat 1 nav terlihat`, cnt === 1,
        `tab bar=${res.tb}, sidebar/rail=${res.sn}`)
      if (w === 1000) {
        check('Nav 1000px: sidebar/rail terlihat, tab bar tidak',
          res.sn && !res.tb, `tab bar=${res.tb}, sideNav=${res.sn}`)
      }
      await p.close()
    }

    // Pill aktif < 60% lebar sel di 390px
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 390, height: 700 })
      await p.goto(BASE)
      await p.waitForSelector('[aria-label="Navigasi bawah"]', { timeout: 6000 }).catch(() => {})

      const pc = await p.evaluate(`(function() {
        var btn = document.querySelector('[aria-label="Navigasi bawah"] button[aria-current="page"]');
        if (!btn) return { ok: false, detail: 'tombol aktif tidak ditemukan' };
        var br = btn.getBoundingClientRect();
        var pill = btn.querySelector('span');
        if (!pill) return { ok: false, detail: 'span pill tidak ditemukan' };
        var pr = pill.getBoundingClientRect();
        var ratio = br.width > 0 ? pr.width / br.width : 1;
        return { ok: ratio < 0.60, detail: Math.round(pr.width) + 'px / ' + Math.round(br.width) + 'px = ' + Math.round(ratio * 100) + '%' };
      })()`) as { ok: boolean; detail: string }
      check('Pill aktif 390px: lebar < 60% sel', pc.ok, pc.detail)
      await p.close()
    }

    // Sheet Tambah Transaksi: :modal + Simpan terlihat di dua viewport
    for (const vp of [{ w: 1000, h: 560 }, { w: 390, h: 700 }]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: vp.w, height: vp.h })
      await p.goto(`${BASE}/#tx`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})

      const opened = await p.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button'));
        var add = btns.find(function(b) {
          return (b.textContent.trim() === 'Tambah' || b.textContent.includes('Tambah Transaksi'))
            && !b.closest('dialog');
        });
        if (add) { add.click(); return true; }
        return false;
      })()`) as boolean

      if (opened) {
        await p.waitForTimeout(400)
        const sr = await p.evaluate(`(function(vh) {
          var d = document.querySelector('dialog[open]');
          var modal = d ? d.matches(':modal') : false;
          var sb = d ? (d.querySelector('[type="submit"]') || d.querySelector('.sheet-footer button')) : null;
          var rect = sb ? sb.getBoundingClientRect() : null;
          var vis = rect ? rect.top >= 0 && rect.bottom <= vh && rect.width > 0 : false;
          return { modal: modal, simpanVis: vis };
        })(${vp.h})`) as { modal: boolean; simpanVis: boolean }
        check(`Sheet Tx ${vp.w}x${vp.h}: dialog :modal`, sr.modal)
        check(`Sheet Tx ${vp.w}x${vp.h}: tombol Simpan terlihat`, sr.simpanVis)
      } else {
        check(`Sheet Tx ${vp.w}x${vp.h}: tombol buka ditemukan`, false, 'tombol Tambah tidak ditemukan di halaman')
        check(`Sheet Tx ${vp.w}x${vp.h}: tombol Simpan terlihat`, false, 'sheet tidak bisa dibuka')
      }
      await p.close()
    }

    // Sheet alignment: panel terpusat dan lebar input = lebar tombol Simpan
    for (const vp of [{ w: 390, h: 700 }, { w: 768, h: 900 }, { w: 1000, h: 560 }]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: vp.w, height: vp.h })
      await p.goto(`${BASE}/#tx`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})

      const opened = await p.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button'));
        var add = btns.find(function(b) {
          return (b.textContent.trim() === 'Tambah' || b.textContent.includes('Tambah Transaksi'))
            && !b.closest('dialog');
        });
        if (add) { add.click(); return true; }
        return false;
      })()`) as boolean

      if (opened) {
        await p.waitForTimeout(400)
        const res = await p.evaluate(`(function(vw) {
          var dialog = document.querySelector('dialog[open]');
          if (!dialog) return { ok: false, detail: 'dialog tidak ditemukan' };
          var panel = dialog.querySelector('.sheet-inner');
          if (!panel) return { ok: false, detail: 'sheet-inner tidak ditemukan' };
          var pr = panel.getBoundingClientRect();
          var leftMargin = pr.left;
          var rightMargin = vw - pr.right;
          var centerDiff = Math.abs(leftMargin - rightMargin);
          var input = dialog.querySelector('[class="money-input-wrap"]');
          var btn = dialog.querySelector('.sheet-footer button');
          var inputW = input ? input.getBoundingClientRect().width : -1;
          var btnW = btn ? btn.getBoundingClientRect().width : -1;
          var widthDiff = inputW >= 0 && btnW >= 0 ? Math.abs(inputW - btnW) : 0;
          var ok = centerDiff < 2 && widthDiff < 2;
          return { ok: ok, detail: 'center diff ' + Math.round(centerDiff * 10) / 10 + 'px, input/btn diff ' + Math.round(widthDiff * 10) / 10 + 'px' };
        })(${vp.w})`) as { ok: boolean; detail: string }
        check(`Sheet ${vp.w}px: panel terpusat dan lebar input = Simpan`, res.ok, res.detail)
      } else {
        check(`Sheet ${vp.w}px: panel terpusat dan lebar input = Simpan`, false, 'sheet tidak bisa dibuka')
      }
      await p.close()
    }

    // Sheet centering: panel terpusat vertikal dan horizontal di >= 768px
    for (const w of [768, 1000, 1440, 1920]) {
      for (const h of [700, 1000]) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: h })
        await p.goto(`${BASE}/#tx`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})

        const opened = await p.evaluate(`(function() {
          var btns = Array.from(document.querySelectorAll('button'));
          var add = btns.find(function(b) {
            return (b.textContent.trim() === 'Tambah' || b.textContent.includes('Tambah Transaksi'))
              && !b.closest('dialog');
          });
          if (add) { add.click(); return true; }
          return false;
        })()`) as boolean

        if (opened) {
          await p.waitForTimeout(400)
          const cv = await p.evaluate(`(function(vw, vh) {
            var dialog = document.querySelector('dialog[open]');
            if (!dialog) return { vert: false, horiz: false, detail: 'dialog tidak ditemukan' };
            var panel = dialog.querySelector('.sheet-inner');
            if (!panel) return { vert: false, horiz: false, detail: 'sheet-inner tidak ditemukan' };
            var rect = panel.getBoundingClientRect();
            var topMargin = rect.top;
            var bottomMargin = vh - rect.bottom;
            var vertDiff = Math.abs(topMargin - bottomMargin);
            var leftMargin = rect.left;
            var rightMargin = vw - rect.right;
            var horizDiff = Math.abs(leftMargin - rightMargin);
            return {
              vert: vertDiff < 2,
              horiz: horizDiff < 2,
              detail: 'vert diff ' + Math.round(vertDiff * 10) / 10 + 'px, horiz diff ' + Math.round(horizDiff * 10) / 10 + 'px'
            };
          })(${w}, ${h})`) as { vert: boolean; horiz: boolean; detail: string }
          check(`Sheet ${w}x${h}: panel terpusat vertikal`, cv.vert, cv.detail)
          check(`Sheet ${w}x${h}: panel terpusat horizontal`, cv.horiz, cv.detail)
        } else {
          check(`Sheet ${w}x${h}: panel terpusat vertikal`, false, 'sheet tidak bisa dibuka')
          check(`Sheet ${w}x${h}: panel terpusat horizontal`, false, 'sheet tidak bisa dibuka')
        }
        await p.close()
      }
    }

    // ── Halaman Laporan (#lap) di 390/768/1440 ──
    for (const w of [390, 768, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#lap`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(300)

      const r = await p.evaluate(`(function() {
        var page = document.querySelector('[data-testid="report-page"]');
        var h1 = document.querySelector('h1');
        var cards = document.querySelectorAll('[data-testid="report-page"] section.card');
        return {
          pageVisible: !!page,
          titleOk: !!h1 && h1.textContent.trim() === 'Laporan',
          cardCount: cards.length,
        };
      })()`) as { pageVisible: boolean; titleOk: boolean; cardCount: number }

      check(`Report ${w}px: halaman #lap termuat`, r.pageVisible)
      check(`Report ${w}px: judul "Laporan"`, r.titleOk)
      check(`Report ${w}px: 4 kartu laporan tampil`, r.cardCount === 4, `cardCount=${r.cardCount}`)

      // Konten tidak overflow: section.card tidak lebih lebar dari viewport
      const overflow = await p.evaluate(`(function(vw) {
        var cards = Array.from(document.querySelectorAll('[data-testid="report-page"] section.card'));
        for (var i = 0; i < cards.length; i++) {
          var rect = cards[i].getBoundingClientRect();
          if (rect.right > vw + 1) return { ok: false, detail: 'card ' + i + ' right=' + Math.round(rect.right) + ' > vw=' + vw };
        }
        return { ok: true, detail: '' };
      })(${w})`) as { ok: boolean; detail: string }
      check(`Report ${w}px: kartu tidak overflow`, overflow.ok, overflow.detail)

      await p.close()
    }

    // Dashboard: kartu Saldo Rekening tampil di 1440px
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 1440, height: 900 })
      await p.goto(`${BASE}/#home`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(300)

      const found = await p.evaluate(`(function() {
        var h2s = Array.from(document.querySelectorAll('h2'));
        return h2s.some(function(h) { return h.textContent.trim() === 'Saldo Rekening'; });
      })()`) as boolean
      check('Dashboard 1440px: kartu Saldo Rekening tampil', found)
      await p.close()
    }

    // Tangkapan layar
    mkdirSync(QA_DIR, { recursive: true })
    console.log(`\n  Mengambil tangkapan layar ke docs/qa/verify/...`)
    let n = 0

    for (const pal of ['a', 'b'] as const) {
      for (const mod of ['light', 'dark'] as const) {
        const p = await browser.newPage()
        await p.goto(BASE)
        await p.evaluate(`(function(pal, m) {
          localStorage.setItem('artha:palette', pal);
          localStorage.setItem('artha:mode', m);
        })('${pal}', '${mod}')`)

        for (const w of SCREENSHOT_WIDTHS) {
          await p.setViewportSize({ width: w, height: 700 })

          for (const tab of PAGE_TABS) {
            await p.evaluate(`location.hash = '${tab}'`)
            await p.waitForTimeout(250)
            await p.screenshot({ path: resolve(QA_DIR, `${pal}-${mod}-${w}-${tab}.png`) })
            n++
          }

          for (const sh of SHEET_DEFS) {
            await p.evaluate(`location.hash = '${sh.hash}'`)
            await p.waitForTimeout(200)
            const ok = await p.evaluate(`(function(txt) {
              var btns = Array.from(document.querySelectorAll('button'));
              var b = btns.find(function(b) { return b.textContent.trim() === txt && !b.closest('dialog'); });
              if (b) { b.click(); return true; }
              return false;
            })('${sh.btnText}')`) as boolean
            if (ok) {
              await p.waitForTimeout(300)
              await p.screenshot({ path: resolve(QA_DIR, `${pal}-${mod}-${w}-${sh.label}.png`) })
              n++
              await p.keyboard.press('Escape')
              await p.waitForTimeout(200)
            }
          }
        }
        await p.close()
      }
    }
    console.log(`  ${n} tangkapan layar disimpan.`)

  } finally {
    await browser.close()
    stopServer()
    if (existsSync(PREVIEW_DIST)) rmSync(PREVIEW_DIST, { recursive: true, force: true })
  }
}

await runPlaywright()

// ── Laporan ────────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.pass)
const failed = results.filter(r => !r.pass)

console.log('\n── check:layout ────────────────────────────────────────────\n')
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`)
  if (!r.pass && r.detail) console.log(`      → ${r.detail}`)
}
console.log(`\n  ${passed.length} lolos, ${failed.length} gagal`)
console.log('─────────────────────────────────────────────────────────────\n')

if (failed.length > 0) process.exit(1)
