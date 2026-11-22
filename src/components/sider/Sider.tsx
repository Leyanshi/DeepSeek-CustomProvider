import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSettingsOutline16,
  IconSearchOutline16,
  IconCloseOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import { useChatSearch } from './useChatSearch.js'
import deepseekLogo from '../../../resources/deepseek.svg'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [query, setQuery] = useState('')
  const search = useChatSearch(query, sessions, t('untitledChat'))
  const [now, setNow] = useState(Date.now)
  const groups = useMemo(() => groupSessions(sessions, now, t), [sessions, now, t])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <img
          className={styles.appLogo}
          src={deepseekLogo}
          alt={t('appName')}
          width={32}
          height={32}
        />
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <div className={styles.search}>
        <IconSearchOutline16 />
        <input
          type="search"
          aria-label={t('chatSearchPlaceholder')}
          placeholder={t('chatSearchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
        {query ? (
          <IconButton
            icon={<IconCloseOutline16 />}
            aria-label={t('chatSearchClear')}
            onClick={() => setQuery('')}
          />
        ) : null}
      </div>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {search.active ? (
            <>
              <div
                className={styles.searchStatus}
                role="status"
                aria-label={t('chatSearchPlaceholder')}
              >
                {t(
                  search.error
                    ? 'chatSearchFailed'
                    : search.pending
                      ? 'chatSearchPending'
                      : search.total
                        ? 'chatSearchCount'
                        : 'chatSearchEmpty',
                  { count: search.total }
                )}
              </div>
              {search.error ? (
                <Button size="m" onClick={search.retry}>
                  {t('retry')}
                </Button>
              ) : null}
              {!search.error &&
                search.results.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    excerpt={session.excerpt}
                    active={session.id === activeId}
                    onDelete={() => setDeleting(session)}
                  />
                ))}
              {!search.pending && search.results.length < search.total ? (
                <Button size="m" onClick={search.more}>
                  {t('chatSearchMore')}
                </Button>
              ) : null}
            </>
          ) : (
            groups.map((group) => (
              <div key={group.key} className={styles.section}>
                <div className={styles.sectionHeader}>{group.label}</div>
                {group.sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                    onDelete={() => setDeleting(session)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** Both layouts keep their content until the closing transition completes. */
const useSiderContent = (open: boolean) => {
  const [rendered, setRendered] = useState(open)
  useEffect(() => {
    if (open) {
      setRendered(true)
      return
    }
    // Match the 300 ms CSS transition; reopening cancels this pending unmount.
    const timer = setTimeout(() => setRendered(false), 300)
    return () => clearTimeout(timer)
  }, [open])
  return open || rendered
}

/** 宽屏侧栏始终保留外层，收起时让会话内容和主区域一起平滑移动。 */
export const DesktopSider = ({ collapsed }: { collapsed: boolean }) => {
  const rendered = useSiderContent(!collapsed)
  return (
    <div
      data-sider-layout="docked"
      aria-hidden={collapsed}
      className={clsx(styles.docked, !collapsed && styles.dockedOpen)}
    >
      <div className={styles.dockedContent}>{rendered ? <Sider /> : null}</div>
    </div>
  )
}

/** 保留抽屉外层以播放进出过渡，退出结束后卸载会话列表。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  const rendered = useSiderContent(open)
  return (
    <>
      <div
        data-android-back={open ? '' : undefined}
        aria-hidden="true"
        className={clsx(styles.drawerMask, open && styles.drawerOpen)}
        onClick={closeMobileSider}
      />
      <div
        data-sider-layout="drawer"
        aria-hidden={!open}
        className={clsx(styles.drawer, open && styles.drawerOpen)}
      >
        {rendered ? <Sider mobile /> : null}
      </div>
    </>
  )
}
