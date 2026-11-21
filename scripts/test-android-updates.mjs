import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const output = path.resolve('android/build/update-tests')
mkdirSync(output, { recursive: true })
const javaRoot = process.env.DS_ANDROID_JAVA_HOME || process.env.JAVA_HOME
const run = (tool, args) => {
  const command = javaRoot
    ? path.join(javaRoot, 'bin', `${tool}${process.platform === 'win32' ? '.exe' : ''}`)
    : tool
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
run('javac', [
  '-encoding',
  'UTF-8',
  '--release',
  '8',
  '-d',
  output,
  'android/src/com/chatdemo/deepseek/android/ReleaseUpdate.java',
  'android/tests/ReleaseUpdateTest.java',
])
run('java', ['-cp', output, 'ReleaseUpdateTest'])
