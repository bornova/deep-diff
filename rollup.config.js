import * as fs from 'fs'

import terser from '@rollup/plugin-terser'

fs.rmSync('lib', { recursive: true, force: true })
fs.rmSync('types', { recursive: true, force: true })

const pkg = JSON.parse(fs.readFileSync('./package.json'))
const banner = `/* ${pkg.name} v${pkg.version} */`

const baseConfig = {
  input: 'src/index.js'
}

const nodeConfig = {
  ...baseConfig,
  output: [
    { format: 'cjs', file: 'lib/cjs/index.cjs' },
    { format: 'esm', file: 'lib/esm/index.mjs' }
  ]
}

const browserConfig = {
  ...baseConfig,
  output: [
    {
      format: 'iife',
      file: 'lib/browser/deep-diff.min.js',
      name: 'DeepDiff',
      plugins: [terser({ format: { preamble: banner } })],
      sourcemap: true
    }
  ]
}

export default [nodeConfig, browserConfig]
