/* Runs before the app bundle, using syntax older Android WebViews can parse. */
;(function () {
  function define(target, name, value) {
    if (typeof target[name] !== 'function') {
      Object.defineProperty(target, name, { value: value, configurable: true, writable: true })
    }
  }
  function fail(message) {
    var state = document.getElementById('startup-state')
    if (!state) {
      return
    }
    document.getElementById('startup-title').textContent = '页面未能启动'
    var version = navigator.userAgent.match(/Chrome\/([\d.]+)/)
    document.getElementById('startup-detail').textContent =
      'WebView 内核：' + (version ? version[1] : '未知') + '\n' + String(message).slice(0, 500)
    document.getElementById('startup-help').textContent =
      '可以先重试。若仍无法启动，请复制错误详情反馈；重试不会删除聊天记录。'
    document.getElementById('startup-retry').hidden = false
    if (window.DeepSeekAndroid && typeof window.DeepSeekAndroid.startupFailed === 'function') {
      window.DeepSeekAndroid.startupFailed(String(message).slice(0, 500))
    }
  }
  // Install diagnostics before any compatibility work can throw.
  window.addEventListener(
    'error',
    function (event) {
      if (event.message) {
        fail(event.message)
      } else if (event.target && event.target.tagName === 'SCRIPT') {
        fail('页面脚本未能加载：' + String(event.target.src).split('/').pop())
      }
    },
    true
  )
  window.addEventListener('unhandledrejection', function (event) {
    fail(event.reason && event.reason.message ? event.reason.message : event.reason)
  })
  setTimeout(function () {
    fail('启动超时，页面脚本未能完成加载。')
  }, 12000)
  document.getElementById('startup-retry').onclick = function () {
    location.reload()
  }

  try {
    define(Object, 'hasOwn', function (object, key) {
      return Object.prototype.hasOwnProperty.call(object, key)
    })
    define(Array.prototype, 'at', function (index) {
      var position = Number(index) || 0
      position = position < 0 ? Math.ceil(position) : Math.floor(position)
      if (position < 0) {
        position += this.length
      }
      return position < 0 || position >= this.length ? undefined : this[position]
    })
    define(Array.prototype, 'toSorted', function (compare) {
      return Array.from(this).sort(compare)
    })
    define(Array.prototype, 'toReversed', function () {
      return Array.from(this).reverse()
    })
    var media = Object.getPrototypeOf(window.matchMedia('(min-width: 0px)'))
    define(media, 'addEventListener', function (type, listener) {
      if (type === 'change') {
        this.addListener(listener)
      }
    })
    define(media, 'removeEventListener', function (type, listener) {
      if (type === 'change') {
        this.removeListener(listener)
      }
    })
  } catch (error) {
    fail(error && error.message ? error.message : error)
  }
})()
