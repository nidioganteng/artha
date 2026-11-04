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

// Investments: pakai InvestmentChart
check('Investments: pakai InvestmentChart', invPage.includes('<InvestmentChart') && invPage.includes("from '../ui/InvestmentChart'"))

// InvestmentChart: tidak ada early return yang menyembunyikan kontrol (chip aset/periode)
// Sebelum perbaikan, ada dua `return (` sebelum render kontrol, sehingga kontrol hilang
const invChart = read('src/ui/InvestmentChart.tsx')
// Kontrol harus selalu dirender: cari data-testid="investment-chart" dan pastikan
// tidak ada return lebih dari satu sebelum ChipBar/chip aset
const topLevelReturnCount = (() => {
  // Cari early return di level atas fungsi InvestmentChart (indent 2 spasi, bukan di callback)
  // Buggy pattern: `  return (\n    <div className="card bento-full"` tanpa kontrol chip
  const mainFnStart = invChart.indexOf('export function InvestmentChart')
  const mainFnBody = mainFnStart >= 0 ? invChart.slice(mainFnStart) : ''
  // Top-level return: baris yang diawali tepat 2 spasi, bukan di dalam arrow function
  const lines = mainFnBody.split('\n')
  return lines.filter((l) => /^  return\s*\(/.test(l)).length
})()
check('InvestmentChart: tepat 1 top-level return di komponen utama (tidak ada early return)',
  topLevelReturnCount === 1,
  `ditemukan ${topLevelReturnCount} top-level return, harus tepat 1`)

// InvestmentChart: memakai useContainerWidth (callback ref untuk elemen kondisional)
check('InvestmentChart: import useContainerWidth dari lib/useContainerWidth',
  invChart.includes("from '../lib/useContainerWidth'") && invChart.includes('useContainerWidth()'),
  'harus import useContainerWidth; useRef+useEffect([ref]) tidak aman untuk elemen kondisional')
check('InvestmentChart: tidak ada definisi useElementWidth lokal',
  !invChart.includes('function useElementWidth'),
  'hook lama useElementWidth harus dihapus dari InvestmentChart')
check('InvestmentChart: kontainer grafik punya tinggi tetap (height: H)',
  invChart.includes('height: H') && invChart.includes('ref={chartElRef}'),
  'div container chart harus punya height: H agar tidak runtuh jadi 0 saat elemen mount')
check('InvestmentChart: guard NaN di yFor (Number.isFinite)',
  invChart.includes('Number.isFinite(y)'),
  'yFor harus memakai Number.isFinite agar grafik flat line tidak menghasilkan NaN')

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

// Bar chart: tidak ada preserveAspectRatio="none" + teks SVG di dalamnya
check('Dashboard: BarChart tidak memakai preserveAspectRatio="none"',
  !dash.includes('preserveAspectRatio="none"'),
  'preserveAspectRatio="none" menyebabkan teks meregang non-uniform')
// Legenda bar chart adalah HTML (bukan elemen SVG <text>/<rect>)
check('Dashboard: legenda bar chart pakai HTML (data-testid="chart-legend")',
  dash.includes('data-testid="chart-legend"'),
  'legenda harus di luar SVG agar tidak terdistorsi')

// Token CSS
for (const t of ['--z-header','--z-nav','--z-backdrop','--z-sheet','--z-toast'])
  check(`CSS: token ${t}`, css.includes(t))
for (const t of ['--header-h','--rail-w','--sidebar-w','--tabbar-h'])
  check(`CSS: token ${t}`, css.includes(t))

// Default palet B
check('index.html: default palet b', html.includes('data-palette="b"') && html.includes("|| 'b'"))
check('theme.tsx: default palet b', theme.includes("|| 'b'"))

// ── Mode Akun (investasi) ─────────────────────────────────────────────────────

// App.tsx: data-account-mode attribute pada shell div
check('App.tsx: data-account-mode pada shell div', app.includes('data-account-mode={accountMode}'))

// App.tsx: INVEST_HIDDEN dan INVEST_HIDDEN_MOBILE didefinisikan
check('App.tsx: INVEST_HIDDEN = [tx, lap]', /INVEST_HIDDEN[^=]*=\s*\[['"]tx['"],\s*['"]lap['"]\]/.test(app))
check('App.tsx: INVEST_HIDDEN_MOBILE didefinisikan', app.includes("INVEST_HIDDEN_MOBILE"))

// App.tsx: useMode() dipanggil di Shell
check('App.tsx: useMode dipanggil di Shell', app.includes('useMode') && app.includes("from './lib/useMode'"))

// App.tsx: tab filtering berdasarkan accountMode
check('App.tsx: mobileTabs filter berdasarkan accountMode', /mobileTabs\s*=/.test(app))
check('App.tsx: sideTabs filter berdasarkan accountMode', /sideTabs\s*=/.test(app))

// App.tsx: guard redirect jika tab tidak valid di mode investasi
check('App.tsx: route guard mode investasi', app.includes("accountMode === 'investasi'") && (app.includes("go('inv')") || app.includes("go(\"inv\")")))

// Dashboard.tsx: KPI Pemasukan hanya tampil di mode lengkap
check('Dashboard.tsx: KPI Pemasukan conditional accountMode', /accountMode === 'lengkap'[^}]*kpi-pemasukan|kpi-pemasukan[^}]*accountMode === 'lengkap'/.test(dash) || (dash.includes("accountMode === 'lengkap'") && dash.includes('kpi-pemasukan')))

// Dashboard.tsx: Porsi Kontributor card ditambahkan
check('Dashboard.tsx: Porsi Kontributor card', dash.includes('Porsi Kontributor') && dash.includes('contribShares'))

// Settings.tsx: Mode Akun section ada
const settingsPage = read('src/pages/Settings.tsx')
check('Settings.tsx: Mode Akun section ada', settingsPage.includes('Mode Akun'))
check('Settings.tsx: setAccountMode dipanggil', settingsPage.includes('setAccountMode'))
check('Settings.tsx: toggle kunci mode (role=switch)', settingsPage.includes('role="switch"') && settingsPage.includes('setModeLocked') && settingsPage.includes('data-testid="mode-lock-toggle"'))
check('Settings.tsx: ConfirmDialog untuk mode lengkap', settingsPage.includes("pendingMode === 'lengkap'") && settingsPage.includes('Ganti ke Mode Lengkap'))
check('Settings.tsx: ConfirmDialog buka kunci mode', settingsPage.includes('confirmUnlock') && settingsPage.includes('Buka Kunci'))

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
          // Abaikan 404 aset bawaan preview (ikon dsb) dan warning missing-table
          // untuk price_snapshots yang memang bisa belum ada sebelum migrasi.
          if (/Failed to load resource/i.test(txt)) return
          if (/\[store\] tabel .* belum ada di database/i.test(txt)) return
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

    // Dashboard: grid baru — Saldo+Donut berdampingan, Bar selebar penuh
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 1440, height: 900 })
      await p.goto(`${BASE}/#home`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(400)

      const gr = await p.evaluate(`(function() {
        var bal  = document.querySelector('[data-testid="card-balance"]');
        var don  = document.querySelector('[data-testid="card-donut"]');
        var bar  = document.querySelector('[data-testid="card-bar"]');
        if (!bal || !don || !bar) return { ok: false, detail: 'elemen tidak ditemukan: bal=' + !!bal + ' don=' + !!don + ' bar=' + !!bar };
        var br = bal.getBoundingClientRect();
        var dr = don.getBoundingClientRect();
        var barr = bar.getBoundingClientRect();
        var sameTop   = Math.abs(br.top - dr.top) < 2;
        var sameHeight = Math.abs(br.height - dr.height) < 2;
        var barBelow  = barr.top >= dr.bottom - 2;
        var barLeftOk  = Math.abs(barr.left - br.left) < 2;
        var barRightOk = Math.abs(barr.right - dr.right) < 2;
        var ok = sameTop && sameHeight && barBelow && barLeftOk && barRightOk;
        return { ok: ok, sameTop: sameTop, sameH: sameHeight, barBelow: barBelow, barL: barLeftOk, barR: barRightOk,
          detail: 'topDiff=' + Math.round(Math.abs(br.top-dr.top)*10)/10 + ' hDiff=' + Math.round(Math.abs(br.height-dr.height)*10)/10 + ' barLeft=' + Math.round(barr.left) + ' balLeft=' + Math.round(br.left) };
      })()`) as { ok: boolean; sameTop: boolean; sameH: boolean; barBelow: boolean; barL: boolean; barR: boolean; detail: string }

      check('Dashboard 1440px: Saldo+Donut baris sama (top < 2px)', gr.sameTop, gr.detail)
      check('Dashboard 1440px: Saldo dan Donut tinggi sama (< 2px)', gr.sameH, gr.detail)
      check('Dashboard 1440px: Bar di bawah Saldo+Donut', gr.barBelow, gr.detail)
      check('Dashboard 1440px: Bar melebar dari kiri Saldo ke kanan Donut', gr.barL && gr.barR, gr.detail)
      await p.close()
    }

    // Dashboard 390px: Saldo → Donut → Bar bertumpuk berurutan
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 390, height: 900 })
      await p.goto(`${BASE}/#home`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(400)

      const st = await p.evaluate(`(function() {
        var bal  = document.querySelector('[data-testid="card-balance"]');
        var don  = document.querySelector('[data-testid="card-donut"]');
        var bar  = document.querySelector('[data-testid="card-bar"]');
        if (!bal || !don || !bar) return { ok: false, detail: 'elemen tidak ditemukan' };
        var br = bal.getBoundingClientRect();
        var dr = don.getBoundingClientRect();
        var barr = bar.getBoundingClientRect();
        var order = br.top < dr.top && dr.top < barr.top;
        var noOverflow = barr.right <= 390 + 1;
        return { ok: order && noOverflow, detail: 'bal.top=' + Math.round(br.top) + ' don.top=' + Math.round(dr.top) + ' bar.top=' + Math.round(barr.top) + ' bar.right=' + Math.round(barr.right) };
      })()`) as { ok: boolean; detail: string }

      check('Dashboard 390px: Saldo → Donut → Bar bertumpuk berurutan', st.ok, st.detail)
      await p.close()
    }

    // Dashboard: urutan kartu — hero di atas KPI Pemasukan (DOM dan visual)
    for (const w of [390, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#home`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(400)

      const order = await p.evaluate(`(function() {
        var hero = document.querySelector('[data-testid="dashboard-hero"]');
        var kpi  = document.querySelector('[data-testid="kpi-pemasukan"]');
        if (!hero || !kpi) return { topOk: false, domOk: false, detail: 'elemen tidak ditemukan: hero=' + !!hero + ' kpi=' + !!kpi };
        var hr = hero.getBoundingClientRect();
        var kr = kpi.getBoundingClientRect();
        var topOk = hr.top < kr.top;
        var all = Array.from(document.querySelectorAll('[data-testid="dashboard-hero"], [data-testid="kpi-pemasukan"]'));
        var domOk = all.length >= 2 && all[0] === hero;
        return { topOk: topOk, domOk: domOk, detail: 'hero.top=' + Math.round(hr.top) + ' kpi.top=' + Math.round(kr.top) };
      })()`) as { topOk: boolean; domOk: boolean; detail: string }

      check(`Dashboard ${w}px: hero di atas KPI Pemasukan (visual)`, order.topOk, order.detail)
      check(`Dashboard ${w}px: hero sebelum KPI Pemasukan (DOM)`, order.domOk, order.detail)
      await p.close()
    }

    // Bar chart: legenda di luar SVG, tidak ada SVG[preserveAspectRatio="none"] dengan teks
    for (const w of [390, 768, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#home`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(400)

      const cr = await p.evaluate(`(function() {
        // Legenda harus ada sebagai HTML di luar SVG
        var legend = document.querySelector('[data-testid="chart-legend"]');
        var legendIsHtml = legend && legend.tagName.toLowerCase() !== 'g' && legend.tagName.toLowerCase() !== 'svg';
        var legendNotInSvg = legend && legend.closest('svg') === null;
        // Tidak boleh ada SVG dengan preserveAspectRatio="none" yang berisi <text>
        var distortedSvgs = Array.from(document.querySelectorAll('svg[preserveAspectRatio="none"]'));
        var hasTextInDistorted = distortedSvgs.some(function(svg) { return svg.querySelectorAll('text').length > 0; });
        // Legenda teks harus terlihat (tidak terpotong)
        var legendVisible = false;
        if (legend) {
          var r = legend.getBoundingClientRect();
          legendVisible = r.width > 0 && r.height > 0 && r.top >= 0;
        }
        return {
          legendIsHtml: !!legendIsHtml,
          legendNotInSvg: !!legendNotInSvg,
          noDistortedText: !hasTextInDistorted,
          legendVisible: legendVisible,
          detail: 'legend tag=' + (legend ? legend.tagName : 'null') + ' distortedSvgs=' + distortedSvgs.length + ' hasTextInDistorted=' + hasTextInDistorted
        };
      })()`) as { legendIsHtml: boolean; legendNotInSvg: boolean; noDistortedText: boolean; legendVisible: boolean; detail: string }

      check(`BarChart ${w}px: legenda adalah HTML (bukan SVG)`, cr.legendIsHtml, cr.detail)
      check(`BarChart ${w}px: legenda tidak di dalam SVG`, cr.legendNotInSvg, cr.detail)
      check(`BarChart ${w}px: tidak ada SVG preserveAspectRatio="none" dengan teks`, cr.noDistortedText, cr.detail)
      check(`BarChart ${w}px: legenda terlihat`, cr.legendVisible, cr.detail)
      await p.close()
    }

    // ── Halaman Investasi: InvestmentChart (#inv) ──
    for (const w of [360, 390, 768, 1000, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#inv`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(500)

      const r = await p.evaluate(`(function(vw) {
        var card = document.querySelector('[data-testid="investment-chart"]');
        var legend = document.querySelector('[data-testid="invest-legend"]');
        // Legenda hanya ada kalau grafik punya data; dalam preview mode kemungkinan empty state.
        var legendInSvg = legend ? legend.closest('svg') !== null : false;
        var distorted = Array.from(document.querySelectorAll('svg[preserveAspectRatio="none"]'));
        var distortedHasText = distorted.some(function(svg) { return svg.querySelectorAll('text').length > 0; });
        var hasHorizontalScroll = document.documentElement.scrollWidth > vw + 1;
        var cardRect = card ? card.getBoundingClientRect() : null;
        var overflow = cardRect ? cardRect.right > vw + 1 : false;
        // Judul harus muncul di dalam kartu (baik empty state maupun grafik)
        var titleOk = false;
        if (card) {
          var h2 = card.querySelector('h2');
          titleOk = h2 && h2.textContent && h2.textContent.indexOf('Perkembangan Investasi') >= 0;
        }
        return {
          cardVisible: !!card,
          titleOk: !!titleOk,
          legendNotInSvg: !legendInSvg,
          noDistortedText: !distortedHasText,
          noHorizontalScroll: !hasHorizontalScroll,
          noCardOverflow: !overflow,
          detail: 'card=' + !!card + ' title=' + !!titleOk + ' legend=' + !!legend + ' legendInSvg=' + legendInSvg + ' distorted=' + distorted.length + ' hScroll=' + hasHorizontalScroll + ' cardOverflow=' + overflow
        };
      })(${w})`) as {
        cardVisible: boolean
        titleOk: boolean
        legendNotInSvg: boolean
        noDistortedText: boolean
        noHorizontalScroll: boolean
        noCardOverflow: boolean
        detail: string
      }

      check(`InvestChart ${w}px: kartu "Perkembangan Investasi" tampil`, r.cardVisible, r.detail)
      check(`InvestChart ${w}px: judul kartu muncul`, r.titleOk, r.detail)
      check(`InvestChart ${w}px: legenda (jika ada) bukan di dalam SVG`, r.legendNotInSvg, r.detail)
      check(`InvestChart ${w}px: tidak ada SVG preserveAspectRatio="none" dengan teks`, r.noDistortedText, r.detail)
      check(`InvestChart ${w}px: tidak ada horizontal scroll`, r.noHorizontalScroll, r.detail)
      check(`InvestChart ${w}px: kartu tidak overflow`, r.noCardOverflow, r.detail)
      await p.close()
    }

    // ── InvestmentChart empty-state: kontrol selalu tampil ──
    for (const w of [390, 768, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#inv`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(500)

      const er = await p.evaluate(`(function(vw) {
        var card = document.querySelector('[data-testid="investment-chart"]');
        if (!card) return { ok: false, detail: 'kartu tidak ditemukan' };

        // 1. Judul selalu ada
        var h2 = card.querySelector('h2');
        var titleOk = h2 && h2.textContent && h2.textContent.indexOf('Perkembangan Investasi') >= 0;

        // 2. Chip "Semua" selalu ada (tombol dengan teks "Semua" di dalam kartu)
        var btns = Array.from(card.querySelectorAll('button'));
        var semuaBtn = btns.find(function(b) { return b.textContent && b.textContent.trim() === 'Semua'; });
        var semuaBtnVisible = semuaBtn ? (function(el) {
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })(semuaBtn) : false;

        // 3. Chip periode (6B, 12B, Semua) selalu ada
        var periodBtns = btns.filter(function(b) {
          var t = b.textContent && b.textContent.trim();
          return t === '6B' || t === '12B';
        });
        var periodChipsOk = periodBtns.length >= 2;

        // 4. Tidak ada horizontal scroll
        var noHScroll = document.documentElement.scrollWidth <= vw + 1;

        // 5. Kartu ada di viewport (tidak tersembunyi)
        var cardRect = card.getBoundingClientRect();
        var cardInView = cardRect.width > 0;

        // 6. Area kosong memakai teks biasa (bukan num-hero)
        var emptyMsg = card.querySelector('[class*="muted"]');
        var emptyMsgOk = !!emptyMsg;

        return {
          titleOk: !!titleOk,
          semuaBtnVisible: semuaBtnVisible,
          periodChipsOk: periodChipsOk,
          noHScroll: noHScroll,
          cardInView: cardInView,
          emptyMsgOk: emptyMsgOk,
          detail: 'title=' + !!titleOk + ' semuaBtn=' + semuaBtnVisible + ' periodChips=' + periodBtns.length + ' hScroll=' + !noHScroll + ' scrollW=' + document.documentElement.scrollWidth + ' vw=' + vw
        };
      })(${w})`) as {
        titleOk: boolean; semuaBtnVisible: boolean; periodChipsOk: boolean
        noHScroll: boolean; cardInView: boolean; emptyMsgOk: boolean; detail: string
      }

      check(`InvestChart-empty ${w}px: judul selalu tampil`, er.titleOk, er.detail)
      check(`InvestChart-empty ${w}px: chip "Semua" selalu tampil`, er.semuaBtnVisible, er.detail)
      check(`InvestChart-empty ${w}px: chip periode selalu tampil`, er.periodChipsOk, er.detail)
      check(`InvestChart-empty ${w}px: tidak ada horizontal scroll`, er.noHScroll, er.detail)
      check(`InvestChart-empty ${w}px: pesan kosong memakai teks biasa`, er.emptyMsgOk, er.detail)
      await p.close()
    }

    // ── InvestmentChart: localStorage berisi id aset yang tidak ada → kembali ke "Semua" ──
    {
      const p = await browser.newPage()
      await p.setViewportSize({ width: 390, height: 700 })
      // Set fake asset id di localStorage sebelum navigasi
      await p.goto(`${BASE}/#inv`)
      await p.evaluate(`localStorage.setItem('artha:chart:asset', 'aaaaaaaa-fake-fake-fake-aaaaaaaaaaaa')`)
      await p.reload()
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(600)

      const ls = await p.evaluate(`(function() {
        var card = document.querySelector('[data-testid="investment-chart"]');
        var btns = card ? Array.from(card.querySelectorAll('button')) : [];
        var semuaBtn = btns.find(function(b) { return b.textContent && b.textContent.trim() === 'Semua'; });
        // Cek chip "Semua" terlihat (kontrol tidak menghilang)
        var semuaVisible = semuaBtn ? semuaBtn.getBoundingClientRect().width > 0 : false;
        // Cek nilai localStorage setelah validasi (seharusnya direvert ke 'all' atau tetap fake tapi UI tetap tampil)
        var storedAsset = localStorage.getItem('artha:chart:asset');
        return {
          cardPresent: !!card,
          semuaVisible: semuaVisible,
          storedAsset: storedAsset,
          detail: 'card=' + !!card + ' semuaVisible=' + semuaVisible + ' stored=' + storedAsset
        };
      })()`) as { cardPresent: boolean; semuaVisible: boolean; storedAsset: string | null; detail: string }

      check('InvestChart: localStorage fake asset id → kartu tetap tampil', ls.cardPresent, ls.detail)
      check('InvestChart: localStorage fake asset id → chip "Semua" masih terlihat', ls.semuaVisible, ls.detail)
      await p.close()
    }

    // ── InvestmentChart: area grafik tidak pernah tinggi 0, path SVG tanpa NaN ──
    for (const w of [390, 768, 1440]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 900 })
      await p.goto(`${BASE}/#inv`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(500)

      const hr = await p.evaluate(`(function() {
        var card = document.querySelector('[data-testid="investment-chart"]');
        if (!card) return { heightOk: false, noZeroSvg: true, noNanPath: true, detail: 'kartu tidak ditemukan' };
        // Kontainer area grafik: div position:relative dengan tinggi ~240px
        var divs = Array.from(card.querySelectorAll('div'));
        var areaDiv = null;
        for (var i = 0; i < divs.length; i++) {
          var s = window.getComputedStyle(divs[i]);
          var h = divs[i].getBoundingClientRect().height;
          if (s.position === 'relative' && h >= 200) { areaDiv = divs[i]; break; }
        }
        var containerH = areaDiv ? areaDiv.getBoundingClientRect().height : 0;
        // SVG non-dekoratif harus punya lebar > 0 bila ada
        var svgs = Array.from(card.querySelectorAll('svg:not([aria-hidden])'));
        var zeroWSvgs = svgs.filter(function(sv) { return sv.getBoundingClientRect().width <= 0; });
        // Path tidak boleh mengandung NaN
        var paths = Array.from(card.querySelectorAll('svg path[d]'));
        var nanPaths = paths.filter(function(pth) { return (pth.getAttribute('d') || '').indexOf('NaN') >= 0; });
        return {
          heightOk: containerH >= 200,
          noZeroSvg: zeroWSvgs.length === 0,
          noNanPath: nanPaths.length === 0,
          detail: 'containerH=' + Math.round(containerH) + ' zeroSvgs=' + zeroWSvgs.length + ' nanPaths=' + nanPaths.length
        };
      })()`) as { heightOk: boolean; noZeroSvg: boolean; noNanPath: boolean; detail: string }

      check(`InvestChart-render ${w}px: area grafik tinggi >= 200px (tidak runtuh)`, hr.heightOk, hr.detail)
      check(`InvestChart-render ${w}px: tidak ada SVG non-dekoratif dengan lebar 0`, hr.noZeroSvg, hr.detail)
      check(`InvestChart-render ${w}px: path SVG tidak mengandung NaN`, hr.noNanPath, hr.detail)
      await p.close()
    }

    // ── InvestmentChart: tangkapan empty state palet A/B terang/gelap ──
    mkdirSync(resolve(QA_DIR, '..', 'empty-state'), { recursive: true })
    {
      for (const pal of ['a', 'b'] as const) {
        for (const mod of ['light', 'dark'] as const) {
          const p = await browser.newPage()
          await p.setViewportSize({ width: 390, height: 700 })
          await p.goto(`${BASE}/#inv`)
          await p.evaluate(`(function(pal, m) {
            localStorage.setItem('artha:palette', pal);
            localStorage.setItem('artha:mode', m);
          })('${pal}', '${mod}')`)
          await p.reload()
          await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
          await p.waitForTimeout(400)
          const card = await p.$('[data-testid="investment-chart"]')
          if (card) {
            await card.screenshot({ path: resolve(QA_DIR, '..', 'empty-state', `invest-empty-${pal}-${mod}-390.png`) })
          }
          await p.close()
        }
      }
    }

    // ── WAJIB LOLOS: Tidak ada scroll horizontal di semua halaman ──────────────
    for (const w of [360, 390, 768, 820, 1024, 1440]) {
      for (const tab of ['home', 'tx', 'inv', 'rec', 'set', 'lap']) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: 700 })
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(400)

        const r = await p.evaluate(`(function(vw) {
          var sw = document.documentElement.scrollWidth;
          return { ok: sw <= vw + 1, scrollW: sw };
        })(${w})`) as { ok: boolean; scrollW: number }

        check(`WAJIB: tidak ada scroll horizontal #${tab} di ${w}px`, r.ok,
          `scrollWidth=${r.scrollW} > ${w}`)
        await p.close()
      }
    }

    // ── WAJIB LOLOS: Tidak ada elemen right > lebar viewport ───────────────────
    for (const w of [360, 390]) {
      for (const tab of ['home', 'tx', 'inv', 'rec', 'set']) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: 700 })
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(400)

        const r = await p.evaluate(`(function(vw) {
          var overflow = [];
          var all = Array.from(document.querySelectorAll('body *'));
          for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var style = window.getComputedStyle(el);
            // Skip hidden, absolute/fixed (menu), overflow:scroll/auto containers
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (style.position === 'fixed' || style.position === 'absolute') continue;
            var ovX = style.overflowX;
            if (ovX === 'scroll' || ovX === 'auto') continue;
            var rect = el.getBoundingClientRect();
            if (rect.right > vw + 2 && rect.width > 0 && rect.height > 0) {
              overflow.push(el.tagName + '.' + (el.className||'').toString().slice(0,30) + ' right=' + Math.round(rect.right));
            }
          }
          return { ok: overflow.length === 0, detail: overflow.slice(0, 3).join(' | ') };
        })(${w})`) as { ok: boolean; detail: string }

        check(`WAJIB: tidak ada elemen right > ${w}px di #${tab}`, r.ok, r.detail)
        await p.close()
      }
    }

    // ── WAJIB LOLOS: Semua elemen interaktif minimal 44×44px di <1024px ────────
    for (const w of [360, 390]) {
      for (const tab of ['home', 'tx', 'inv', 'rec', 'set']) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: 700 })
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(400)

        const r = await p.evaluate(`(function() {
          var small = [];
          var sel = 'button:not([disabled]), a[href], input, select, [role="checkbox"], [role="tab"]';
          var els = Array.from(document.querySelectorAll(sel));
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            // Skip link: elemen aksesibilitas keyboard saja, bukan target sentuh
            if (el.classList.contains('skip-link')) continue;
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            // Skip elemen di dalam dialog tertutup
            var dlg = el.closest('dialog');
            if (dlg && !dlg.hasAttribute('open')) continue;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.width < 43 || rect.height < 43) {
              small.push(el.tagName + '[' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,20) + '] ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
            }
          }
          return { ok: small.length === 0, count: small.length, detail: small.slice(0, 5).join(' | ') };
        })()`) as { ok: boolean; count: number; detail: string }

        check(`WAJIB: elemen interaktif >=44px di #${tab} ${w}px (${r.count} pelanggaran)`, r.ok, r.detail)
        await p.close()
      }
    }

    // ── WAJIB LOLOS: Tidak ada teks terpotong (ellipsis overflow) di 360/390px ─
    for (const w of [360, 390]) {
      for (const tab of ['home', 'tx', 'inv', 'rec', 'set']) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: 700 })
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(400)

        const r = await p.evaluate(`(function() {
          var clipped = [];
          // Angka dan label penting: elemen dengan font-family mono (angka) atau teks pendek bukan nav
          var candidates = Array.from(document.querySelectorAll('[style*="text-overflow"], .num-lg, .num-hero, .num-md'));
          for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
              clipped.push('"' + (el.textContent||'').trim().slice(0,20) + '" scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth);
            }
          }
          return { ok: clipped.length === 0, detail: clipped.slice(0, 3).join(' | ') };
        })()`) as { ok: boolean; detail: string }

        check(`WAJIB: tidak ada teks terpotong di #${tab} ${w}px`, r.ok, r.detail)
        await p.close()
      }
    }

    // ── WAJIB LOLOS: Tidak ada font-size < 12px (sumbu grafik dan tab bar 11px OK) ─
    for (const w of [390, 1440]) {
      for (const tab of ['home', 'tx', 'inv', 'rec', 'set']) {
        const p = await browser.newPage()
        await p.setViewportSize({ width: w, height: 700 })
        await p.goto(`${BASE}/#${tab}`)
        await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
        await p.waitForTimeout(400)

        const r = await p.evaluate(`(function() {
          var small = [];
          // Ambil semua elemen non-SVG yang terlihat
          var els = Array.from(document.querySelectorAll('body *:not(svg):not(svg *)'));
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (el.children.length > 0) continue; // hanya leaf node
            var fs = parseFloat(style.fontSize);
            // Izinkan 11px untuk anak [aria-label="Navigasi bawah"] (tab bar) dan kartu chart
            if (fs < 11.5) {
              var inTabBar = !!el.closest('[aria-label="Navigasi bawah"]');
              var inChart = !!el.closest('[data-testid="investment-chart"], [data-testid="card-bar"]');
              if (!inTabBar && !inChart) {
                small.push('"' + (el.textContent||'').trim().slice(0,20) + '" fs=' + Math.round(fs) + ' tag=' + el.tagName.toLowerCase());
              }
            }
          }
          return { ok: small.length === 0, count: small.length, detail: small.slice(0, 5).join(' | ') };
        })()`) as { ok: boolean; count: number; detail: string }

        check(`WAJIB: tidak ada font < 12px di #${tab} ${w}px (${r.count} pelanggaran)`, r.ok, r.detail)
        await p.close()
      }
    }

    // ── Toggle kunci mode: ada, terlihat, dan 44x44px di Settings ───────────────
    for (const w of [360, 390]) {
      const p = await browser.newPage()
      await p.setViewportSize({ width: w, height: 700 })
      await p.goto(`${BASE}/#set`)
      await p.waitForSelector('[data-testid="shell-ready"]', { timeout: 8000 }).catch(() => {})
      await p.waitForTimeout(400)

      const r = await p.evaluate(`(function() {
        var toggle = document.querySelector('[data-testid="mode-lock-toggle"]');
        if (!toggle) return { ok: false, detail: 'toggle mode-lock-toggle tidak ditemukan' };
        var rect = toggle.getBoundingClientRect();
        var visible = rect.width > 0 && rect.height > 0 && rect.top >= 0;
        var areaOk = rect.width >= 44 && rect.height >= 44;
        var hasRole = toggle.getAttribute('role') === 'switch';
        var hasAria = toggle.hasAttribute('aria-checked');
        return {
          ok: visible && areaOk && hasRole && hasAria,
          detail: 'w=' + Math.round(rect.width) + ' h=' + Math.round(rect.height) + ' role=' + toggle.getAttribute('role') + ' aria-checked=' + toggle.getAttribute('aria-checked')
        };
      })()`) as { ok: boolean; detail: string }

      check(`Settings ${w}px: toggle kunci mode ada, 44x44px, role=switch`, r.ok, r.detail)
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
