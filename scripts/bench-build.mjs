/**
 * Bench-build (SC-005, FR-020, quickstart §5).
 *
 * Times `vitepress build` WITH the idn plugin vs. a plugin-less baseline on a
 * generated ~140-page Indonesian source set (SC-005 is specified "up to 500
 * pages": on a 6-page fixture the plugin's fixed costs dominate the ratio).
 * Asserts plugin overhead <= 20% (best-of-2 after one warm-up build).
 *
 * Also builds with `minIndexSizeWarningMB: 0.0001` and asserts the
 * oversized-index warning is emitted (FR-020, quickstart §5.4).
 *
 * VitePress has no `--config` override (config is always
 * `<root>/.vitepress/config.ts`), so variants temporarily swap the fixture's
 * config.ts / theme/index.ts and restore them in all cases.
 *
 * Exit code 0 = both checks green. Run: npm run bench
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const site = join(root, 'playground')
const vitepressBin = join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js')
const configPath = join(site, '.vitepress', 'config.ts')
const themePath = join(site, '.vitepress', 'theme', 'index.ts')
const benchSrc = join(site, '.bench-src')
const srcIndex = join(root, 'src', 'index.ts')
const srcVue = join(root, 'src', 'vue.ts')
const nodeEntry = join(root, 'src', 'node', 'index.ts')

/** ~500 pages of natural Indonesian prose (SC-005 is specified up to 500). */
const PAGE_COUNT = 500

// A fixed pool of natural Indonesian sentences, shuffled per page. Real prose
// follows a Zipfian word distribution, so the stemming cache sees heavy reuse;
// the pathological 100%-unique-token case is not representative of a site.
const PROSE = [
  'Pemerintah mempercepat pembangunan infrastruktur di seluruh daerah.',
  'Pelaksanaan pembangunan harus mempertimbangkan kepentingan masyarakat.',
  'Percepatan pertumbuhan ekonomi menjadi prioritas utama tahun ini.',
  'Banyak perusahaan berupaya mempertahankan produk unggulannya.',
  'Anak-anak berlari menuju lapangan untuk bermain sepak bola.',
  'Ibu menyapu lantai setiap pagi sebelum berangkat bekerja.',
  'Pengembangan keterampilan menjadi kunci keberhasilan karier.',
  'Kami mengharapkan perlindungan terhadap hak-hak pekerja.',
  'Penyelenggaraan pemilihan umum berjalan dengan lancar dan aman.',
  'Ketidaktahuan masyarakat tentang aturan baru membutuhkan sosialisasi.',
  'Setiap warga negara wajib mempertanggungjawabkan perbuatannya.',
  'Menurut catatan, penggunaan teknologi meningkat setiap tahun.',
  'Sekolah menyediakan berbagai fasilitas untuk mendukung pembelajaran.',
  'Penelitian menunjukkan bahwa pola makan sehat memengaruhi kesehatan.',
  'Pemerintah menetapkan kebijakan baru untuk melindungi lingkungan.',
  'Perusahaan mulai menerapkan sistem kerja yang lebih fleksibel.',
  'Beberapa pakar menyampaikan pendapat tentang perkembangan ekonomi.',
  'Kegiatan gotong royong mempererat hubungan antarwarga masyarakat.',
  'Produk lokal semakin diminati oleh konsumen dalam negeri.',
  'Pendidikan karakter ditanamkan sejak usia dini di lingkungan keluarga.',
  'Koperasi membantu anggota dalam memperoleh modal usaha kecil.',
  'Laporan keuangan menunjukkan peningkatan penjualan yang signifikan.',
  'Tim dokter melakukan pemeriksaan kesehatan secara berkala.',
  'Pemerintah daerah menyusun rencana pembangunan jangka menengah.',
  'Masyarakat diimbau untuk menjaga kebersihan lingkungan sekitar.',
  'Kemajuan teknologi digital mengubah cara orang berkomunikasi.',
  'Berbagai program pelatihan diselenggarakan untuk meningkatkan kualitas.',
  'Perkembangan kota perlu diimbangi dengan ketersediaan ruang terbuka.',
  'Sektor pariwisata menyumbang pendapatan yang besar bagi wilayah.',
  'Setiap keputusan diambil berdasarkan pertimbangan yang matang.',
  'Petani memanfaatkan teknologi untuk meningkatkan hasil panennya.',
  'Mahasiswa melakukan penelitian mengenai dampak perubahan iklim.',
]

function generateSource() {
  rmSync(benchSrc, { recursive: true, force: true })
  mkdirSync(benchSrc, { recursive: true })
  for (let i = 0; i < PAGE_COUNT; i++) {
    const shuffled = [...PROSE].sort(() => Math.random() - 0.5)
    const body = Array.from({ length: 4 }, (_, para) => shuffled.slice(para * 8, para * 8 + 8).join('\n'))
    const md = `# Bagian ${i}\n\n${body.join('\n\n')}\n\n## Detail ${i}\n\nPerincian tambahan untuk bagian ${i}.\n`
writeFileSync(join(benchSrc, `page-${String(i).padStart(3, '0')}.md`), md)
  }
}

const ALIASES = `resolve: {
      alias: [
        { find: /^vitepress-plugin-idn\\/vue$/, replacement: ${JSON.stringify(srcVue)} },
        { find: /^vitepress-plugin-idn$/, replacement: ${JSON.stringify(srcIndex)} },
      ],
    }`

// The fixture's custom theme mounts <AuthorUtils/>, which imports the
// plugin's Search.vue and therefore requires its virtual modules. Only the
// WITHOUT variant (no plugin) needs a plain default-theme to stay buildable.
const DEFAULT_THEME = `import DefaultTheme from 'vitepress/theme'

export default DefaultTheme
`

const WITHOUT = `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'en',
  cleanUrls: true,
  srcDir: ${JSON.stringify(benchSrc)},
  vite: { ${ALIASES} },
})
`

const WITH = `import { defineConfig } from 'vitepress'
import { idnPlugin } from ${JSON.stringify(nodeEntry)}

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'en',
  cleanUrls: true,
  srcDir: ${JSON.stringify(benchSrc)},
  vite: {
    plugins: [idnPlugin({ hyphenate: { enabled: true, minWordLength: 6 } })],
    ${ALIASES},
  },
})
`

const WARN = `import { defineConfig } from 'vitepress'
import { idnPlugin } from ${JSON.stringify(nodeEntry)}

export default defineConfig({
  title: 'IdnTest',
  description: 'Fixture site for vitepress-plugin-idn',
  lang: 'en',
  cleanUrls: true,
  vite: {
    // 0.0001 MB ~= 105 B threshold -> the fixture index always trips it.
    plugins: [idnPlugin({ minIndexSizeWarningMB: 0.0001 })],
    ${ALIASES},
  },
})
`

const variants = [
  ['without', WITHOUT, true],
  ['with', WITH, false],
  ['warn', WARN, false],
]

function buildVariant(name, source, neutralizeTheme) {
  writeFileSync(configPath, source)
  if (neutralizeTheme) writeFileSync(themePath, DEFAULT_THEME)
  const start = performance.now()
  const res = spawnSync(process.execPath, [vitepressBin, 'build', site], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
  })
const ms = performance.now() - start
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
  if (neutralizeTheme) writeFileSync(themePath, originalTheme)
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`build variant '${name}' failed (${res.status})\n${output}`)
  return { ms, output }
}

/** Warm-up once, then best-of-2 (least affected by CPU/OS noise). */
function bestTime(name, source, neutralizeTheme) {
  buildVariant(name, source, neutralizeTheme)
  let best = Infinity
  for (let i = 0; i < 2; i++) {
    const { ms } = buildVariant(name, source, neutralizeTheme)
    if (ms < best) best = ms
  }
  return best
}

const original = readFileSync(configPath, 'utf8')
const originalTheme = readFileSync(themePath, 'utf8')
let failed = false
try {
  generateSource()

  const baseline = bestTime(variants[0][0], variants[0][1], variants[0][2])
  const withPlugin = bestTime(variants[1][0], variants[1][1], variants[1][2])
  const overhead = (withPlugin - baseline) / baseline
  const ok = overhead <= 0.2
  if (!ok) failed = true
  console.log(
    `[bench] pages=${PAGE_COUNT} baseline=${(baseline / 1000).toFixed(1)}s ` +
      `with-plugin=${(withPlugin / 1000).toFixed(1)}s ` +
      `overhead=${(overhead * 100).toFixed(1)}% (${ok ? 'PASS' : 'FAIL'} <=20%, SC-005)`,
  )

  const warnRun = buildVariant(variants[2][0], variants[2][1], variants[2][2])
  const sawWarning =
    warnRun.output.includes('Serialized search index is') && warnRun.output.toLowerCase().includes('warning')
  if (!sawWarning) {
    failed = true
    console.error('[bench] oversized-index warning NOT emitted (FR-020)')
  } else {
    const line = warnRun.output.split(/\r?\n/).find((l) => l.includes('Serialized search index is'))
    console.log(`[bench] oversized-index warning emitted (FR-020): ${line ?? ''}`)
  }
} catch (err) {
  failed = true
  console.error(err instanceof Error ? err.message : String(err))
} finally {
  writeFileSync(configPath, original)
  writeFileSync(themePath, originalTheme)
  rmSync(benchSrc, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
