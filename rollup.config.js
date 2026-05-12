import * as fs from 'fs'

import terser from '@rollup/plugin-terser'

fs.rmSync('dist', { recursive: true, force: true })

const pkg = JSON.parse(fs.readFileSync('./package.json'))
const banner = `/* ${pkg.name} v${pkg.version} */`
const input = 'src/index.js'

const esmConfig = {
  input,
  output: [
    {
      format: 'esm',
      file: 'dist/esm/index.js',
      plugins: [
        terser({ compress: false, mangle: false, format: { beautify: true, comments: false, preamble: banner } })
      ]
    }
  ]
}

const browserConfig = {
  input,
  output: [
    {
      format: 'iife',
      file: 'dist/browser/deep-diff.js',
      name: 'DeepDiff',
      plugins: [terser({ compress: false, mangle: false, format: { beautify: true, preamble: banner } })]
    },
    {
      format: 'iife',
      file: 'dist/browser/deep-diff.min.js',
      name: 'DeepDiff',
      plugins: [terser({ format: { preamble: banner } })],
      sourcemap: true
    }
  ]
}

export default [esmConfig, browserConfig]
