import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const output = path.resolve('android/build/endpoint-tests')
mkdirSync(output, { recursive: true })
const javaRoot = process.env.DS_ANDROID_JAVA_HOME || process.env.JAVA_HOME
const run = (tool, args) => {
  const command = javaRoot
    ? path.join(javaRoot, 'bin', `${tool}${process.platform === 'win32' ? '.exe' : ''}`)
    : tool
  const result = spawnSync(command, args, { stdio: 'inherit' })
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
  '-d',
  output,
  'android/src/com/chatdemo/deepseek/android/ApiEndpoint.java',
  'android/tests/ApiEndpointTest.java',
])
run('java', ['-cp', output, 'ApiEndpointTest'])
