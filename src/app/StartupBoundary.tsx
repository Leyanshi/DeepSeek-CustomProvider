import { Component, type ReactNode } from 'react'

/** A render failure must leave a visible, recoverable page. */
export class StartupBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }
    const version = navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '未知'
    return (
      <div
        role="alert"
        style={{
          padding: 28,
          color: '#222',
          background: '#fff',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <h2>页面未能启动</h2>
        <p>WebView 内核：{version}</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {error.message.slice(0, 500)}
        </pre>
        <p>请重试，或把错误详情反馈给开发者。重试不会删除聊天记录。</p>
        <button type="button" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    )
  }
}
